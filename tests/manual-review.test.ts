import { describe, expect, it } from 'vitest';
import { applyManualEdit, createEmptyBrief } from '../lib/state';
import { restoreSession } from '../lib/session';

describe('staff review and persistence', () => {
  it('rejects invalid dates and clocks before staff approval', () => {
    expect(() => applyManualEdit(createEmptyBrief(), 'date', '31 February 2026')).toThrow();
    expect(() => applyManualEdit(createEmptyBrief(), 'time', '25:99')).toThrow();
    expect(() => applyManualEdit(createEmptyBrief(), 'time', '7')).toThrow();
  });
  it('normalises a manual date and time, while a missing year still needs an answer', () => {
    const date = applyManualEdit(createEmptyBrief(), 'date', '2026-10-09');
    expect(date.fields.date.value).toBe('9 October 2026');
    const partial = applyManualEdit(date, 'date', 'March 3rd');
    expect(partial.fields.date.status).toBe('needs_clarification');
    expect(applyManualEdit(date, 'time', '19:30').fields.time.value).toBe('7:30 pm');
    expect(applyManualEdit(date, 'partySize', ' 5 ').fields.partySize.value).toBe('5');
  });
  it('restores the reference date and unfinished update, rejects damaged field data', () => {
    const session = { messages: [{ id: 'm1', speaker: 'customer', text: 'Tomorrow' }], brief: createEmptyBrief(), referenceDate: '2026-10-01', pendingAnalysis: true };
    expect(restoreSession(JSON.stringify(session), null)).toEqual(session);
    expect(restoreSession(JSON.stringify({ ...session, referenceDate: '2026-02-30' }), null)).toBeNull();
    expect(restoreSession(JSON.stringify({ ...session, brief: { fields: { time: {} } } }), null)).toBeNull();
  });
});
