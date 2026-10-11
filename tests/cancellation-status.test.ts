import { describe, expect, it } from 'vitest';
import { isCancelledBooking } from '../lib/cancellation-status';
import { createEmptyBrief, FIELD_KEYS, type Message } from '../lib/state';

const messages: Message[] = [{ id: 'cancel', speaker: 'customer', text: 'Please cancel the whole booking request. Remove all its details.' }];
const cleared = () => {
  const brief = createEmptyBrief();
  for (const key of FIELD_KEYS) brief.fields[key].evidenceIds = ['cancel'];
  return brief;
};

describe('cancelled enquiry presentation', () => {
  it('recognises cleared fields grounded in a whole-request cancellation', () => {
    expect(isCancelledBooking(cleared(), messages)).toBe(true);
    expect(isCancelledBooking(cleared(), [...messages, { id: 'thanks', speaker: 'customer', text: 'Thanks, that is all.' }])).toBe(true);
  });
  it('does not suppress questions for a new empty enquiry or an unprocessed cancellation', () => {
    expect(isCancelledBooking(createEmptyBrief(), [])).toBe(false);
    expect(isCancelledBooking(createEmptyBrief(), messages)).toBe(false);
  });
  it('allows a new enquiry after cancellation', () => {
    expect(isCancelledBooking(cleared(), [...messages, { id: 'new', speaker: 'customer', text: 'Start a new booking, please.' }])).toBe(false);
    const reopened = cleared();
    reopened.fields.partySize = { ...reopened.fields.partySize, value: '5', status: 'resolved', evidenceIds: ['new'] };
    expect(isCancelledBooking(reopened, messages)).toBe(false);
  });
  it('keeps a cancellation acknowledgement after a refusal to reopen', () => {
    expect(isCancelledBooking(cleared(), [...messages, { id: 'no', speaker: 'customer', text: "Do not start a new booking." }])).toBe(true);
  });
  it('does not mistake partial clearing or rescheduling for whole cancellation', () => {
    expect(isCancelledBooking(cleared(), [{ ...messages[0], text: 'Forget the time. I am undecided.' }])).toBe(false);
    expect(isCancelledBooking(cleared(), [{ ...messages[0], text: 'Cancel the booking and reschedule it instead.' }])).toBe(false);
  });
  it('leaves retained staff values and constraints available for review', () => {
    const brief = cleared(); brief.fields.partySize = { ...brief.fields.partySize, value: '6', source: 'staff', status: 'resolved' };
    expect(isCancelledBooking(brief, messages)).toBe(false);
    const constrained = cleared(); constrained.fields.time.constraint = 'after 8 pm';
    expect(isCancelledBooking(constrained, messages)).toBe(false);
  });
});
