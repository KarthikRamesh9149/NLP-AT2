import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadEligible, type EligibleDialogue } from './sgd';
import { createEmptyBrief, FIELD_KEYS, type Brief, type FieldKey, type Message } from '../lib/state';
import type { Mode } from '../lib/engine';

const dir = process.env.SGD_DIR ?? process.argv[2];
const sampleArg = process.argv.find((argument) => argument.startsWith('--sample='));
const sampleSize = sampleArg ? Number(sampleArg.split('=')[1]) : 20;
const splitArg = process.argv.find((argument) => argument.startsWith('--split='));
const split = (splitArg?.split('=')[1] ?? 'test') as 'dev' | 'test';
const endpoint = process.env.FORMBRIDGE_URL ?? 'http://localhost:3000';
const seed = 'formbridge-sgd-evaluation-v1';

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
  const response = await fetch(`${endpoint}/api/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, messages, brief, referenceDate: null }),
  });
  const body = await response.json() as { brief: Brief; usage: { inputTokens: number; outputTokens: number; model: string } | null; error?: string };
  if (!response.ok) throw new Error(`${mode} HTTP ${response.status}: ${body.error ?? 'unknown error'}`);
  return { ...body, latencyMs: Math.round(performance.now() - start) };
}

async function predict(dialogue: EligibleDialogue, mode: Mode) {
  if (mode !== 'formbridge') return call(mode, dialogue.messages, createEmptyBrief());
  let brief = createEmptyBrief();
  let inputTokens = 0; let outputTokens = 0; let latencyMs = 0; let model = '';
  for (let index = 0; index < dialogue.messages.length; index += 1) {
    if (dialogue.messages[index].speaker === 'staff') continue;
    const step = await call(mode, dialogue.messages.slice(0, index + 1), brief);
    brief = step.brief;
    inputTokens += step.usage?.inputTokens ?? 0;
    outputTokens += step.usage?.outputTokens ?? 0;
    latencyMs += step.latencyMs;
    model = step.usage?.model ?? model;
  }
  return { brief, usage: { inputTokens, outputTokens, model }, latencyMs };
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
  return { completeFormExact: exact, fields };
}

async function main() {
  if (!dir) throw new Error('Pass the official SGD checkout path: pnpm eval /path/to/dstc8-schema-guided-dialogue --split=test --sample=20');
  if (!['dev', 'test'].includes(split) || !Number.isInteger(sampleSize) || sampleSize < 1) throw new Error('Use --split=dev|test and a positive --sample count.');
  const source = await loadEligible(dir, split);
  const eligible = source.eligible.filter((dialogue) => dialogue.messages.length <= 30);
  const chosen = eligible.sort((a, b) => createHash('sha256').update(`${seed}:${a.id}`).digest('hex').localeCompare(createHash('sha256').update(`${seed}:${b.id}`).digest('hex'))).slice(0, sampleSize);
  if (chosen.length < sampleSize) throw new Error(`Only ${chosen.length} eligible dialogues are available.`);
  const results: Array<{ id: string; gold: EligibleDialogue['gold']; predictions: Partial<Record<Mode, unknown>>; errors: string[] }> = [];
  for (const dialogue of chosen) {
    const entry: (typeof results)[number] = { id: dialogue.id, gold: dialogue.gold, predictions: {}, errors: [] };
    for (const mode of ['rules', 'model', 'formbridge'] as const) {
      try {
        const prediction = await predict(dialogue, mode);
        entry.predictions[mode] = { ...score(dialogue, prediction.brief), brief: prediction.brief, usage: prediction.usage, latencyMs: prediction.latencyMs };
      } catch (error) { entry.errors.push(`${mode}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    results.push(entry);
    process.stdout.write(`${results.length}/${chosen.length} ${dialogue.id}${entry.errors.length ? ` — ${entry.errors.join('; ')}` : ''}\n`);
  }
  const summary = Object.fromEntries((['rules', 'model', 'formbridge'] as const).map((mode) => {
    const predictions = results.map((entry) => entry.predictions[mode]).filter(Boolean) as Array<{ completeFormExact: boolean; fields: Record<FieldKey, { gold: string[]; predicted: string | null; match: boolean }>; usage: { inputTokens: number; outputTokens: number } | null; latencyMs: number }>;
    const total = predictions.length * FIELD_KEYS.length;
    const correct = predictions.reduce((sum, prediction) => sum + FIELD_KEYS.filter((field) => prediction.fields[field].match).length, 0);
    return [mode, { dialogues: predictions.length, fieldAccuracy: total ? correct / total : null, completeFormAccuracy: predictions.length ? predictions.filter((prediction) => prediction.completeFormExact).length / predictions.length : null, totalInputTokens: predictions.reduce((sum, prediction) => sum + (prediction.usage?.inputTokens ?? 0), 0), totalOutputTokens: predictions.reduce((sum, prediction) => sum + (prediction.usage?.outputTokens ?? 0), 0), meanLatencyMs: predictions.length ? Math.round(predictions.reduce((sum, prediction) => sum + prediction.latencyMs, 0) / predictions.length) : null }];
  }));
  const report = { generatedAt: new Date().toISOString(), source: 'Google Schema-Guided Dialogue', split, service: split === 'test' ? 'Restaurants_2' : 'Restaurants_2', selectionSeed: seed, sampleSize: chosen.length, selectedIds: chosen.map((dialogue) => dialogue.id), scope: 'Single-service ReserveRestaurant; final user-turn five-field state; strict value matching with basic normalisation; not full official SGD benchmark', model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini-2025-04-14', summary, results };
  await mkdir('evaluation/results', { recursive: true });
  const path = `evaluation/results/sgd-${split}-${sampleSize}.json`;
  await writeFile(path, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(`Saved ${path}\n${JSON.stringify(summary, null, 2)}\n`);
  if (results.some((entry) => entry.errors.length)) process.exitCode = 1;
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
