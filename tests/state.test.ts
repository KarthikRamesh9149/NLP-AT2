import { describe, expect, it } from 'vitest';
import { applyManualEdit, applyProposals, createEmptyBrief } from '../lib/state';

describe('booking state', () => {
  it('supersedes a party size without changing the date', () => {
    const initial = createEmptyBrief();
    const first = applyProposals(initial, [
      { field: 'partySize', operation: 'set', value: '4', status: 'resolved', evidenceIds: ['m1'], note: '' },
      { field: 'date', operation: 'set', value: '9 October 2026', status: 'resolved', evidenceIds: ['m1'], note: '' },
    ], [{ id: 'm1', speaker: 'customer', text: 'Four people on 9 October 2026' }]);
    const next = applyProposals(first, [
      { field: 'partySize', operation: 'replace', value: '5', status: 'resolved', evidenceIds: ['m2'], note: '' },
    ], [{ id: 'm1', speaker: 'customer', text: 'Four people on 9 October 2026' }, { id: 'm2', speaker: 'customer', text: 'Actually five' }]);
    expect(next.fields.partySize.value).toBe('5');
    expect(next.fields.date.value).toBe('9 October 2026');
    expect(next.history).toContainEqual(expect.objectContaining({ field: 'partySize', previousValue: '4', nextValue: '5' }));
  });

  it('leaves exact time unresolved when a range replaces it', () => {
    const messages = [{ id: 'm1', speaker: 'customer' as const, text: 'At 7 pm' }, { id: 'm2', speaker: 'customer' as const, text: 'After 8 instead' }];
    const atSeven = applyProposals(createEmptyBrief(), [
      { field: 'time', operation: 'set', value: '7 pm', status: 'resolved', evidenceIds: ['m1'], note: '' },
    ], messages);
    const afterEight = applyProposals(atSeven, [
      { field: 'time', operation: 'constrain', value: 'after 8 pm', status: 'needs_clarification', evidenceIds: ['m2'], note: 'Exact time is unknown' },
    ], messages);
    expect(afterEight.fields.time.value).toBeNull();
    expect(afterEight.fields.time.constraint).toBe('after 8 pm');
    expect(afterEight.fields.time.status).toBe('needs_clarification');
  });

  it('rejects nonexistent evidence rather than fabricating a field', () => {
    const next = applyProposals(createEmptyBrief(), [
      { field: 'partySize', operation: 'set', value: '5', status: 'resolved', evidenceIds: ['unknown'], note: '' },
    ], [{ id: 'm1', speaker: 'customer', text: 'Table for five' }]);
    expect(next.fields.partySize.value).toBeNull();
  });

  it('rejects a stale model update that does not cite the latest customer turn', () => {
    const next = applyProposals(createEmptyBrief(), [
      { field: 'partySize', operation: 'set', value: '4', status: 'resolved', evidenceIds: ['m1'], note: '' },
    ], [
      { id: 'm1', speaker: 'customer', text: 'Four people' },
      { id: 'm2', speaker: 'customer', text: 'Actually five people' },
    ]);
    expect(next.fields.partySize.value).toBeNull();
  });

  it('preserves a staff-reviewed field when a later model proposal disagrees', () => {
    const reviewed = applyManualEdit(createEmptyBrief(), 'partySize', '6');
    const next = applyProposals(reviewed, [{ field: 'partySize', operation: 'replace', value: '7', status: 'resolved', evidenceIds: ['m1'], note: '' }], [{ id: 'm1', speaker: 'customer', text: 'Actually seven people' }]);
    expect(next.fields.partySize.value).toBe('6');
    expect(next.fields.partySize.source).toBe('staff');
  });
});
