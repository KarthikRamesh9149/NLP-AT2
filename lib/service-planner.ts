import type { BookingCase } from './cases';
import { calendarDate, clockTime, validIsoDate } from './temporal';
import { needsSavedReview } from './session';
import { caseStatus } from './case-status';

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
  const knownGuests = service.reduce((sum, { record }) => { const field = record.session.brief.fields.partySize; return sum + (field.status === 'resolved' && !field.review && /^\d+$/.test(field.value || '') ? Number(field.value) : 0); }, 0);
  return { service, unscheduled, followUps, knownGuests };
}
export type ServicePlan = ReturnType<typeof buildServicePlan>;
export function shiftHandoff(plan: ServicePlan, date: string): string {
  const describe = (record: BookingCase) => {
    const fields = record.session.brief.fields; const care = record.session.guestCare;
    return [`${record.title} · ${caseStatus(record)}`, `${fields.date.value || 'Date needed'} · ${fields.time.value || fields.time.constraint || 'Time needed'} · ${fields.partySize.value || '?'} guests`,
      ...(care ? Object.entries(care).filter(([,value]) => value).map(([key,value]) => `${({ name:'Guest',contact:'Contact',dietary:'Dietary requests',seating:'Seating',occasion:'Occasion' } as Record<string,string>)[key]}: ${value}`) : []),
      ...(record.notes ? [`Staff notes: ${record.notes}`] : []), ...(record.session.followUp ? [`Follow-up ${record.session.followUp.done ? 'completed' : record.session.followUp.dueDate}: ${record.session.followUp.note}`] : [])].join('\n');
  };
  const due = plan.followUps.filter(({record}) => record.session.followUp!.dueDate <= date);
  return ['FORMBRIDGE · SHIFT HANDOFF',date,'Booking enquiries for staff review. No table is reserved.', '',
    'SERVICE ENQUIRIES', ...(plan.service.length ? plan.service.map(({record}) => describe(record)+'\n') : ['No saved enquiries for this date.']),
    '', 'FOLLOW-UPS DUE', ...(due.length ? due.map(({record}) => describe(record)+'\n') : ['No follow-ups due.']),
    '', 'DATE STILL NEEDED', ...(plan.unscheduled.length ? plan.unscheduled.map(describe) : ['None.'])].join('\n');
}
