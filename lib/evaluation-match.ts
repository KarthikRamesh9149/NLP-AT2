import type { FieldKey } from './state';
import { calendarDate, cleanText, clockTime, digitWords } from './temporal';

// A representation check, not a fuzzy similarity score. No missing date part,
// time period or venue token is inferred to make a prediction match a label.
export function canonicalField(value: string, field: FieldKey): string {
  if (field === 'date') {
    const date = calendarDate(value);
    if (date) return `${date.year ?? 'unknown'}-${date.month}-${date.day}`;
  }
  if (field === 'time') {
    const clock = clockTime(value);
    if (clock) return clock;
  }
  if (field === 'partySize') return digitWords(value);
  return cleanText(value).replace(/[.,']/g, '').replace(/\s+/g, ' ').trim();
}
export function fieldMatches(value: string | null, gold: string[], field: FieldKey): boolean {
  if (!gold.length) return value === null;
  return value !== null && gold.some((variant) => canonicalField(value, field) === canonicalField(variant, field));
}
