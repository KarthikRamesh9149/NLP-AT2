import { clockTime, digitWords } from './temporal';

const clockExpression = /\b(?:(?:(?:half past|(?:a )?quarter (?:past|to))\s+)?\d{1,2}(?:[:.]\d{2})?(?:\s+o['’]?clock)?\s*(?:[ap]\.?m\.?|(?:in the |at )?(?:morning|afternoon|evening|night))|[ap]\.?m\.?\s*\d{1,2}(?::\d{2})?|\d{1,2}[:.]\d{2}|noon|midnight)\b/g;
const qualifier = /\b(?:after|before|around|about|approximately|maybe|perhaps|possibly|from|between|until|later than|earlier than|rather than|instead of|as opposed to|anything but|not|no|don't|do not)\s*(?:(?:at|exactly|book|reserve|set|want|it|for)\s*)*$/;
const rangeEnd = /\b(?:between|from)\s+\d{1,2}(?::\d{2})?(?:\s*[ap]\.?m\.?)?\s+(?:and|to|until)\s*$/;
const competingClock = /^\s*,?\s*(?:or|and|to|until|through|-)\s*(?:at\s*)?$/;

export function hasClockEvidence(value: string, quote: string): boolean {
  return [...digitWords(quote).matchAll(clockExpression)].some(match => clockTime(match[0]) === clockTime(value));
}

export function hasExactTimeEvidence(value: string, source: string): boolean {
  const text = digitWords(source);
  const clocks = [...text.matchAll(clockExpression)].filter(match => clockTime(match[0]));
  return clocks.some((match, index) => {
    if (clockTime(match[0]) !== clockTime(value)) return false;
    const prefix = text.slice(0, match.index).split(/[;!?\n]|\.(?:\s+|$)|\b(?:but|instead|actually)\b/).at(-1) || '';
    if (qualifier.test(prefix) || rangeEnd.test(prefix)) return false;
    const previous = clocks[index - 1]; const next = clocks[index + 1];
    const end = match.index + match[0].length;
    if (previous && competingClock.test(text.slice(previous.index + previous[0].length, match.index))) return false;
    if (next && competingClock.test(text.slice(end, next.index))) return false;
    // An alternative may omit its period: "7 pm or 8" is still unresolved.
    return !/^\s*(?:or|to|until)\s+\d{1,2}\b/.test(text.slice(end));
  });
}
