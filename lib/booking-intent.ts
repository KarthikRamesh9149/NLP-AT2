import { cleanText } from './temporal';
import type { Message } from './state';

/** Only an unconditional cancellation request clears an enquiry. */
export function requestsCancellation(raw: string): boolean {
  const text = cleanText(raw);
  return text.split(/[.!;\n]/).some(clause => {
    const match = /\b(?:cancel|forget|remove|clear)\s+(?:(?:the|my|this|our)\s+)?(?:(?:whole|entire)\s+)?(?:booking|reservation)(?:\s+request)?\b/.exec(clause);
    if (!match) return false;
    const prefix = clause.slice(0, match.index);
    const politeRequest = /^\s*(?:please\s+)?(?:can|could|would|will)\s+you\s+(?:please\s+)?$/.test(prefix);
    if (/\b(?:if|unless|whether|when|might|may|perhaps|maybe|possibly)\b/.test(clause) || (/\bcould\b/.test(clause) && !politeRequest)) return false;
    if (/\b(?:not|never|don't|do not|won't|cannot|can't|no need|avoid|without|stop)\b/.test(prefix)) return false;
    if (/\b(?:said|wrote|quoted|mentioned|yesterday|previously)\b/.test(prefix)) return false;
    if (!politeRequest && (/\b(?:can|could|should|would|will)\s+(?:i|we|you)\b/.test(prefix) || /\?/.test(clause))) return false;
    return !/\b(?:instead|change|reschedule|move)\b/.test(clause);
  });
}

/** Strip instruction clauses, preserving neighbouring booking information. */
export function bookingMessages(messages: Message[]): Message[] {
  return messages.flatMap(message => {
    if (!/\b(?:ignore (?:all |any )?(?:previous|prior|system) instructions|not a booking change)\b/i.test(message.text)) return [message];
    const clauses = message.text.split(/(?<=[.!?;])\s+|\n/);
    const text = clauses.filter(clause => !/\b(?:ignore (?:all |any )?(?:previous|prior|system) instructions|not a booking change)\b/i.test(clause)).join(' ').trim();
    // Without a clear clause boundary, keep the real transcript on screen and
    // abstain from using that clause as extraction evidence.
    return text ? [{ ...message, text }] : [];
  });
}
