import { expect, it, vi } from 'vitest';
import { createEmptyBrief, FIELD_KEYS } from '../lib/state';
vi.mock('../lib/ai', () => ({ extractFullState: vi.fn(), extractGroundedState: vi.fn() }));
import { extractGroundedState } from '../lib/ai';
import { analyzeConversation } from '../lib/engine';
it('keeps validated extraction when a bounded second check times out', async () => {
  const state = Object.fromEntries(FIELD_KEYS.map((k) => [k, { value: null, status: 'missing', constraint: null, evidence: [] }])) as unknown as Awaited<ReturnType<typeof extractGroundedState>>['state'];
  state.city = { value: 'Sydney', status: 'resolved', constraint: null, evidence: [{ id: 'm1', quote: 'Sydney', kind: 'value' }] };
  state.partySize = { value: '5', status: 'resolved', constraint: null, evidence: [{ id: 'm1', quote: 'four', kind: 'value' }] };
  vi.mocked(extractGroundedState).mockResolvedValueOnce({ state, usage: { inputTokens: 100, outputTokens: 80, model: 'test-model' } }).mockRejectedValueOnce(new Error('Timeout'));
  const result = await analyzeConversation([{ id: 'm1', speaker: 'customer', text: 'Four in Sydney' }], createEmptyBrief(), 'formbridge', null);
  expect(result.brief.fields.city.value).toBe('Sydney');
  expect(result.brief.fields.partySize.value).toBeNull();
  expect(result.warning).toContain('another check');
  expect(extractGroundedState).toHaveBeenCalledTimes(2);
});
