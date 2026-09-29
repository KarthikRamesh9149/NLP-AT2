import { describe, expect, it } from 'vitest';
import { runRules } from '../lib/rules';

describe('rule baseline', () => {
  it('tracks a correction and leaves an after-eight preference unresolved', () => {
    const brief = runRules([
      { id: 'm1', speaker: 'customer', text: 'A table for four on 9 October 2026 at 7 pm.' },
      { id: 'm2', speaker: 'customer', text: 'Actually, make that five people and sometime after eight.' },
    ]);
    expect(brief.fields.partySize.value).toBe('5');
    expect(brief.fields.time.value).toBeNull();
    expect(brief.fields.time.constraint).toMatch(/after 8/i);
  });

  it('uses a staff proposal only after customer acceptance', () => {
    const messages = [
      { id: 'm1', speaker: 'staff' as const, text: 'Would 8:30 pm suit you?' },
      { id: 'm2', speaker: 'customer' as const, text: 'Yes, that works.' },
    ];
    expect(runRules(messages.slice(0, 1)).fields.time.value).toBeNull();
    const brief = runRules(messages);
    expect(brief.fields.time.value).toBe('8:30 pm');
    expect(brief.fields.time.evidenceIds).toEqual(['m1', 'm2']);
  });
});
