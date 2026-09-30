import { calendarDate, cleanText, clockTime, digitWords, relativeDate } from './temporal';
import { FIELD_KEYS, type Brief, type FieldKey, type FieldState, type FieldStatus, type Message } from './state';

export interface Evidence { id: string; quote: string; kind?: 'value' | 'acceptance' | 'context' }
export interface GroundedField { value: string | null; status: FieldStatus; constraint: string | null; evidence: Evidence[] }
export type GroundedState = Record<FieldKey, GroundedField>;

function containsValue(field: FieldKey, value: string, quote: string, reference: string | null): boolean {
  if (field === 'partySize') return new RegExp(`\\b${value}\\b`).test(digitWords(quote));
  if (field === 'date') {
    const candidate = calendarDate(value); const source = calendarDate(quote);
    if (candidate && source) return candidate.month === source.month && candidate.day === source.day && (!candidate.year || candidate.year === source.year);
    if (candidate && relativeDate(quote, reference)) return calendarDate(relativeDate(quote, reference)!)?.value === candidate.value;
  }
  if (field === 'time' && clockTime(value) && clockTime(quote)) return clockTime(value) === clockTime(quote);
  return cleanText(quote).includes(cleanText(value));
}
export function isAcceptance(text: string): boolean {
  return /\b(yes|yeah|yep|confirm|confirmed|exactly|correct|right|perfect|works|sounds good|sounds great|sounds like a good choice|that is exactly what I want|that's it|that is it|good|great|excellent|sure|go ahead|good for me|that works|that is good|that's good|fine|okay|ok|please book|please reserve|book (?:it|that|this|me|us|a table|the table)|reserve (?:it|that|this|a table|the table))\b/i.test(text)
    && !/\b(no|not|don't|doesn't|won't|reject|cancel)\b/i.test(text);
}
function acceptedEvidence(evidence: Evidence): boolean {
  if (isAcceptance(evidence.quote)) return true;
  return evidence.kind === 'acceptance' && !/\b(no|not|don't|doesn't|won't|reject|cancel)\b/i.test(evidence.quote);
}
function checkedEvidence(field: GroundedField, messages: Message[]): Evidence[] | null {
  if (field.evidence.length > 12) return null;
  const seen = new Set<string>();
  for (const evidence of field.evidence) {
    const message = messages.find((m) => m.id === evidence.id);
    if (seen.has(evidence.id) || !message || !evidence.quote.trim() || !cleanText(message.text).includes(cleanText(evidence.quote))) return null;
    seen.add(evidence.id);
  }
  return field.evidence;
}

function composedDateSupported(value: string, evidence: Evidence[], messages: Message[]): boolean {
  const candidate = calendarDate(value);
  if (!candidate) return false;
  const usable = evidence.filter((e) => {
    const index = messages.findIndex((m) => m.id === e.id);
    if (messages[index]?.speaker === 'customer') return true;
    return evidence.some((a) => messages.findIndex((m) => m.id === a.id) > index && messages.find((m) => m.id === a.id)?.speaker === 'customer' && acceptedEvidence(a));
  }).sort((a, b) => messages.findIndex((m) => m.id === a.id) - messages.findIndex((m) => m.id === b.id));
  const anchors = usable.map((e) => ({ e, date: calendarDate(e.quote) })).filter((x) => x.date !== null);
  const anchor = anchors.at(-1);
  if (!anchor?.date || anchor.date.month !== candidate.month) return false;
  const anchorIndex = messages.findIndex((m) => m.id === anchor.e.id);
  let day = anchor.date.day; let year = anchor.date.year;
  for (const e of usable) {
    if (messages.findIndex((m) => m.id === e.id) <= anchorIndex) continue;
    const dayAnswer = e.quote.match(/\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i);
    if (dayAnswer) day = Number(dayAnswer[1]);
    const yearAnswer = e.quote.match(/\b(20\d{2}|21\d{2})\b/);
    if (yearAnswer && (e.quote.trim() === yearAnswer[0] || /\b(year|please|actually|instead)\b/i.test(e.quote) || messages.slice(anchorIndex + 1, messages.findIndex((m) => m.id === e.id)).some((m) => /\byear\b/i.test(m.text)))) year = Number(yearAnswer[0]);
  }
  return candidate.day === day && (!candidate.year || candidate.year === year);
}

// Explicit cancellation outranks a repeated older prediction. Later stated
// values can reopen a detail, but small talk cannot revive cancelled evidence.
export function withExplicitClears(state: GroundedState, messages: Message[]): GroundedState {
  const next = { ...state };
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.speaker !== 'customer') continue;
    const text = cleanText(message.text);
    const whole = /\b(?:cancel|forget|remove|clear)\s+(?:the\s+|my\s+|this\s+)?(?:whole\s+|entire\s+)?(?:booking|reservation)(?:\s+request)?\b/.test(text) && !/\b(?:instead|change|reschedule|move)\b/.test(text);
    const time = /\b(?:forget|remove|clear|cancel)\b/.test(text) && /\btime\b/.test(text) && /\b(?:not decided|undecided|not sure|haven't decided|have not decided)\b/.test(text) && !/\b(?:instead|or|after|before|between)\b/.test(text);
    const keys: FieldKey[] = whole ? [...FIELD_KEYS] : time ? ['time'] : [];
    for (const key of keys) {
      const candidate = state[key];
      const laterValue = candidate.value && candidate.evidence.some((e) => messages.findIndex((m) => m.id === e.id) > index && containsValue(key, candidate.value!, e.quote, null));
      if (laterValue) continue;
      next[key] = { value: null, status: 'missing', constraint: null, evidence: [{ id: message.id, quote: message.text, kind: 'context' }] };
    }
  }
  return next;
}

// Report only fixable inconsistencies. A repair is bounded to one model call;
// valid uncertainty never becomes an instruction to manufacture an answer.
export function validationFeedback(state: GroundedState, messages: Message[], reference: string | null): string[] {
  const issues: string[] = [];
  for (const key of FIELD_KEYS) {
    const candidate = state[key];
    const evidence = checkedEvidence(candidate, messages);
    if (!evidence || ((candidate.value || candidate.constraint) && !evidence.length)) { issues.push(`${key}: supply actual supporting quotations and real message IDs, or leave this unconfirmed.`); continue; }
    if (candidate.value && !evidence.some((e) => containsValue(key, candidate.value!, e.quote, reference)) && !(key === 'date' && composedDateSupported(candidate.value, evidence, messages))) issues.push(`${key}: this value is not supported by its quoted evidence. Recheck the visible conversation; never invent a value.`);
  }
  if (!state.partySize.value && messages.some((m, index) => m.speaker === 'staff' && /\b(?:for|party of|group of)\s+([1-9]\d?)\b/i.test(digitWords(m.text)) && messages.slice(index + 1).find((next) => next.speaker === 'customer') && isAcceptance(messages.slice(index + 1).find((next) => next.speaker === 'customer')!.text))) {
    issues.push('partySize: recheck the customer-accepted staff summary for a stated party size. Keep it missing if the size was rejected or later cancelled; never add a default.');
  }
  const acceptedStaff = messages.filter((m, i) => m.speaker === 'staff' && /\b(confirm|correct|reservation|table|booking)\b/i.test(m.text) && messages.slice(i + 1).some((next) => next.speaker === 'customer' && isAcceptance(next.text)));
  if (!state.date.value && acceptedStaff.some((m) => calendarDate(m.text))) issues.push('date: recheck prior confirmation summaries. A later acceptance of a revised summary may confirm unchanged date details from the earlier summary. Cite the date and the relevant later acceptance; never accept a rejected date.');
  if (state.time.status !== 'resolved' && acceptedStaff.some((m) => clockTime(m.text))) issues.push('time: recheck whether an explicit staff time was accepted in a later revised summary. Cite the time and acceptance; keep ranges or rejected offers unresolved.');
  const lastCustomer = messages.findLastIndex((m) => m.speaker === 'customer');
  const priorStaff = messages.slice(0, lastCustomer).findLast((m) => m.speaker === 'staff');
  if (priorStaff && isAcceptance(messages[lastCustomer].text)) {
    if (clockTime(priorStaff.text) && state.time.status !== 'resolved') issues.push('time: check whether the latest customer accepted the preceding staff time offer, including an acceptance combined with a correction to a different field. Do not accept a rejected offer.');
    if (calendarDate(priorStaff.text) && !state.date.value) issues.push('date: check the accepted calendar date in the preceding staff summary. Preserve uncertainty only for the unspecified parts.');
  }
  return issues;
}

// Reconstruct from the complete visible prefix. The client state supplies only
// staff overrides/history; it is never used as proof that a model value is true.
export function reconcileGroundedState(current: Brief, state: GroundedState, messages: Message[], reference: string | null): Brief {
  const next: Brief = { ...current, fields: { ...current.fields }, history: [...current.history] };
  for (const key of FIELD_KEYS) {
    const candidate = state[key]; const previous = current.fields[key];
    const evidence = checkedEvidence(candidate, messages);
    if (!evidence || !evidence.length) continue;
    const customerEvidence = evidence.filter((e) => messages.find((m) => m.id === e.id)?.speaker === 'customer');
    if (!customerEvidence.length) continue;
    let value = candidate.value?.trim() ?? null;
    let status = candidate.status; let constraint = candidate.constraint?.trim() ?? null;
    if ((value?.length ?? 0) > 120 || (constraint?.length ?? 0) > 120) continue;
    if (status === 'resolved' && !value) continue;
    if (status === 'missing' && value) continue;
    if (status === 'needs_clarification' && !value && !constraint) continue;
    if (value) {
      if (key === 'partySize' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 30)) continue;
      // A directly stated customer value or a staff value explicitly accepted
      // later must support the candidate. Message IDs alone are insufficient.
      const supported = (key === 'date' && composedDateSupported(value, evidence, messages)) || evidence.some((e) => {
        if (!containsValue(key, value!, e.quote, reference)) return false;
        const sourceIndex = messages.findIndex((m) => m.id === e.id);
        if (messages[sourceIndex].speaker === 'customer') return true;
        return customerEvidence.some((acceptance) => messages.findIndex((m) => m.id === acceptance.id) > sourceIndex && acceptedEvidence(acceptance));
      });
      if (!supported) continue;
      if (key === 'date') {
        const calendar = calendarDate(value);
        if (calendar) {
          value = calendar.value;
          if (!calendar.year) { status = 'needs_clarification'; constraint = 'Year not specified'; }
        } else {
          const anchored = relativeDate(value, reference);
          if (anchored) { value = calendarDate(anchored)!.value; status = 'resolved'; constraint = null; }
          else { constraint = value; status = 'needs_clarification'; }
        }
      }
      if (key === 'time' && value && status === 'resolved') {
        const clock = clockTime(value);
        if (clock) value = clock;
        else { constraint = value; status = 'needs_clarification'; }
      }
    }
    if (previous.source === 'staff') {
      const differs = value !== previous.value || status !== 'resolved';
      next.fields[key] = { ...previous, note: differs ? `Conversation now says ${value ?? constraint ?? 'not confirmed'}. Your edit is kept until you review it.` : 'Reviewed by staff' };
      if (differs) next.approvedRevision = null;
      continue;
    }
    if (status === 'missing' && previous.value && !customerEvidence.some((e) => /\b(cancel|forget|remove|clear|undecided|not decided|not sure|no longer|haven't decided|have not decided)\b/i.test(e.quote))) continue;
    const ids = evidence.map((e) => e.id);
    // Newer accepted evidence can repair an earlier missed update, including
    // after small talk. Older evidence cannot roll back a later correction.
    const customerPosition = (ids: string[]) => Math.max(-1, ...messages.map((m, i) => m.speaker === 'customer' && ids.includes(m.id) ? i : -1));
    const semanticChange = previous.value !== value || previous.status !== status || previous.constraint !== constraint;
    if (previous.source && semanticChange && customerPosition(ids) < customerPosition(previous.evidenceIds)) continue;
    const item: FieldState = { value, status, constraint, evidenceIds: ids, source: 'model', note: status === 'needs_clarification' ? 'Please confirm the remaining detail.' : '' };
    if (!semanticChange) {
      next.fields[key] = { ...previous, evidenceIds: ids };
      continue;
    }
    next.revision += 1;
    next.fields[key] = item;
    const operation = status === 'missing' ? 'clear' : status === 'needs_clarification' && !value ? 'constrain' : previous.value ? 'replace' : 'set';
    next.history.push({ field: key, previousValue: previous.value, nextValue: value, operation, evidenceIds: ids, revision: next.revision });
    next.approvedRevision = null;
  }
  return next;
}
