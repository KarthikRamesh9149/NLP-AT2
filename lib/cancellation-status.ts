import type { Brief, Message } from './state';
import { FIELD_KEYS } from './state';
import { requestsCancellation } from './booking-intent';

export const CANCELLATION_NOTICE = 'This booking enquiry is cancelled. Its extracted details have been cleared. Start a new brief when you are ready.';

/** Recognise an already-cleared enquiry without changing extracted values. */
export function isCancelledBooking(brief: Brief, messages: Message[]): boolean {
  if (!FIELD_KEYS.every(key => brief.fields[key].status === 'missing' && brief.fields[key].value === null && brief.fields[key].constraint === null)) return false;
  const cancellation = messages.findLastIndex(message => message.speaker === 'customer'
    && requestsCancellation(message.text));
  if (cancellation < 0 || !FIELD_KEYS.every(key => brief.fields[key].evidenceIds.includes(messages[cancellation].id))) return false;
  return !messages.slice(cancellation + 1).some(message => message.speaker === 'customer'
    && /\b(?:(?:start|make|begin)\s+(?:a\s+)?(?:new|another)\s+(?:booking|reservation|enquiry)|reopen|start again)\b/i.test(message.text)
    && !/\b(?:don't|do not|not|never)\b/i.test(message.text));
}
