import { describe, expect, it } from 'vitest';
import { parseTranscript } from '../lib/transcript';
describe('conversation paste', () => {
  it('preserves roles, order, and multiline messages', () => {
    expect(parseTranscript('Customer: Four for dinner\nAt 7 pm.\nStaff: Would 8 work?\nCustomer: Yes please')).toEqual([
      { speaker: 'customer', text: 'Four for dinner\nAt 7 pm.' }, { speaker: 'staff', text: 'Would 8 work?' }, { speaker: 'customer', text: 'Yes please' },
    ]);
  });
  it('accepts a plain customer enquiry and common transcript speaker names', () => {
    expect(parseTranscript('A table for four.')).toEqual([{ speaker: 'customer', text: 'A table for four.' }]);
    expect(parseTranscript('USER: Four\nASSISTANT: At seven?\nGuest: Yes')).toHaveLength(3);
  });
  it('rejects empty, oversized, staff-only and ambiguous mixed transcripts', () => {
    for (const raw of ['', 'Customer: ', 'x'.repeat(1001), 'Staff: 8 pm?', 'Booking\nCustomer: Four', Array.from({ length: 31 }, () => 'Customer: Four').join('\n')]) {
      expect(() => parseTranscript(raw)).toThrow();
    }
  });
});
