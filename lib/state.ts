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
  const next: Brief = { ...brief, fields: { ...brief.fields }, history: [...brief.history] };
  for (const proposal of proposals) {
    if (!FIELD_KEYS.includes(proposal.field) || proposal.evidenceIds.length === 0) continue;
    if (proposal.evidenceIds.some((id) => !knownIds.has(id))) continue;
    if (!proposal.evidenceIds.some((id) => messages.find((m) => m.id === id)?.speaker === 'customer')) continue;
    if (proposal.operation !== 'clear' && !validValue(proposal.field, proposal.value)) continue;
    const previous = next.fields[proposal.field];
    if (previous.source === 'staff') continue;
    const isConstraint = proposal.operation === 'constrain';
    const isClear = proposal.operation === 'clear';
    const nextField: FieldState = {
      value: isConstraint || isClear ? null : proposal.value!.trim(),
      status: isConstraint ? 'needs_clarification' : isClear ? 'missing' : proposal.status,
      constraint: isConstraint ? proposal.value!.trim() : null,
      evidenceIds: proposal.evidenceIds,
      source,
      note: proposal.note,
    };
    if (JSON.stringify(nextField) === JSON.stringify(previous)) continue;
    next.revision += 1;
    next.fields[proposal.field] = nextField;
    next.history.push({ field: proposal.field, previousValue: previous.value, nextValue: nextField.value, operation: proposal.operation, evidenceIds: proposal.evidenceIds, revision: next.revision });
    next.approvedRevision = null;
  }
  return next;
}

export function applyManualEdit(brief: Brief, field: FieldKey, value: string): Brief {
  if (!validValue(field, value)) throw new Error(`Enter a valid ${field} value.`);
  const cleaned = value.trim();
  const revision = brief.revision + 1;
  return {
    ...brief,
    fields: { ...brief.fields, [field]: { value: cleaned, status: 'resolved', constraint: null, evidenceIds: [], source: 'staff', note: 'Reviewed by staff' } },
    revision,
    approvedRevision: null,
    history: [...brief.history, { field, previousValue: brief.fields[field].value, nextValue: cleaned, operation: 'manual', evidenceIds: [], revision }],
  };
}

export function approveBrief(brief: Brief): Brief {
  if (FIELD_KEYS.some((field) => brief.fields[field].status !== 'resolved' || !brief.fields[field].value)) throw new Error('Resolve all five fields before approving this brief.');
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
  if (field === 'time' && brief.fields.time.constraint) return `What exact time would you prefer (${brief.fields.time.constraint})?`;
  return prompts[field];
}
