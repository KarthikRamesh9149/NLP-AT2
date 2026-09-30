import { describe, expect, it } from 'vitest';
import { fieldMatches } from '../lib/evaluation-match';

describe('representation-independent value matching', () => {
  it('matches equivalent dates and written times', () => {
    expect(fieldMatches('March 3rd', ['3rd of March'], 'date')).toBe(true);
    expect(fieldMatches('9 October 2026', ['2026-10-09'], 'date')).toBe(true);
    expect(fieldMatches('5:30 pm', ['half past five in the evening'], 'time')).toBe(true);
    expect(fieldMatches('1 pm', ['13:00'], 'time')).toBe(true);
  });
  it('keeps missing years, ambiguous periods and distinct venues distinct', () => {
    expect(fieldMatches('March 3rd', ['3 March 2026'], 'date')).toBe(false);
    expect(fieldMatches('12:30', ['12:30 pm'], 'time')).toBe(false);
    expect(fieldMatches('Cafe North', ['Cafe South'], 'restaurantName')).toBe(false);
    expect(fieldMatches('today', ['tomorrow'], 'date')).toBe(false);
  });
});
