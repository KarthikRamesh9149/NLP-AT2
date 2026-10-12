import { digitWords } from './temporal';

interface GuestGroup { start: number; end: number; total: number; parts: number; exact: boolean }
const guestQuantity = /\b(\d{1,2})\s+(?:people|persons?|guests?|diners?|adults?|children|child|kids?|toddlers?|infants?|bab(?:y|ies)|of us)\b/g;
const labelledQuantity = /\b(?:the\s+)?(?:number of (?:people|guests|diners)|party size|guest count)\s*(?:is|will be|:|=)\s*(\d{1,2})\b/g;
const additive = /^\s*(?:,\s*(?:and\s+)?|and\s+|plus\s+|\+\s*|with\s+)$/;
const alternative = /^\s*,?\s*(?:or|to|-)\s*(?:maybe\s*)?$/;
const uncertainPrefix = /\b(?:not|no|don't|do not|maybe|possibly|perhaps|around|about|approximately|at least|at most|between)\s*(?:(?:for|book|reserve|have|we(?:'re| are| will be|'ll be)|there(?: will be|'ll be| are)|it(?: will be|'ll be)|(?:a|the) table for|a party of|a group of)\s*)*$/;

function groupsIn(text: string): GuestGroup[] {
  const quantities = [...text.matchAll(guestQuantity)];
  const labels = [...text.matchAll(labelledQuantity)].filter(label => {
    const numberIndex = label.index + label[0].lastIndexOf(label[1]);
    // Count "party size is two adults and three children" as a complete
    // additive group, rather than accepting the labelled subset of two.
    return !quantities.some(quantity => numberIndex >= quantity.index && numberIndex < quantity.index + quantity[0].length);
  });
  const parts = [...quantities, ...labels].sort((a, b) => a.index - b.index);
  const groups: GuestGroup[] = [];
  for (const part of parts) {
    const start = part.index; const end = start + part[0].length;
    const previous = groups.at(-1);
    const prefix = text.slice(0, start).split(/[.!?;]|\b(?:but|instead|actually)\b/).at(-1) || '';
    const exact = !uncertainPrefix.test(prefix)
      && !/\b\d{1,2}\s*(?:or|to|-)\s*$/.test(prefix)
      && !/^\s*(?:or|to|-)\s*\d{1,2}\b/.test(text.slice(end));
    if (previous && additive.test(text.slice(previous.end, start))) {
      previous.end = end; previous.total += Number(part[1]); previous.parts += 1; previous.exact &&= exact;
    } else {
      const competing = previous && alternative.test(text.slice(previous.end, start));
      if (competing) previous.exact = false;
      const included = previous && /^\s*,?\s*(?:including|of (?:whom|which|them)|with (?:those|these) being)\b/.test(text.slice(previous.end, start));
      groups.push({ start, end, total: Number(part[1]), parts: 1, exact: exact && !included && !competing });
    }
  }
  return groups;
}

export function hasGuestCountContext(source: string): boolean {
  return groupsIn(digitWords(source)).some(group => group.exact && group.total > 0 && group.total <= 30);
}

// Validate a model-proposed total. This does not extract a missing count or
// infer who belongs to the party. Every summed component must be quoted.
export function hasGuestCountEvidence(value: string, quote: string, source: string, exact: boolean): boolean {
  const text = digitWords(source); const quoted = digitWords(quote);
  return groupsIn(text).some(group => group.total === Number(value) && (!exact || group.exact)
    && (group.parts > 1 ? quoted.includes(text.slice(group.start, group.end)) : new RegExp(`\\b${value}\\b`).test(quoted)));
}

// A phrase such as "for two adults and three children" cannot justify two
// guests through the shorter "for two" pattern.
export function guestCountInsideGroup(value: string, source: string, matchStart: number, matchEnd: number, exact: boolean): boolean {
  const text = digitWords(source);
  return groupsIn(text).some(group => group.start < matchEnd && group.end > matchStart
    && (group.total !== Number(value) || (exact && !group.exact)));
}
