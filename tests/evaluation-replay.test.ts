import { expect, it } from 'vitest';
import { replayDialogue } from '../lib/evaluation-replay';
import { createEmptyBrief, type Message } from '../lib/state';

it.each(['rules', 'model', 'formbridge'] as const)('replays %s over identical customer prefixes and accounts for repeated calls', async mode => {
  const messages: Message[] = [
    { id: 'm1', speaker: 'customer', text: 'Four guests' },
    { id: 'm2', speaker: 'staff', text: 'At seven?' },
    { id: 'm3', speaker: 'customer', text: 'Yes, but five guests' },
    { id: 'm4', speaker: 'staff', text: 'Thanks' },
  ];
  const prefixes: string[][] = [];
  const result = await replayDialogue(messages, mode, async (_mode, prefix, current) => {
    prefixes.push(prefix.map(m => m.id));
    const brief = createEmptyBrief(); brief.revision = current.revision + 1;
    brief.fields.partySize = { value: prefix.length === 1 ? '4' : '5', status: 'resolved', constraint: null, evidenceIds: [], source: 'model', note: '' };
    return { brief, latencyMs: 10, warning: prefix.length === 3 ? 'Repair failed' : undefined,
      usage: mode === 'rules' ? null : { inputTokens: 20, outputTokens: 10, model: prefix.length === 1 ? 'primary + repair' : 'primary' } };
  });
  expect(prefixes).toEqual([['m1'], ['m1', 'm2', 'm3']]);
  expect(result.brief.fields.partySize.value).toBe('5');
  expect(result.brief.revision).toBe(2);
  expect(result.analysisRequests).toBe(2);
  expect(result.latencyMs).toBe(20);
  expect(result.providerRequests).toBe(mode === 'rules' ? 0 : 4);
  expect(result.usage?.inputTokens ?? 0).toBe(mode === 'rules' ? 0 : 40);
  expect(result.turns).toHaveLength(2);
});
