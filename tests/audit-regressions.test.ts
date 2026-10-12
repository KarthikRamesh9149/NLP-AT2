import { describe, expect, it } from 'vitest';
import { briefSchema } from '../lib/contracts';
import { isCancelledBooking } from '../lib/cancellation-status';
import { reconcileGroundedState, withExplicitClears, validationFeedback, type GroundedField, type GroundedState } from '../lib/grounding';
import { applyManualEdit, approveBrief, createEmptyBrief, FIELD_KEYS, type Message } from '../lib/state';
import { restoreSession } from '../lib/session';
import { parseTranscript } from '../lib/transcript';

const snapshot = (fields: Partial<GroundedState> = {}): GroundedState => ({ ...Object.fromEntries(FIELD_KEYS.map(key => [key, { value: null, status: 'missing', constraint: null, evidence: [] }])), ...fields }) as GroundedState;
const value = (v: string, id: string, quote: string): GroundedField => ({ value: v, status: 'resolved', constraint: null, evidence: [{ id, quote }] });
const original: Message = { id: 'm1', speaker: 'customer', text: 'Juniper in Sydney on 18 October 2027 for four people at 7 pm.' };
function complete() {
  return reconcileGroundedState(createEmptyBrief(), snapshot({ restaurantName: value('Juniper', 'm1', 'Juniper'), city: value('Sydney', 'm1', 'Sydney'), date: value('18 October 2027', 'm1', '18 October 2027'), time: value('7 pm', 'm1', '7 pm'), partySize: value('4', 'm1', 'four') }), [original], null);
}

describe('audited safety failures', () => {
  it.each(['Please do not cancel my booking.', "Don't cancel my reservation.", 'If it rains, cancel my booking.', 'I might cancel my booking.', 'Can I cancel my booking?', 'No need to cancel the booking.', 'The customer yesterday said cancel my booking.'])('keeps the enquiry for %s', text => {
    const candidate = snapshot({ time: value('7 pm', 'm1', '7 pm'), partySize: value('4', 'm1', 'four') });
    const messages: Message[] = [original, { id: 'm2', speaker: 'customer', text }];
    const cleared = withExplicitClears(candidate, messages);
    expect(cleared.time.value).toBe('7 pm');
    expect(cleared.partySize.value).toBe('4');
    const empty = createEmptyBrief();
    for (const key of FIELD_KEYS) empty.fields[key].evidenceIds = ['m2'];
    expect(isCancelledBooking(empty, messages)).toBe(false);
  });
  it.each(['Please cancel my booking.', 'Could you cancel my booking please?', 'Would you please cancel my reservation?'])('clears the cancellation request: %s', text => {
    const messages: Message[] = [original, { id: 'm2', speaker: 'customer', text }];
    const next = reconcileGroundedState(complete(), withExplicitClears(snapshot(), messages), messages, null);
    expect(FIELD_KEYS.every(key => next.fields[key].value === null)).toBe(true);
    expect(isCancelledBooking(next, messages)).toBe(true);
  });
  it('does not clear values when a faulty model labels a negated cancellation as missing', () => {
    const messages: Message[] = [original, { id: 'm2', speaker: 'customer', text: 'Please do not cancel my booking.' }];
    const state = snapshot();
    for (const key of FIELD_KEYS) state[key].evidence = [{ id: 'm2', quote: messages[1].text }];
    const next = reconcileGroundedState(complete(), state, messages, null);
    expect(FIELD_KEYS.every(key => next.fields[key].status === 'resolved')).toBe(true);
    expect(next.fields.time.value).toBe('7 pm');
  });
  it('clears manually reviewed details on a whole-enquiry cancellation', () => {
    const messages: Message[] = [original, { id: 'm2', speaker: 'customer', text: 'Cancel my booking.' }];
    const current = applyManualEdit(complete(), 'partySize', '6');
    const next = reconcileGroundedState(current, withExplicitClears(snapshot(), messages), messages, null);
    expect(FIELD_KEYS.every(key => next.fields[key].value === null)).toBe(true);
    expect(isCancelledBooking(next, messages)).toBe(true);
  });
  it('requires review when a rejected new constraint happens to contain the old clock value', () => {
    const messages: Message[] = [original, { id: 'm2', speaker: 'customer', text: 'After 7 pm, rather than exactly 7 pm.' }];
    const next = reconcileGroundedState(complete(), snapshot({ time: value('7 pm', 'm2', '7 pm') }), messages, null);
    expect(next.fields.time.status).toBe('needs_clarification');
    expect(() => approveBrief(next)).toThrow();
  });
  it.each(['For 4 March 2027 at 7 pm.', 'That charge is for 4 dollars.', 'Keep the table for 4 minutes.'])('does not use a date, price or duration number as guests: %s', text => {
    const messages: Message[] = [{id:'m2',speaker:'customer',text}];
    expect(reconcileGroundedState(createEmptyBrief(),snapshot({partySize:value('4','m2',text)}),messages,null).fields.partySize.value).toBeNull();
  });
  it('turns a malformed model count into feedback without compiling it as a regular expression', () => {
    const messages: Message[] = [{id:'m2',speaker:'customer',text:'Some detail ('}];
    const feedback = validationFeedback(snapshot({partySize:value('(','m2','(')}),messages,null);
    expect(feedback.some(issue=>issue.startsWith('partySize:'))).toBe(true);
  });
  it('does not use a clock number as a guest count', () => {
    const messages: Message[] = [{ id: 'm2', speaker: 'customer', text: 'At 7 pm please.' }];
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ partySize: value('7', 'm2', '7 pm') }), messages, null).fields.partySize.value).toBeNull();
  });
  it('keeps the guest count exact when only the time has alternatives', () => {
    const messages: Message[] = [{ id: 'm2', speaker: 'customer', text: 'Four people at 7 pm or 8 pm.' }];
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ partySize: value('4', 'm2', 'Four people') }), messages, null).fields.partySize).toMatchObject({ value: '4', status: 'resolved' });
  });
  it('does not accept a specifically rejected guest count', () => {
    const messages: Message[] = [{ id: 'm2', speaker: 'customer', text: 'Not four people. Five people instead.' }];
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ partySize: value('4', 'm2', 'four people') }), messages, null).fields.partySize.value).toBeNull();
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ partySize: value('5', 'm2', 'Five people') }), messages, null).fields.partySize.value).toBe('5');
  });
  it('uses the established guest-count context for a terse correction with a separate time constraint', () => {
    const messages: Message[] = [original, { id: 'm2', speaker: 'customer', text: 'Five, after eight instead.' }];
    expect(reconcileGroundedState(complete(), snapshot({ partySize: value('5', 'm2', 'Five') }), messages, null).fields.partySize.value).toBe('5');
  });
  it.each(['after 7 pm', 'around 7 pm', '7 pm or 8 pm', 'not 7 pm'])('does not turn %s into an exact time, even with a shortened quote', text => {
    const messages: Message[] = [{ id: 'm2', speaker: 'customer', text }];
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ time: value('7 pm', 'm2', '7 pm') }), messages, null).fields.time.status).not.toBe('resolved');
  });
  it.each(['I will check with my partner.', 'Yes, but not 8 pm.'])('does not trust an acceptance tag on %s', text => {
    const messages: Message[] = [{ id: 'm2', speaker: 'staff', text: 'Would 8 pm work?' }, { id: 'm3', speaker: 'customer', text }];
    const time: GroundedField = { ...value('8 pm', 'm2', '8 pm'), evidence: [{ id: 'm2', quote: '8 pm' }, { id: 'm3', quote: text.startsWith('Yes') ? 'Yes' : text, kind: 'acceptance' }] };
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ time }), messages, null).fields.time.value).toBeNull();
  });
  it('retains a prior value for recovery but blocks approval after an unsupported correction', () => {
    const messages: Message[] = [original, { id: 'm2', speaker: 'customer', text: 'Change the time to 8 pm.' }];
    const next = reconcileGroundedState(complete(), snapshot({ time: value('8 pm', 'unknown', '8 pm') }), messages, null);
    expect(next.fields.time.value).toBe('7 pm');
    expect(next.fields.time.status).toBe('needs_clarification');
    expect(next.approvedRevision).toBeNull();
    expect(() => approveBrief(next)).toThrow();
  });
  it('requires an explicit review when a customer correction conflicts with a staff edit', () => {
    const edited = applyManualEdit(complete(), 'partySize', '6');
    const messages: Message[] = [original, { id: 'm2', speaker: 'customer', text: 'Actually five people.' }];
    const next = reconcileGroundedState(edited, snapshot({ partySize: value('5', 'm2', 'five people') }), messages, null);
    expect(next.fields.partySize.value).toBe('6');
    expect(next.fields.partySize.status).toBe('needs_clarification');
    expect(() => approveBrief(next)).toThrow();
  });
  it('bounds retained change history so a long editing session still validates and restores', () => {
    let brief = complete();
    for (let i = 0; i < 240; i++) brief = applyManualEdit(brief, 'partySize', i % 2 ? '5' : '6');
    expect(brief.history.length).toBeLessThanOrEqual(200);
    expect(briefSchema.safeParse(brief).success).toBe(true);
    expect(restoreSession(JSON.stringify({ messages: [original], brief }), null)?.brief.fields.partySize.value).toBe('5');
  });
  it('recovers older drafts whose change history exceeded the old limit', () => {
    const brief = complete();
    brief.history = Array.from({ length: 220 }, (_, index) => ({ field: 'partySize' as const, previousValue: '4', nextValue: '5', operation: 'manual' as const, evidenceIds: [], revision: index + 1 }));
    brief.revision = 220;
    expect(restoreSession(JSON.stringify({ messages: [original], brief }), null)?.brief.history.length).toBe(200);
  });
  it('rejects a transcript that cannot fit the API request in UTF-8 bytes', () => {
    const transcript = Array.from({ length: 21 }, () => `Customer: ${'客'.repeat(800)}`).join('\n');
    expect(() => parseTranscript(transcript)).toThrow(/large|short|size|bytes/i);
  });
  it('resolves a quoted year answer even when the model leaves the date expression yearless', () => {
    const messages: Message[] = [{ id:'m1',speaker:'customer',text:'March 3rd please.' },{ id:'m2',speaker:'staff',text:'Which year do you mean?' },{ id:'m3',speaker:'customer',text:'2027, please.' }];
    const date: GroundedField = { value:'March 3rd',status:'needs_clarification',constraint:'Year not specified',evidence:[{id:'m1',quote:'March 3rd'},{id:'m2',quote:'Which year do you mean?'},{id:'m3',quote:'2027'}] };
    expect(reconcileGroundedState(createEmptyBrief(),snapshot({date}),messages,null).fields.date).toMatchObject({value:'3 March 2027',status:'resolved',constraint:null});
    messages[1].text='What is your reference number?'; date.evidence[1].quote=messages[1].text;
    expect(reconcileGroundedState(createEmptyBrief(),snapshot({date}),messages,null).fields.date.status).toBe('needs_clarification');
  });
});
