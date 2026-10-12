import { calendarDate, cleanText, clockTime, digitWords, isInvalidCalendarDate, relativeDate } from './temporal';
import { FIELD_KEYS, type Brief, type FieldKey, type FieldState, type FieldStatus, type Message } from './state';
import { requestsCancellation } from './booking-intent';
import { MAX_HISTORY } from './limits';
import { guestCountInsideGroup, hasGuestCountContext, hasGuestCountEvidence } from './party-evidence';
import { hasClockEvidence, hasExactTimeEvidence } from './time-evidence';

export interface Evidence { id: string; quote: string; kind?: 'value' | 'acceptance' | 'context' }
export interface GroundedField { value: string | null; status: FieldStatus; constraint: string | null; evidence: Evidence[] }
export type GroundedState = Record<FieldKey, GroundedField>;
const nonGuestUnit = String.raw`(?::|am\b|pm\b|o'clock|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|(?:dollars?|aud|usd|euros?|pounds?|minutes?|hours?|days?|weeks?|months?|years?)\b)`;

function containsValue(field: FieldKey, value: string, quote: string, reference: string | null, source = quote, messages: Message[] = [], sourceId?: string, exact = true): boolean {
  if (field === 'partySize') {
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 30) return false;
    const text = digitWords(source);
    if (hasGuestCountEvidence(value, quote, source, exact)) return true;
    if (!new RegExp(`\\b${value}\\b`).test(digitWords(quote))) return false;
    const count = new RegExp(`(?:\\b(?:party|group)\\s+(?:of\\s+)?${value}\\b|\\bfor\\s+${value}\\b(?!\\s*${nonGuestUnit}))`);
    const match = count.exec(text);
    if (match) {
      if (guestCountInsideGroup(value, source, match.index, match.index + match[0].length, exact)) return false;
      const prefix = text.slice(0, match.index).split(/[.!?;,]|\b(?:but|so)\b/).at(-1) || '';
      if (/\b(?:not|no|don't|do not)\b/.test(prefix)) return false;
      return !exact || !/\b\d{1,2}\s*(?:or|to|-)\s*\d{1,2}\s+(?:people|persons|guests|diners)\b|\bbetween\s+\d{1,2}\s+and\s+\d{1,2}\b/.test(text);
    }
    const index = messages.findIndex(message => message.id === sourceId);
    const question = messages.slice(0, index).findLast(message => message.speaker === 'staff');
    const bare = text.replace(/^(?:actually\b[, ]*|make (?:it|that)\s+)/, '').split(/[,;.!]/)[0].trim().replace(/\s+(?:instead|please)$/,'');
    if (bare !== value) return false;
    if (question && /\b(?:how many|party size|guest count|number of (?:people|guests))\b/i.test(question.text)) return true;
    if (question && /\b(?:what time|which time|when|what date|which date|which year)\b/i.test(question.text)) return false;
    const priorCount = new RegExp(`\\b\\d{1,2}\\s+(?:people|guests|diners)\\b|\\b(?:party|group) of \\d{1,2}\\b|\\bfor \\d{1,2}\\b(?!\\s*${nonGuestUnit})`, 'i');
    return messages.slice(0,index).some(message => hasGuestCountContext(message.text) || priorCount.test(digitWords(message.text)));
  }
  if (field === 'date') {
    const candidate = calendarDate(value); const source = calendarDate(quote);
    if (candidate && source) return candidate.month === source.month && candidate.day === source.day && (!candidate.year || candidate.year === source.year);
    if (candidate && relativeDate(quote, reference)) return calendarDate(relativeDate(quote, reference)!)?.value === candidate.value;
  }
  if (field === 'time' && clockTime(value)) {
    if (!hasClockEvidence(value, quote)) return false;
    if (!exact) return true;
    // Inspect the full source clause; a shortened quote must not erase its
    // qualifier, alternative or rejection.
    return hasExactTimeEvidence(value, source);
  }
  return cleanText(quote).includes(cleanText(value));
}
export function isAcceptance(text: string): boolean {
  const normal = cleanText(text);
  const relevant = normal.split(/(?<=[.!?;])\s+|,\s+(?=(?:and\s+)?(?:are|is|do|does|what|where|how|can|could|would)\b)/).filter(clause => {
    // A separate question about the venue does not negate an accepted brief.
    const asksQuestion = /\?$/.test(clause) && /^(?:(?:and|also)\s+)?(?:are|is|do|does|what|where|how|can|could)\b/.test(clause);
    const requestsInformation = /^(?:(?:and|also)\s+)?(?:tell|show|find out|see|check|let me know)\b/.test(clause);
    const venueQuestion = (asksQuestion || requestsInformation)
      && /\b(cost|costly|price|pricing|cheap|expensive|menu|food|cuisine|address|rating|ratings|review|reviews|outdoor seating|indoor seating)\b/.test(clause)
      && !/\b(book|reserve|reservation|booking|cancel|change|move|switch|instead|date|time|guests|people|party|table)\b/.test(clause);
    return !venueQuestion;
  });
  const positive = /\b(yes|yeah|yep|absolutely|i would love that|i'd love that|confirm|confirmed|exactly|correct|right|perfect|works|sounds (?:good|great|fabulous|lovely|wonderful|brilliant|excellent|perfect)|sounds like a good choice|that is exactly what i want|that's it|that is it|good|great|excellent|sure|go ahead|good for me|that works|that is good|that's good|fine|okay|ok|please book|please reserve|book (?:it|that|this|me|us|a table|the table)|reserve (?:it|that|this|a table|the table))\b/i;
  const bookingRequest = /\b(?:please (?:book|reserve)|book (?:it|that|this|me|us|a table|the table)|reserve (?:it|that|this|a table|the table))\b/;
  return relevant.some(clause => positive.test(clause) && (!/\?$/.test(clause) || bookingRequest.test(clause)))
    && !/\b(no|not|don't|doesn't|won't|reject|cancel|might|maybe|check with|ask my|if|unless)\b/i.test(relevant.join(' '));
}
function acceptedEvidence(evidence: Evidence, messages: Message[]): boolean {
  const source = messages.find(message => message.id === evidence.id);
  return !!source && isAcceptance(source.text) && isAcceptance(evidence.quote);
}
function checkedEvidence(field: GroundedField, messages: Message[]): Evidence[] | null {
  if (field.evidence.length > 12) return null;
  const seen = new Set<string>(); const checked: Evidence[] = [];
  for (const evidence of field.evidence) {
    const message = messages.find((m) => m.id === evidence.id);
    if (!message || !evidence.quote.trim() || !cleanText(message.text).includes(cleanText(evidence.quote))) return null;
    const key = `${evidence.id}\u0000${cleanText(evidence.quote)}`;
    if (!seen.has(key)) { checked.push(evidence); seen.add(key); }
  }
  return checked;
}

function composedDateSupported(value: string, evidence: Evidence[], messages: Message[]): boolean {
  const candidate = calendarDate(value);
  if (!candidate) return false;
  const usable = evidence.filter((e) => {
    const index = messages.findIndex((m) => m.id === e.id);
    if (messages[index]?.speaker === 'customer') return true;
    return evidence.some((a) => messages.findIndex((m) => m.id === a.id) > index && messages.find((m) => m.id === a.id)?.speaker === 'customer' && acceptedEvidence(a, messages));
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

function quotedYearAnswer(evidence: Evidence[], messages: Message[]): string | null {
  for (const item of [...evidence].reverse()) {
    const index = messages.findIndex(message => message.id === item.id);
    const source = messages[index];
    if (source?.speaker !== 'customer') continue;
    const question = messages.slice(0,index).findLast(message => message.speaker === 'staff');
    if (!question || !/\byear\b/i.test(question.text)) continue;
    const answer = cleanText(source.text).match(/^(?:(?:the year is|in|actually|i mean)\s+)?(20\d{2}|21\d{2})(?:[, .]*(?:please|instead))?[.!]?$/);
    if (answer && item.quote.includes(answer[1])) return answer[1];
  }
  return null;
}

// Explicit cancellation outranks a repeated older prediction. Later stated
// values can reopen a detail, but small talk cannot revive cancelled evidence.
export function withExplicitClears(state: GroundedState, messages: Message[], reference: string | null = null): GroundedState {
  const next = { ...state };
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.speaker !== 'customer') continue;
    const text = cleanText(message.text);
    const whole = requestsCancellation(message.text);
    const time = /\b(?:forget|remove|clear|cancel)\b/.test(text) && /\btime\b/.test(text) && /\b(?:not decided|undecided|not sure|haven't decided|have not decided)\b/.test(text) && !/\b(?:instead|or|after|before|between)\b/.test(text);
    const keys: FieldKey[] = whole ? [...FIELD_KEYS] : time ? ['time'] : [];
    for (const key of keys) {
      const candidate = state[key];
      const laterValue = candidate.value && candidate.evidence.some((e) => messages.findIndex((m) => m.id === e.id) > index && containsValue(key, candidate.value!, e.quote, reference, messages.find(m => m.id === e.id)?.text, messages, e.id, candidate.status === 'resolved'));
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
    if (candidate.value && !evidence.some((e) => containsValue(key, candidate.value!, e.quote, reference, messages.find(m => m.id === e.id)?.text, messages, e.id, candidate.status === 'resolved')) && !(key === 'date' && composedDateSupported(candidate.value, evidence, messages))) issues.push(`${key}: this value is not supported by its quoted evidence. Recheck the visible conversation; never invent a value.`);
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
    const reject = () => {
      if (!previous.value || (!candidate.value && !candidate.constraint && !candidate.evidence.length)) return;
      const newest = Math.max(-1, ...candidate.evidence.map(e => messages.findIndex(m => m.id === e.id)));
      const previousPosition = Math.max(-1, ...previous.evidenceIds.map(id => messages.findIndex(m => m.id === id)));
      if (previous.value === candidate.value && previous.constraint === candidate.constraint && previous.status === candidate.status && newest <= previousPosition) return;
      if (previous.review?.reason === 'unsupported_update') return;
      next.revision += 1;
      next.fields[key] = { ...previous, status: 'needs_clarification', note: 'A new detail could not be verified. The earlier value is kept for your review.', review: { reason: 'unsupported_update', value: null, constraint: null, status: 'missing', evidenceIds: [] } };
      next.approvedRevision = null;
    };
    const evidence = checkedEvidence(candidate, messages);
    if (!evidence || !evidence.length) { reject(); continue; }
    const ids = [...new Set(evidence.map(item => item.id))];
    const customerEvidence = evidence.filter((e) => messages.find((m) => m.id === e.id)?.speaker === 'customer');
    if (!customerEvidence.length) { reject(); continue; }
    if (candidate.status === 'missing' && !candidate.value && !candidate.constraint && customerEvidence.every(e => /\b(?:cancel|forget|remove|clear).*\b(?:booking|reservation)\b/i.test(e.quote) && !requestsCancellation(messages.find(m => m.id === e.id)!.text))) continue;
    let value = candidate.value?.trim() ?? null;
    let status = candidate.status; let constraint = candidate.constraint?.trim() ?? null;
    if (key === 'date' && !value && status === 'needs_clarification' && constraint
      && /^(?:(?:this|next|coming)\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:this|next)\s+week)?$|^(?:today|tomorrow|day after tomorrow)$/i.test(constraint)) value = constraint;
    if ((value?.length ?? 0) > 120 || (constraint?.length ?? 0) > 120) { reject(); continue; }
    if (status === 'resolved' && !value) { reject(); continue; }
    if (status === 'missing' && value) { reject(); continue; }
    if (status === 'needs_clarification' && !value && !constraint) { reject(); continue; }
    if (value) {
      if (key === 'partySize' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 30)) { reject(); continue; }
      // A directly stated customer value or a staff value explicitly accepted
      // later must support the candidate. Message IDs alone are insufficient.
      const supported = (key === 'date' && composedDateSupported(value, evidence, messages)) || evidence.some((e) => {
        if (!containsValue(key, value!, e.quote, reference, messages.find(m => m.id === e.id)?.text, messages, e.id, status === 'resolved')) return false;
        const sourceIndex = messages.findIndex((m) => m.id === e.id);
        if (messages[sourceIndex].speaker === 'customer') return true;
        return customerEvidence.some((acceptance) => messages.findIndex((m) => m.id === acceptance.id) > sourceIndex && acceptedEvidence(acceptance, messages));
      });
      if (!supported) { reject(); continue; }
      if (key === 'date') {
        const calendar = calendarDate(value);
        if (calendar) {
          value = calendar.value;
          if (!calendar.year) {
            const year = quotedYearAnswer(evidence, messages);
            const assembled = year ? `${calendar.value} ${year}` : null;
            const dated = assembled ? calendarDate(assembled) : null;
            if (dated?.year) { value = dated.value; status = 'resolved'; constraint = null; }
            else if (assembled) { value = null; status = 'needs_clarification'; constraint = assembled; }
            else { status = 'needs_clarification'; constraint = 'Year not specified'; }
          }
        } else {
          const anchored = relativeDate(value, reference);
          if (anchored) { value = calendarDate(anchored)!.value; status = 'resolved'; constraint = null; }
          else {
            constraint = value; status = 'needs_clarification';
            if (isInvalidCalendarDate(value)) value = null;
          }
        }
      }
      if (key === 'time' && value && status === 'resolved') {
        const clock = clockTime(value);
        if (clock) value = clock;
        else { constraint = value; status = 'needs_clarification'; }
      }
    }
    const cancelled = status === 'missing' && customerEvidence.some(e => requestsCancellation(e.quote));
    if (previous.source === 'staff' && !cancelled) {
      const differs = value !== previous.value || status !== 'resolved';
      if (differs) {
        if (!previous.review && previous.status === 'resolved' && evidence.every(e => previous.evidenceIds.includes(e.id))) continue;
        const review = { reason: 'staff_conflict' as const, value, constraint, status, evidenceIds: ids };
        if (JSON.stringify(previous.review) !== JSON.stringify(review)) next.revision += 1;
        next.fields[key] = { ...previous, status: 'needs_clarification', review, note: `Your edit: ${previous.value}. Conversation: ${value ?? constraint ?? 'not confirmed'}. Choose which to keep.` };
        next.approvedRevision = null;
      } else next.fields[key] = { ...previous, status, review: undefined, note: 'Reviewed by staff' };
      continue;
    }
    if (status === 'missing' && previous.value && !customerEvidence.some((e) => requestsCancellation(e.quote) || /\b(?:undecided|not decided|not sure|no longer|haven't decided|have not decided)\b/i.test(e.quote))) { reject(); continue; }
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
  next.history = next.history.slice(-MAX_HISTORY);
  return next;
}
