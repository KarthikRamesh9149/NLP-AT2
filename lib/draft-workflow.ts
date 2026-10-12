import { assertRequestSize, MAX_HISTORY } from './limits';
import { applyManualEdit, createEmptyBrief, FIELD_KEYS, type Brief, type FieldKey, type Message } from './state';

export function analysisPayload(messages: Message[], brief: Brief, referenceDate: string | null) {
  // The server needs current values and revision, not hundreds of historical
  // records. History stays on the device and is merged with the response.
  const body = { messages, brief: { ...brief, history: [] }, referenceDate, mode: 'formbridge' as const };
  assertRequestSize(body);
  return body;
}

export function mergeAnalysisHistory(current: Brief, next: Brief): Brief {
  return { ...next, history: [...current.history, ...next.history.filter(change => change.revision > current.revision)].slice(-MAX_HISTORY) };
}

export function rebuildForTranscriptChange(brief: Brief): Brief {
  const fields = createEmptyBrief().fields;
  for (const key of FIELD_KEYS) {
    const previous = brief.fields[key];
    if (previous.source === 'staff') fields[key] = { ...previous, status: 'needs_clarification', note: 'The transcript changed. Check your edit against the updated conversation.', review: { reason: 'transcript_changed', value: null, constraint: null, status: 'missing', evidenceIds: [] } };
  }
  return { ...brief, fields, revision: brief.revision + 1, approvedRevision: null, history: brief.history.slice(-MAX_HISTORY) };
}

export function resolveFieldReview(brief: Brief, key: FieldKey, choice: 'staff' | 'conversation'): Brief {
  const field = brief.fields[key];
  if (choice === 'staff') {
    if (!field.value) throw new Error('Enter the detail you want to keep.');
    const next = applyManualEdit(brief, key, field.value);
    if (field.review?.reason === 'staff_conflict') next.fields[key].evidenceIds = field.review.evidenceIds;
    return next;
  }
  const review = field.review;
  if (!review || review.reason !== 'staff_conflict') throw new Error('Recheck the conversation before using a new value.');
  const revision = brief.revision + 1;
  return { ...brief, revision, approvedRevision: null,
    fields: { ...brief.fields, [key]: { value: review.value, status: review.status, constraint: review.constraint, evidenceIds: review.evidenceIds, source: 'model', note: review.status === 'needs_clarification' ? 'Please confirm the remaining detail.' : '' } },
    history: [...brief.history, { field: key, previousValue: field.value, nextValue: review.value, operation: review.value ? 'replace' as const : 'clear' as const, evidenceIds: review.evidenceIds, revision }].slice(-MAX_HISTORY),
  };
}
