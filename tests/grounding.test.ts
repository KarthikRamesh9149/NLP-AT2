import { describe, expect, it } from 'vitest';
import { isAcceptance, reconcileGroundedState, validationFeedback, withExplicitClears, type GroundedField, type GroundedState } from '../lib/grounding';
import { applyManualEdit, approveBrief, createEmptyBrief, FIELD_KEYS, type Message } from '../lib/state';
import { calendarDate, clockTime, relativeDate, validIsoDate } from '../lib/temporal';

const absent = (): GroundedField => ({ value: null, status: 'missing', constraint: null, evidence: [] });
const snapshot = (fields: Partial<GroundedState>): GroundedState => ({ ...Object.fromEntries(FIELD_KEYS.map((k) => [k, absent()])), ...fields }) as GroundedState;
const field = (value: string, id: string, quote: string): GroundedField => ({ value, status: 'resolved', constraint: null, evidence: [{ id, quote }] });

describe('grounded conversation state', () => {
  it('keeps an exact time when only the guest count has alternatives', () => {
    const text = 'Four people or five people at Juniper in Sydney on 18 October 2027 at 7 pm.';
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text }];
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ time: field('7 pm', 'm1', '7 pm') }), messages, null).fields.time.value).toBe('7 pm');
  });
  it('grounds a later exact clock in the same message as an earlier bound', () => {
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text: 'After 7 pm, 8:30 pm would work.' }];
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ time: field('8:30 pm', 'm1', '8:30 pm') }), messages, null).fields.time.value).toBe('8:30 pm');
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ time: field('8:30 pm', 'm1', messages[0].text) }), messages, null).fields.time.value).toBe('8:30 pm');
  });
  it('uses separate valid quotations from one message without duplicating source links', () => {
    const text = 'Two adults and maybe three children. The children are not confirmed.';
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text }];
    const partySize: GroundedField = { value: null, status: 'needs_clarification', constraint: 'Two adults and maybe three children', evidence: [{ id: 'm1', quote: 'Two adults and maybe three children' }, { id: 'm1', quote: 'The children are not confirmed.' }] };
    const state = snapshot({ partySize });
    expect(validationFeedback(state, messages, null)).toEqual([]);
    expect(reconcileGroundedState(createEmptyBrief(), state, messages, null).fields.partySize).toMatchObject({ value: null, status: 'needs_clarification', evidenceIds: ['m1'] });
  });
  it.each(['from 7 to 8 pm', 'between 7 and 8 pm', 'maybe at 8 pm'])('does not accept the clock inside %s as exact', text => {
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text }];
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ time: field('8 pm', 'm1', '8 pm') }), messages, null).fields.time.status).not.toBe('resolved');
  });
  it.each(['31 November 2026', '29 February 2026', '2026-13-01'])('keeps impossible date %s only as a clarification constraint', (date) => {
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text: `A table on ${date}.` }];
    const brief = reconcileGroundedState(createEmptyBrief(), snapshot({ date: field(date, 'm1', date) }), messages, null);
    expect(brief.fields.date).toMatchObject({ value: null, status: 'needs_clarification', constraint: date, evidenceIds: ['m1'] });
    expect(brief.history.at(-1)?.operation).toBe('constrain');
    expect(() => approveBrief(brief)).toThrow();
  });
  it('recognises booking requests as acceptance without accepting rejected alternatives', () => {
    expect(isAcceptance('Can you book me a table?')).toBe(true);
    expect(isAcceptance("That's excellent. Book a table please.")).toBe(true);
    expect(isAcceptance('Do not book that one')).toBe(false);
  });
  it('accepts a confirmed summary followed by a separate pricing question', () => {
    expect(isAcceptance('Yes, that is correct. Are they not very costly?')).toBe(true);
    const messages: Message[] = [{ id: 'offer', speaker: 'staff', text: 'Please confirm: March 1st for 2 people.' }, { id: 'accept', speaker: 'customer', text: 'Yes, that is correct. Are they not very costly?' }];
    const partySize: GroundedField = { ...field('2', 'offer', '2 people'), evidence: [{ id: 'offer', quote: '2 people' }, { id: 'accept', quote: 'Yes, that is correct.' }] };
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ partySize }), messages, null).fields.partySize.value).toBe('2');
  });
  it('keeps a later booking rejection effective even when the first sentence says yes', () => {
    expect(isAcceptance('Yes. Do not book that one.')).toBe(false);
    expect(isAcceptance('Yes, that is correct. Is it expensive? Do not book it.')).toBe(false);
  });
  it('does not mistake a question containing good for customer acceptance', () => {
    expect(isAcceptance('Is that a good choice?')).toBe(false);
  });
  it('keeps the stated date expression visible without inventing a calendar reference', () => {
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text: 'Today please' }];
    const brief = reconcileGroundedState(createEmptyBrief(), snapshot({ date: field('today', 'm1', 'Today') }), messages, null);
    expect(brief.fields.date.value).toBe('today');
    expect(brief.fields.date.status).toBe('needs_clarification');
    expect(() => approveBrief(brief)).toThrow();
  });
  it('requests a bounded recheck for a missing accepted party size even after small talk', () => {
    const messages: Message[] = [{ id: 'm1', speaker: 'staff', text: 'A table for 2 at Juniper?' }, { id: 'm2', speaker: 'customer', text: 'Yes, please' }, { id: 'm3', speaker: 'staff', text: 'The address is 10 High St' }, { id: 'm4', speaker: 'customer', text: 'Thanks' }];
    expect(validationFeedback(snapshot({}), messages, null).some((x) => x.startsWith('partySize:'))).toBe(true);
    messages[1].text = 'No, let me decide';
    expect(validationFeedback(snapshot({}), messages, null).some((x) => x.startsWith('partySize:'))).toBe(false);
  });
  it('uses a quoted semantic acceptance while rejecting a falsely tagged refusal', () => {
    const messages: Message[] = [{ id: 'm1', speaker: 'staff', text: 'Would 8 pm work?' }, { id: 'm2', speaker: 'customer', text: 'Absolutely, I would love that.' }];
    const candidate: GroundedField = { value: '8 pm', status: 'resolved', constraint: null, evidence: [{ id: 'm1', quote: '8 pm', kind: 'value' }, { id: 'm2', quote: 'Absolutely, I would love that.', kind: 'acceptance' }] };
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ time: candidate }), messages, null).fields.time.value).toBe('8 pm');
    candidate.evidence[1].quote = 'No, do not book that'; messages[1].text = 'No, do not book that';
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ time: candidate }), messages, null).fields.time.value).toBeNull();
  });
  it('clears an explicitly cancelled detail even when the model repeats an older value', () => {
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text: 'For four at 7 pm' }, { id: 'm2', speaker: 'customer', text: 'Forget the 7 pm time. I have not decided on a time yet.' }];
    const state = snapshot({ time: field('7 pm', 'm1', '7 pm'), partySize: field('4', 'm1', 'four') });
    const cleared = withExplicitClears(state, messages);
    expect(cleared.time.status).toBe('missing');
    expect(cleared.time.evidence[0].id).toBe('m2');
    expect(cleared.partySize.value).toBe('4');
    messages[1].text = 'Forget 7 pm, change the time to 8 pm instead.';
    expect(withExplicitClears(state, messages).time.value).toBe('7 pm');
  });
  it('allows a newly stated relative date after an earlier cancellation', () => {
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text: 'Cancel the whole booking request' }, { id: 'm2', speaker: 'customer', text: 'Start again for tomorrow' }];
    const state = snapshot({ date: field('2 October 2026', 'm2', 'tomorrow') });
    expect(withExplicitClears(state, messages, '2026-10-01').date.value).toBe('2 October 2026');
    state.date = field('9 October 2026', 'm1', 'Cancel the whole booking request');
    expect(withExplicitClears(state, messages, '2026-10-01').date.value).toBeNull();
  });
  it('recovers an earlier agreed field after an unrelated latest message', () => {
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text: 'Four people on 9 October 2026' }, { id: 'm2', speaker: 'customer', text: 'Thanks' }];
    const brief = reconcileGroundedState(createEmptyBrief(), snapshot({ partySize: field('4', 'm1', 'Four people'), date: field('9 October 2026', 'm1', '9 October 2026') }), messages, null);
    expect(brief.fields.partySize.value).toBe('4'); expect(brief.fields.date.value).toBe('9 October 2026');
  });
  it('rejects real IDs accompanied by fabricated quotations or unsupported values', () => {
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text: 'Four people please' }];
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ partySize: field('5', 'm1', 'Five people') }), messages, null).fields.partySize.value).toBeNull();
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ partySize: field('5', 'm1', 'Four people') }), messages, null).fields.partySize.value).toBeNull();
  });
  it('requires acceptance after a staff offer, never before it', () => {
    const offer = { ...field('8:30 pm', 'm2', '8:30 pm'), evidence: [{ id: 'm2', quote: '8:30 pm' }, { id: 'm1', quote: 'Yes' }] };
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text: 'Yes' }, { id: 'm2', speaker: 'staff', text: '8:30 pm?' }];
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ time: offer }), messages, null).fields.time.value).toBeNull();
    messages.push({ id: 'm3', speaker: 'customer', text: 'Yes, that works' }); offer.evidence[1] = { id: 'm3', quote: 'Yes, that works' };
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ time: offer }), messages, null).fields.time.value).toBe('8:30 pm');
  });
  it('retains an explicit month/day when a later accepted summary paraphrases it as a weekday', () => {
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text: 'March 5th' }, { id: 'm2', speaker: 'staff', text: 'Next Tuesday for two?' }, { id: 'm3', speaker: 'customer', text: 'Yes' }];
    const brief = reconcileGroundedState(createEmptyBrief(), snapshot({ date: field('March 5th', 'm1', 'March 5th') }), messages, null);
    expect(brief.fields.date.value).toBe('March 5th'); expect(brief.fields.date.status).toBe('needs_clarification');
    expect(() => approveBrief(brief)).toThrow();
  });
  it('resolves tomorrow with an explicit reference but rejects an invented year', () => {
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text: 'Tomorrow at 7 pm' }];
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ date: field('2026-10-02', 'm1', 'Tomorrow') }), messages, '2026-10-01').fields.date.value).toBe('2 October 2026');
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ date: field('2026-10-02', 'm1', 'Tomorrow') }), messages, null).fields.date.value).toBeNull();
  });
  it('repairs a missed acceptance on a later turn without permitting rollback to older evidence', () => {
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text: 'At 7 pm' }, { id: 'm2', speaker: 'staff', text: 'Would 8 pm work?' }, { id: 'm3', speaker: 'customer', text: 'Sounds great' }, { id: 'm4', speaker: 'customer', text: 'Thanks' }];
    const initial = reconcileGroundedState(createEmptyBrief(), snapshot({ time: field('7 pm', 'm1', '7 pm') }), messages.slice(0, 1), null);
    const corrected = { ...field('8 pm', 'm2', '8 pm'), evidence: [{ id: 'm2', quote: 'Would 8 pm work?' }, { id: 'm3', quote: 'Sounds great' }] };
    const next = reconcileGroundedState(initial, snapshot({ time: corrected }), messages, null);
    expect(next.fields.time.value).toBe('8 pm');
    expect(reconcileGroundedState(next, snapshot({ time: field('7 pm', 'm1', '7 pm') }), messages, null).fields.time.value).toBe('8 pm');
  });
  it('grounds a date assembled from a month/day and a later year answer', () => {
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text: 'March 3rd' }, { id: 'm2', speaker: 'staff', text: 'Which year?' }, { id: 'm3', speaker: 'customer', text: '2027, please' }];
    const candidate = { ...field('3 March 2027', 'm1', 'March 3rd'), evidence: [{ id: 'm1', quote: 'March 3rd' }, { id: 'm2', quote: 'Which year?' }, { id: 'm3', quote: '2027' }] };
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ date: candidate }), messages, null).fields.date.value).toBe('3 March 2027');
    candidate.value = '3 March 2028';
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ date: candidate }), messages, null).fields.date.value).toBeNull();
  });
  it('grounds a day correction from the established month/year without overwriting unrelated fields', () => {
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text: '9 October 2026' }, { id: 'm2', speaker: 'customer', text: 'Actually the 10th, everything else stays the same' }];
    const candidate = { ...field('10 October 2026', 'm1', '9 October 2026'), evidence: [{ id: 'm1', quote: '9 October 2026' }, { id: 'm2', quote: 'Actually the 10th' }] };
    expect(reconcileGroundedState(createEmptyBrief(), snapshot({ date: candidate }), messages, null).fields.date.value).toBe('10 October 2026');
  });
  it('preserves a staff edit and does not add history for repeated equivalent state', () => {
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text: 'For four at 7 pm' }];
    const state = snapshot({ partySize: field('4', 'm1', 'four'), time: field('7 pm', 'm1', '7 pm') });
    const initial = reconcileGroundedState(createEmptyBrief(), state, messages, null);
    const repeated = reconcileGroundedState(initial, state, messages, null);
    expect(repeated.revision).toBe(initial.revision);
    expect(reconcileGroundedState(applyManualEdit(initial, 'partySize', '6'), state, messages, null).fields.partySize.value).toBe('6');
  });
  it('does not erase a previous field merely because the model omits evidence', () => {
    const messages: Message[] = [{ id: 'm1', speaker: 'customer', text: 'For four' }];
    const initial = reconcileGroundedState(createEmptyBrief(), snapshot({ partySize: field('4', 'm1', 'four') }), messages, null);
    expect(reconcileGroundedState(initial, snapshot({}), messages, null).fields.partySize.value).toBe('4');
  });
});

describe('calendar and clock handling', () => {
  it('recognises equivalent month/day forms without inventing a year', () => {
    expect(calendarDate('3rd of March')?.value).toBe('March 3rd');
    expect(calendarDate('March 3rd')?.year).toBeNull();
    expect(calendarDate('March 3, 2026')?.value).toBe('3 March 2026');
    expect(calendarDate('31 February 2026')).toBeNull();
    expect(validIsoDate('2026-02-29')).toBe(false);
  });
  it('converts periods, noon and written times while retaining ambiguous clocks', () => {
    expect(clockTime("two o'clock in the afternoon")).toBe('2 pm');
    expect(clockTime('half past five in the evening')).toBe('5:30 pm');
    expect(clockTime('13:00')).toBe('1 pm');
    expect(clockTime('12:00')).toBeNull();
    expect(clockTime('noon')).toBe('12 pm');
    expect(clockTime('midnight')).toBe('12 am');
    expect(clockTime('7.30 pm')).toBe('7:30 pm');
  });
  it('anchors relative dates across month and year boundaries', () => {
    expect(relativeDate('tomorrow', '2026-12-31')).toBe('2027-01-01');
    expect(relativeDate('tomorrow', '2026-02-30')).toBeNull();
  });
});
