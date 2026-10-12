import type { BookingCase } from './cases';
import { calendarDate, clockTime, validIsoDate } from './temporal';
import { needsSavedReview } from './session';
import { caseStatus } from './case-status';
import type { FieldState } from './state';

export function knownGuestCount(record: BookingCase): number | null {
  const field=record.session.brief.fields.partySize;
  const count=Number(field.value);
  return !record.session.pendingAnalysis && !needsSavedReview(record.session) && field.status==='resolved' && !field.review && /^\d+$/.test(field.value || '') && count>=1 && count<=30 ? count : null;
}
function handoffDetail(field: FieldState, label: string): string {
  if(field.review) return `${label} to confirm`;
  return field.status==='resolved' && field.value ? field.value : field.constraint || `${label} to confirm`;
}

export function enquiryDate(record: BookingCase): string | null {
  const { session } = record; const field = session.brief.fields.date;
  if (session.pendingAnalysis || needsSavedReview(session) || caseStatus(record) === 'Cancelled' || field.status !== 'resolved' || field.review || !field.value) return null;
  const date = calendarDate(field.value);
  return date?.year ? `${String(date.year).padStart(4,'0')}-${String(date.month).padStart(2,'0')}-${String(date.day).padStart(2,'0')}` : null;
}
function timeMinutes(record: BookingCase): number | null {
  const field = record.session.brief.fields.time;
  const time = field.status === 'resolved' && !field.review && field.value ? clockTime(field.value) : null;
  const match = time?.match(/^(\d+)(?::(\d+))? (am|pm)$/);
  return match ? (Number(match[1]) % 12 + (match[3] === 'pm' ? 12 : 0)) * 60 + Number(match[2] || 0) : null;
}
export function buildServicePlan(records: BookingCase[], date: string, today: string) {
  if (!validIsoDate(date) || !validIsoDate(today)) throw new Error('Choose a valid service date.');
  const active = records.filter(record => !record.archived);
  const service = active.filter(record => enquiryDate(record) === date).map(record => ({ record, timeMinutes: timeMinutes(record) }))
    .sort((a,b) => (a.timeMinutes ?? 1441) - (b.timeMinutes ?? 1441) || a.record.title.localeCompare(b.record.title));
  const unscheduled = active.filter(record => !enquiryDate(record) && caseStatus(record) !== 'Cancelled');
  const followUps = active.filter(record => record.session.followUp && !record.session.followUp.done)
    .sort((a,b) => a.session.followUp!.dueDate.localeCompare(b.session.followUp!.dueDate))
    .map(record => ({ record, overdue: record.session.followUp!.dueDate < today }));
  const knownGuests = service.reduce((sum, { record }) => sum+(knownGuestCount(record) ?? 0), 0);
  return { service, unscheduled, followUps, knownGuests };
}
export type ServicePlan = ReturnType<typeof buildServicePlan>;
export function shiftHandoff(plan: ServicePlan, date: string): string {
  const describe = (record: BookingCase) => {
    const fields = record.session.brief.fields; const care = record.session.guestCare;
    const guests=knownGuestCount(record);
    const details=record.session.pendingAnalysis || needsSavedReview(record.session) ? 'Booking details need review.' : `${handoffDetail(fields.date,'Date')} · ${handoffDetail(fields.time,'Time')} · ${guests===null ? 'Guests to confirm' : `${guests} ${guests===1 ? 'guest' : 'guests'}`}`;
    return [`${record.title} · ${caseStatus(record)}`, details,
      ...(care ? Object.entries(care).filter(([,value]) => value).map(([key,value]) => `${({ name:'Guest',contact:'Contact',dietary:'Dietary requests',seating:'Seating',occasion:'Occasion' } as Record<string,string>)[key]}: ${value}`) : []),
      ...(record.notes ? [`Staff notes: ${record.notes}`] : []), ...(record.session.followUp ? [`Follow-up ${record.session.followUp.done ? 'completed' : record.session.followUp.dueDate}: ${record.session.followUp.note}`] : [])].join('\n');
  };
  return ['FORMBRIDGE · SHIFT HANDOFF',date,'Booking enquiries for staff review. No table is reserved.', '',
    'SERVICE ENQUIRIES', ...(plan.service.length ? plan.service.map(({record}) => describe(record)+'\n') : ['No saved enquiries for this date.']),
    '', 'OPEN FOLLOW-UPS', ...(plan.followUps.length ? plan.followUps.map(({record}) => describe(record)+'\n') : ['No open follow-ups.']),
    '', 'DATE STILL NEEDED', ...(plan.unscheduled.length ? plan.unscheduled.map(describe) : ['None.'])].join('\n');
}
