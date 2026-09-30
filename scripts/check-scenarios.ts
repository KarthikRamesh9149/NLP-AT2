import { mkdir, writeFile } from 'node:fs/promises';
import { scenarios, type ExpectedField, type Scenario } from '../evaluation/scenarios';
import { createEmptyBrief, type Brief, type FieldKey, type Message } from '../lib/state';

interface ApiResult { brief: Brief; usage?: { inputTokens: number; outputTokens: number; model: string } | null }
const endpoint = process.env.FORMBRIDGE_URL ?? 'http://localhost:3000';
const tag = process.argv.find((x) => x.startsWith('--tag='))?.slice(6) ?? new Date().toISOString().replace(/[:.]/g, '-');
if (!/^[a-zA-Z0-9_-]+$/.test(tag)) throw new Error('Invalid run tag.');
const concurrency = Number(process.argv.find((x) => x.startsWith('--concurrency='))?.slice(14) ?? 3);
const pace = Number(process.argv.find((x) => x.startsWith('--pace='))?.slice(7) ?? 0);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3 || !Number.isFinite(pace) || pace < 0 || pace > 5000) throw new Error('Use concurrency 1–3 and pace 0–5000 ms.');
const selectedIds = new Set(process.argv.slice(2).filter((x) => !x.startsWith('--')));
const chosen = selectedIds.size ? scenarios.filter((scenario) => selectedIds.has(scenario.id)) : scenarios;

function normalise(value: string | null | undefined, field: FieldKey): string {
  if (!value) return '';
  let text = value.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
  if (field === 'partySize') {
    const words: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6' };
    return words[text] ?? text;
  }
  if (field === 'date') {
    const dated = text.match(/^(\d{1,2}) (january|february|march|april|may|june|july|august|september|october|november|december) (\d{4})$/);
    if (dated) {
      const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      return `${dated[3]}-${String(months.indexOf(dated[2]) + 1).padStart(2, '0')}-${dated[1].padStart(2, '0')}`;
    }
    return text;
  }
  if (field === 'time') {
    text = text.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:am|pm)\b)/g, (_, hour: string, minutes: string) => {
      const numeric = Number(hour);
      const clockHour = numeric % 12 || 12;
      return `${clockHour}${minutes === '00' ? '' : `:${minutes}`} ${numeric < 12 ? 'am' : 'pm'}`;
    });
    text = text.replace(/\s*(am|pm)\b/g, ' $1').replace(/\s+/g, ' ').trim();
  }
  return text;
}

function checkField(actual: Brief['fields'][FieldKey], expected: ExpectedField, field: FieldKey): string | null {
  if (actual.status !== expected.status) return `${field}: status ${actual.status}, expected ${expected.status}`;
  if (normalise(actual.value, field) !== normalise(expected.value, field)) return `${field}: value ${JSON.stringify(actual.value)}, expected ${JSON.stringify(expected.value)}`;
  if (expected.status === 'needs_clarification' && !actual.constraint) return `${field}: missing uncertainty constraint`;
  if (expected.constraint && actual.constraint && !normalise(actual.constraint, field).includes(normalise(expected.constraint, field))) {
    return `${field}: constraint ${JSON.stringify(actual.constraint)}, expected to include ${JSON.stringify(expected.constraint)}`;
  }
  return null;
}

async function checkScenario(scenario: Scenario) {
  let brief = createEmptyBrief();
  const visible: Message[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let model = '';
  const errors: string[] = [];
  for (const message of scenario.messages) {
    visible.push(message);
    if (message.speaker === 'staff') continue;
    if (pace) await new Promise((resolve) => setTimeout(resolve, pace));
    const response = await fetch(`${endpoint}/api/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.FORMBRIDGE_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.FORMBRIDGE_BYPASS_SECRET } : {}) },
      body: JSON.stringify({ mode: 'formbridge', messages: visible, brief, referenceDate: scenario.referenceDate ?? null }),
    });
    const result = (await response.json()) as ApiResult & { error?: string };
    if (!response.ok) { errors.push(`HTTP ${response.status}: ${result.error ?? 'unknown error'}`); break; }
    brief = result.brief;
    inputTokens += result.usage?.inputTokens ?? 0;
    outputTokens += result.usage?.outputTokens ?? 0;
    model = result.usage?.model ?? model;
  }
  for (const [field, expected] of Object.entries(scenario.expected) as [FieldKey, ExpectedField][]) {
    const error = checkField(brief.fields[field], expected, field);
    if (error) errors.push(error);
  }
  const knownIds = new Set(scenario.messages.map((message) => message.id));
  for (const [field, state] of Object.entries(brief.fields) as [FieldKey, Brief['fields'][FieldKey]][]) {
    if (state.value && state.source === 'model' && (!state.evidenceIds.length || state.evidenceIds.some((id) => !knownIds.has(id)))) {
      errors.push(`${field}: missing or invalid evidence`);
    }
  }
  return { id: scenario.id, title: scenario.title, category: scenario.category, passed: errors.length === 0, errors, fields: brief.fields, usage: { inputTokens, outputTokens, model } };
}

async function main() {
  if (!chosen.length) throw new Error('No matching scenario IDs.');
  const results: Awaited<ReturnType<typeof checkScenario>>[] = [];
  // A few concurrent conversations keep the run practical without flooding the API.
  for (let i = 0; i < chosen.length; i += concurrency) {
    const batch = await Promise.all(chosen.slice(i, i + concurrency).map(checkScenario));
    for (const result of batch) {
      results.push(result);
      process.stdout.write(`${result.passed ? 'PASS' : 'FAIL'} ${result.id} ${result.title}${result.errors.length ? ` — ${result.errors.join('; ')}` : ''}\n`);
    }
  }
  const report = {
    generatedAt: new Date().toISOString(), endpoint, model: results.find((r) => r.usage.model)?.usage.model ?? null,
    type: 'team-authored synthetic regression scenarios; not an SGD benchmark',
    total: results.length, passed: results.filter((r) => r.passed).length,
    usage: { inputTokens: results.reduce((n, r) => n + r.usage.inputTokens, 0), outputTokens: results.reduce((n, r) => n + r.usage.outputTokens, 0) },
    results,
  };
  await mkdir('evaluation/results', { recursive: true });
  const path = new URL(endpoint).hostname === 'localhost' ? `evaluation/results/live-scenarios-${tag}.json` : `evaluation/results/live-scenarios-deployed-${tag}.json`;
  await writeFile(path, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(`\n${report.passed}/${report.total} passed. Saved ${path}\n`);
  if (report.passed !== report.total) process.exitCode = 1;
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
