import { describe, expect, it } from 'vitest';
import { demoBrief, demoMessages } from '../lib/demo';
import { restoreSession } from '../lib/session';
import { createEmptyBrief } from '../lib/state';

describe('browser draft restoration', () => {
  const example = JSON.stringify({ messages: demoMessages, brief: demoBrief });

  it('starts empty on a new visit or after the old automatic example', () => {
    expect(restoreSession(null, null)).toBeNull();
    expect(restoreSession(null, example)).toBeNull();
  });

  it('preserves a visitor-created draft from the previous storage key', () => {
    const draft = { messages: [{ id: 'custom-1', speaker: 'customer' as const, text: 'A table for two, please.' }], brief: createEmptyBrief() };
    expect(restoreSession(null, JSON.stringify(draft))).toEqual(draft);
  });

  it('preserves an explicitly loaded example from the new storage key', () => {
    expect(restoreSession(example, null)).toEqual({ messages: demoMessages, brief: demoBrief });
  });

  it('ignores damaged storage', () => {
    expect(restoreSession('{', '{')).toBeNull();
  });
});
