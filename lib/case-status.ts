import type { BookingCase } from './cases';
import { FIELD_KEYS } from './state';
import { needsSavedReview } from './session';
import { isCancelledBooking } from './cancellation-status';
import { reviewedSession } from './exports';

export function caseStatus(record: BookingCase): string {
  const { brief, messages, pendingAnalysis } = record.session;
  if (record.archived) return 'Archived';
  if (needsSavedReview(record.session)) return 'Review saved brief';
  if (pendingAnalysis) return 'Update unfinished';
  if (isCancelledBooking(brief, messages)) return 'Cancelled';
  if (reviewedSession(record.session)) return 'Approved';
  if (FIELD_KEYS.every(key => brief.fields[key].status === 'resolved' && !!brief.fields[key].value && !brief.fields[key].review)) return 'Ready for review';
  return 'Needs details';
}
