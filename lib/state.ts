import { calendarDate, clockTime } from './temporal';
import { MAX_HISTORY } from './limits';
export const FIELD_KEYS = ['restaurantName', 'city', 'date', 'time', 'partySize'] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];
export type FieldStatus = 'missing' | 'resolved' | 'needs_clarification';
export type Speaker = 'customer' | 'staff';

export interface Message {
  id: string;
  speaker: Speaker;
  text: string;
}

export interface Proposal {
  field: FieldKey;
  operation: 'set' | 'replace' | 'clear' | 'constrain';
  value: string | null;
  status: FieldStatus;
  evidenceIds: string[];
  note: string;
}

export interface FieldState {
  value: string | null;
  status: FieldStatus;
  constraint: string | null;
  evidenceIds: string[];
  source: 'model' | 'rule' | 'staff' | null;
  note: string;
  review?: {
    reason: 'unsupported_update' | 'staff_conflict' | 'transcript_changed';
    value: string | null;
    constraint: string | null;
    status: FieldStatus;
    evidenceIds: string[];
  };
}

export interface Change {
  field: FieldKey;
  previousValue: string | null;
  nextValue: string | null;
  operation: Proposal['operation'] | 'manual';
  evidenceIds: string[];
  revision: number;
}

export interface Brief {
  fields: Record<FieldKey, FieldState>;
  history: Change[];
  revision: number;
  approvedRevision: number | null;
}

const emptyField = (): FieldState => ({ value: null, status: 'missing', constraint: null, evidenceIds: [], source: null, note: '' });

export function createEmptyBrief(): Brief {
  return {
    fields: Object.fromEntries(FIELD_KEYS.map((key) => [key, emptyField()])) as Brief['fields'],
    history: [],
    revision: 0,
    approvedRevision: null,
  };
}

function validValue(field: FieldKey, value: string | null): boolean {
  if (!value || !value.trim() || value.length > 120) return false;
  if (field === 'partySize') return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 30;
  return true;
}

export function applyProposals(brief: Brief, proposals: Proposal[], messages: Message[], source: FieldState['source'] = 'model'): Brief {
  const knownIds = new Set(messages.map((message) => message.id));
  const latestCustomerId = [...messages].reverse().find((message) => message.speaker === 'customer')?.id;
  const next: Brief = { ...brief, fields: { ...brief.fields }, history: [...brief.history] };
  for (const proposal of proposals) {
    if (!FIELD_KEYS.includes(proposal.field) || proposal.evidenceIds.length === 0) continue;
    if (proposal.evidenceIds.some((id) => !knownIds.has(id))) continue;
    // A stale message cannot justify a new mutation. Accepted staff offers cite
    // both the offer and the latest customer turn that accepted it.
    if (!latestCustomerId || !proposal.evidenceIds.includes(latestCustomerId)) continue;
    // A relative date without a reference date cannot be stored as an exact
    // calendar date. The model sometimes normalises "Friday" on its own.
    const evidenceText = messages.filter((message) => proposal.evidenceIds.includes(message.id)).map((message) => message.text).join(' ');
    const hasCalendarDate = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i.test(evidenceText);
    const relativeDate = proposal.field === 'date' && !hasCalendarDate
      ? evidenceText.match(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|today|tomorrow)\b/i)?.[0] ?? null
      : null;
    const operation = relativeDate && proposal.operation !== 'clear' ? 'constrain' : proposal.operation;
    const value = relativeDate ?? proposal.value;
    if (operation !== 'clear' && !validValue(proposal.field, value)) continue;
    const previous = next.fields[proposal.field];
    if (previous.source === 'staff') continue;
    const isConstraint = operation === 'constrain';
    const isClear = operation === 'clear';
    const nextField: FieldState = {
      value: isConstraint || isClear ? null : value!.trim(),
      status: isConstraint ? 'needs_clarification' : isClear ? 'missing' : 'resolved',
      constraint: isConstraint ? value!.trim() : null,
      evidenceIds: proposal.evidenceIds,
      source,
      note: proposal.note,
    };
    if (JSON.stringify(nextField) === JSON.stringify(previous)) continue;
    next.revision += 1;
    next.fields[proposal.field] = nextField;
    next.history.push({ field: proposal.field, previousValue: previous.value, nextValue: nextField.value, operation, evidenceIds: proposal.evidenceIds, revision: next.revision });
    next.approvedRevision = null;
  }
  next.history = next.history.slice(-MAX_HISTORY);
  return next;
}

export function applyManualEdit(brief: Brief, field: FieldKey, value: string): Brief {
  let cleaned = value.trim();
  if (!validValue(field, cleaned)) throw new Error(field === 'partySize' ? 'Enter a number of guests between 1 and 30.' : 'Enter a detail of up to 120 characters.');
  let status: FieldStatus = 'resolved'; let constraint: string | null = null;
  if (field === 'date') {
    const date = calendarDate(cleaned);
    if (!date) throw new Error('Enter a valid calendar date, such as 9 October 2026.');
    cleaned = date.value;
    if (!date.year) { status = 'needs_clarification'; constraint = 'Year not specified'; }
  }
  if (field === 'time') {
    const time = clockTime(cleaned);
    if (!time) throw new Error('Enter an exact time with am or pm, such as 7:30 pm.');
    cleaned = time;
  }
  const revision = brief.revision + 1;
  return {
    ...brief,
    fields: { ...brief.fields, [field]: { value: cleaned, status, constraint, evidenceIds: [], source: 'staff', note: 'Reviewed by staff' } },
    revision,
    approvedRevision: null,
    history: [...brief.history, { field, previousValue: brief.fields[field].value, nextValue: cleaned, operation: 'manual' as const, evidenceIds: [], revision }].slice(-MAX_HISTORY),
  };
}

export function approveBrief(brief: Brief): Brief {
  if (FIELD_KEYS.some((field) => brief.fields[field].status !== 'resolved' || !brief.fields[field].value || brief.fields[field].review)) throw new Error('Resolve all five fields and review conflicting changes before approving this brief.');
  return { ...brief, approvedRevision: brief.revision };
}

export function clarificationFor(brief: Brief): string | null {
  const prompts: Record<FieldKey, string> = {
    restaurantName: 'Which restaurant would you like?',
    city: 'Which city is the restaurant in?',
    date: 'What date would you like?',
    time: 'What exact time would you prefer?',
    partySize: 'How many people are in your party?',
  };
  const field = FIELD_KEYS.find((key) => brief.fields[key].status === 'needs_clarification') ?? FIELD_KEYS.find((key) => brief.fields[key].status === 'missing');
  if (!field) return null;
  if (brief.fields[field].review) return `Review the ${field === 'partySize' ? 'guest count' : field === 'restaurantName' ? 'restaurant' : field} change before approving the brief.`;
  if (field === 'date' && brief.fields.date.value && brief.fields.date.constraint === 'Year not specified') return `Which year do you mean for ${brief.fields.date.value}?`;
  if (field === 'date' && brief.fields.date.constraint) return `What exact date do you mean by ${brief.fields.date.constraint}?`;
  if (field === 'time' && brief.fields.time.constraint) return `What exact time would you prefer (${brief.fields.time.constraint})?`;
  return prompts[field];
}
