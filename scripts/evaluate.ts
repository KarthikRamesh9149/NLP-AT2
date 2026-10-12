import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { loadEligible, type EligibleDialogue } from './sgd';
import { createEmptyBrief, FIELD_KEYS, type Brief, type FieldKey, type Message } from '../lib/state';
import { EXTRACTION_VERSION, formbridgeModel } from '../lib/ai';
import { fieldMatches } from '../lib/evaluation-match';
import { analyzeConversation, type Mode } from '../lib/engine';
import { replayDialogue } from '../lib/evaluation-replay';

const dir = process.env.SGD_DIR ?? process.argv[2];
const sampleArg = process.argv.find((argument) => argument.startsWith('--sample='));
const sampleSize = sampleArg ? Number(sampleArg.split('=')[1]) : 20;
const splitArg = process.argv.find((argument) => argument.startsWith('--split='));
const split = (splitArg?.split('=')[1] ?? 'test') as 'dev' | 'test';
const endpoint = process.env.FORMBRIDGE_URL ?? 'http://localhost:3000';
const arg = (name: string) => process.argv.find((x) => x.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const transport = arg('transport') ?? 'http';
const replay = arg('replay') ?? 'all-user-turns';
const selectionPath = arg('selection');
const seed = arg('seed') ?? 'formbridge-sgd-evaluation-v1';
const tag = arg('tag') ?? new Date().toISOString().replace(/[:.]/g, '-');
if (!/^[a-zA-Z0-9_-]+$/.test(tag)) throw new Error('Invalid run tag.');
const modes = (arg('modes') ?? 'rules,model,formbridge').split(',') as Mode[];
if (!modes.length || modes.some((m) => !['rules', 'model', 'formbridge'].includes(m))) throw new Error('Invalid modes.');
const excludePath = arg('exclude');
const excludedIds = new Set<string>(excludePath ? JSON.parse(await readFile(excludePath, 'utf8')).selectedIds : []);

function normalise(raw: string, field: FieldKey): string {
  let value = raw.toLowerCase().trim().replace(/[.,']/g, '').replace(/\s+/g, ' ');
  if (field === 'partySize') {
    const words: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8' };
    return words[value] ?? value;
  }
  if (field === 'date') {
    const dayMonthYear = value.match(/^(\d{1,2})(?:st|nd|rd|th)? (january|february|march|april|may|june|july|august|september|october|november|december) (\d{4})$/);
    if (dayMonthYear) {
      const month = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(dayMonthYear[2]) + 1;
      return `${dayMonthYear[3]}-${String(month).padStart(2, '0')}-${dayMonthYear[1].padStart(2, '0')}`;
    }
  }
  if (field === 'time') {
    value = value.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:am|pm)\b)/g, (_, hour: string, minutes: string) => `${Number(hour) % 12 || 12}${minutes === '00' ? '' : `:${minutes}`} ${Number(hour) < 12 ? 'am' : 'pm'}`);
    value = value.replace(/\b(\d{1,2}):00\s*(am|pm)\b/g, '$1 $2').replace(/\s*(am|pm)\b/g, ' $1').replace(/\s+/g, ' ').trim();
  }
  return value;
}

async function call(mode: Mode, messages: Message[], brief: Brief) {
  const start = performance.now();
  if (transport === 'in-process') {
    const result = await analyzeConversation(messages, brief, mode, null);
    return { ...result, latencyMs: Math.round(performance.now() - start) };
  }
  const response = await fetch(`${endpoint}/api/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, messages, brief, referenceDate: null }),
  });
  const body = await response.json() as { brief: Brief; usage: { inputTokens: number; outputTokens: number; model: string } | null; error?: string; warning?: string };
  if (!response.ok) throw new Error(`${mode} HTTP ${response.status}: ${body.error ?? 'unknown error'}`);
  return { ...body, latencyMs: Math.round(performance.now() - start) };
}

async function predict(dialogue: EligibleDialogue, mode: Mode) {
  if (replay === 'legacy' && mode !== 'formbridge') return call(mode, dialogue.messages, createEmptyBrief());
  return replayDialogue(dialogue.messages, mode, call);
}

function score(dialogue: EligibleDialogue, brief: Brief) {
  let exact = true;
  const fields = {} as Record<FieldKey, { gold: string[]; predicted: string | null; match: boolean }>;
  for (const field of FIELD_KEYS) {
    const gold = dialogue.gold[field] ?? [];
    const predicted = brief.fields[field].value;
    const match = gold.length === 0 ? predicted === null : predicted !== null && gold.some((variant) => normalise(variant, field) === normalise(predicted, field));
    fields[field] = { gold, predicted, match };
    if (!match) exact = false;
  }
  const canonicalFields = Object.fromEntries(FIELD_KEYS.map((key) => [key, { ...fields[key], match: fieldMatches(fields[key].predicted, fields[key].gold, key) }]));
  return { completeFormExact: exact, fields, canonicalFields, canonicalFormExact: FIELD_KEYS.every((key) => canonicalFields[key].match) };
}

async function fingerprint() { return createHash('sha256').update((await Promise.all(['lib/ai.ts', 'lib/engine.ts', 'lib/grounding.ts', 'lib/party-evidence.ts', 'lib/time-evidence.ts', 'lib/temporal.ts', 'lib/booking-intent.ts', 'lib/cancellation-status.ts', 'lib/state.ts', 'lib/evaluation-match.ts'].map((p) => readFile(p, 'utf8')))).join('\n')).digest('hex'); }

async function main() {
  if (!['http', 'in-process'].includes(transport) || !['all-user-turns', 'legacy'].includes(replay)) throw new Error('Invalid transport or replay policy.');
  if (!dir) throw new Error('Pass the official SGD checkout path: pnpm eval /path/to/dstc8-schema-guided-dialogue --split=test --sample=20');
  if (!['dev', 'test'].includes(split) || !Number.isInteger(sampleSize) || sampleSize < 1) throw new Error('Use --split=dev|test and a positive --sample count.');
  const source = await loadEligible(dir, split);
  const eligible = source.eligible.filter((dialogue) => dialogue.messages.length <= 30 && !excludedIds.has(dialogue.id));
  let chosen = eligible.sort((a, b) => createHash('sha256').update(`${seed}:${a.id}`).digest('hex').localeCompare(createHash('sha256').update(`${seed}:${b.id}`).digest('hex'))).slice(0, sampleSize);
  if (selectionPath) {
    const selection = JSON.parse(await readFile(selectionPath, 'utf8')) as { split?: string; selectedIds: string[] };
    if (selection.split !== split || selection.selectedIds.length !== sampleSize || new Set(selection.selectedIds).size !== sampleSize) throw new Error('Selection split, count or unique IDs do not match this run.');
    chosen = selection.selectedIds.map(id => { const dialogue = eligible.find(d => d.id === id); if (!dialogue) throw new Error(`Selected dialogue ${id} is not eligible.`); return dialogue; });
  }
  if (chosen.length < sampleSize) throw new Error(`Only ${chosen.length} eligible dialogues are available.`);
  const codeFingerprint = await fingerprint();
  const runnerFingerprint = createHash('sha256').update(await readFile('scripts/evaluate.ts', 'utf8')).update(await readFile('lib/evaluation-replay.ts', 'utf8')).digest('hex');
  const configuration = { baseline: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini-2025-04-14', formbridge: formbridgeModel(), repair: process.env.FORMBRIDGE_REPAIR_MODEL ?? 'gpt-6.1-sol' };
  await mkdir('evaluation/results', { recursive: true });
  await writeFile(`evaluation/results/selection-${tag}.json`, JSON.stringify({ seed, split, selectedIds: chosen.map((d) => d.id), excludedIds: [...excludedIds], codeFingerprint, runnerFingerprint, extractionVersion: EXTRACTION_VERSION, configuration, transport, replay, selectionPath, modes }, null, 2) + '\n', { flag: 'wx' });
  const results: Array<{ id: string; gold: EligibleDialogue['gold']; predictions: Partial<Record<Mode, unknown>>; errors: string[] }> = [];
  async function evaluateDialogue(dialogue: EligibleDialogue) {
    const entry: (typeof results)[number] = { id: dialogue.id, gold: dialogue.gold, predictions: {}, errors: [] };
    for (const mode of modes) {
      try {
        const prediction = await predict(dialogue, mode);
        entry.predictions[mode] = { ...score(dialogue, prediction.brief), ...prediction };
      } catch (error) { entry.errors.push(`${mode}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return entry;
  }
  for (let i = 0; i < chosen.length; i += 3) {
    for (const entry of await Promise.all(chosen.slice(i, i + 3).map(evaluateDialogue))) {
      results.push(entry);
      await writeFile(`evaluation/results/progress-${tag}.json`, JSON.stringify({ codeFingerprint, configuration, results }, null, 2) + '\n');
      process.stdout.write(`${results.length}/${chosen.length} ${entry.id}${entry.errors.length ? ` — ${entry.errors.join('; ')}` : ''}\n`);
    }
  }
  const summary = Object.fromEntries(modes.map((mode) => {
    const predictions = results.map((entry) => entry.predictions[mode]).filter(Boolean) as Array<{ completeFormExact: boolean; canonicalFormExact: boolean; canonicalFields: Record<FieldKey, { match: boolean }>; fields: Record<FieldKey, { gold: string[]; predicted: string | null; match: boolean }>; usage: { inputTokens: number; outputTokens: number } | null; latencyMs: number; analysisRequests?: number; providerRequests?: number }>;
    const total = chosen.length * FIELD_KEYS.length;
    const correct = predictions.reduce((sum, prediction) => sum + FIELD_KEYS.filter((field) => prediction.fields[field].match).length, 0);
    return [mode, { dialogues: predictions.length, attemptedDialogues: chosen.length, failures: chosen.length - predictions.length, fieldAccuracy: total ? correct / total : null, canonicalFieldAccuracy: total ? predictions.reduce((sum, p) => sum + FIELD_KEYS.filter((key) => p.canonicalFields[key].match).length, 0) / total : null, canonicalCompleteFormAccuracy: predictions.filter((p) => p.canonicalFormExact).length / chosen.length, completeFormAccuracy: predictions.length ? predictions.filter((prediction) => prediction.completeFormExact).length / chosen.length : null, totalAnalysisRequests: predictions.reduce((sum, p) => sum + (p.analysisRequests ?? 1), 0), totalProviderRequests: predictions.reduce((sum, p) => sum + (p.providerRequests ?? (p.usage ? 1 : 0)), 0), totalInputTokens: predictions.reduce((sum, prediction) => sum + (prediction.usage?.inputTokens ?? 0), 0), totalOutputTokens: predictions.reduce((sum, prediction) => sum + (prediction.usage?.outputTokens ?? 0), 0), meanLatencyMs: predictions.length ? Math.round(predictions.reduce((sum, prediction) => sum + prediction.latencyMs, 0) / predictions.length) : null }];
  }));
  const report = { generatedAt: new Date().toISOString(), source: 'Google Schema-Guided Dialogue', split, service: split === 'test' ? 'Restaurants_2' : 'Restaurants_2', selectionSeed: seed, excludedIds: [...excludedIds], extractionVersion: EXTRACTION_VERSION, codeFingerprint, runnerFingerprint, transport, replay, sampleSize: chosen.length, selectedIds: chosen.map((dialogue) => dialogue.id), scope: 'Single-service ReserveRestaurant; final user-turn five-field state; strict value matching with basic normalisation; not full official SGD benchmark', model: configuration, accounting: 'Latency includes all repeated calls and bounded repair attempts. Returned token usage excludes unreported usage for failed calls; no invoice or total account-spend claim.', summary, results };
  if (await fingerprint() !== codeFingerprint) throw new Error('Extraction source changed during evaluation; this run is invalid.');
  const path = `evaluation/results/sgd-${split}-${sampleSize}-${tag}.json`;
  await writeFile(path, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(`Saved ${path}\n${JSON.stringify(summary, null, 2)}\n`);
  if (results.some((entry) => entry.errors.length)) process.exitCode = 1;
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
