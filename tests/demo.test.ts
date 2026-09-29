import { describe, expect, it } from 'vitest';
import { demoBrief, demoMessages } from '../lib/demo';

describe('interactive demo', () => {
  it('starts from an evidence-linked unresolved booking', () => {
    expect(demoMessages).toHaveLength(2);
    expect(demoBrief.fields.restaurantName.value).toBe('Ember House');
    expect(demoBrief.fields.partySize.value).toBe('5');
    expect(demoBrief.fields.time.value).toBeNull();
    expect(demoBrief.fields.time.status).toBe('needs_clarification');
    expect(demoBrief.fields.time.evidenceIds).toEqual(['m2']);
  });
});
