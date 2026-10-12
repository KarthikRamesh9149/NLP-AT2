import { describe, expect, it } from 'vitest';
import { createEmptyBrief, applyManualEdit } from '../lib/state';
import { CURRENT_ANALYSIS_VERSION, parseSession } from '../lib/session';
import { importCase, exportCase, type BookingCase } from '../lib/cases';
import { buildServicePlan, shiftHandoff } from '../lib/service-planner';
import { emptyGuestCare, followUpSchema } from '../lib/follow-up';

function enquiry(overrides: Partial<BookingCase> = {}): BookingCase {
  let brief = createEmptyBrief();
  for (const [key, value] of [['restaurantName','Juniper'],['city','Sydney'],['date','18 October 2027'],['time','8:30 pm'],['partySize','4']] as const) brief = applyManualEdit(brief, key, value);
  return { id: '00000000-0000-4000-8000-000000000001', title: 'Saturday dinner', notes: 'Call before the next shift.', archived: false, updatedAt: '2026-10-13T00:00:00Z', session: { messages: [], brief, analysisVersion: CURRENT_ANALYSIS_VERSION }, ...overrides };
}
describe('service planner', () => {
  it('orders actual clock times, includes only the selected date and counts known guests', () => {
    const early = enquiry({ id: '00000000-0000-4000-8000-000000000002' });
    early.session.brief = applyManualEdit(early.session.brief, 'time', 'noon');
    const later = enquiry(); const other = enquiry({ id: '00000000-0000-4000-8000-000000000003' });
    other.session.brief = applyManualEdit(other.session.brief, 'date', '19 October 2027');
    const plan = buildServicePlan([later, other, early], '2027-10-18', '2026-10-13');
    expect(plan.service.map(item => item.record.id)).toEqual([early.id, later.id]);
    expect(plan.knownGuests).toBe(8);
  });
  it('never schedules a stale, unfinished, disputed or yearless date', () => {
    for (const mode of ['old', 'pending', 'review', 'yearless'] as const) {
      const item = enquiry();
      if (mode === 'old') item.session.analysisVersion = 'grounded-state-v1';
      if (mode === 'pending') item.session.pendingAnalysis = true;
      if (mode === 'review') item.session.brief.fields.date.review = { reason: 'staff_conflict', value: '19 October 2027', status: 'resolved', constraint: null, evidenceIds: [] };
      if (mode === 'yearless') item.session.brief = applyManualEdit(item.session.brief, 'date', 'October 18th');
      const plan = buildServicePlan([item], '2027-10-18', '2026-10-13');
      expect(plan.service).toHaveLength(0); expect(plan.unscheduled).toHaveLength(1);
    }
  });
  it('shows dated enquiries with unknown times after exact times and preserves uncertainty', () => {
    const item = enquiry(); item.session.brief.fields.time = { value: null, status: 'needs_clarification', source: 'model', evidenceIds: [], constraint: 'after 8 pm', note: '' };
    const plan = buildServicePlan([item], '2027-10-18', '2026-10-13');
    expect(plan.service[0].timeMinutes).toBeNull(); expect(shiftHandoff(plan,'2027-10-18')).toContain('after 8 pm');
    expect(shiftHandoff(plan,'2027-10-18')).toContain('No table is reserved');
  });
  it('keeps overdue follow-ups visible until completed and excludes archived records', () => {
    const item = enquiry(); item.session.followUp = { dueDate: '2026-10-12', note: 'Ask for the exact time', done: false };
    const archived = enquiry({ archived: true }); archived.session.followUp = item.session.followUp;
    const plan = buildServicePlan([item, archived], '2027-10-18', '2026-10-13');
    expect(plan.followUps).toHaveLength(1); expect(plan.followUps[0].overdue).toBe(true);
    item.session.followUp.done = true;
    expect(buildServicePlan([item], '2027-10-18', '2026-10-13').followUps).toHaveLength(0);
  });
  it('rejects impossible follow-up dates and preserves valid metadata through export/reimport', () => {
    expect(followUpSchema.safeParse({ dueDate: '2026-02-30', note: 'Call', done: false }).success).toBe(false);
    const item = enquiry(); item.session.followUp = { dueDate: '2026-10-14', note: 'Confirm time', done: false };
    expect(parseSession(JSON.stringify(item.session))?.followUp).toEqual(item.session.followUp);
    const imported = importCase(JSON.stringify(exportCase(item.session, item.title, item.notes)));
    expect(imported.session.followUp).toEqual(item.session.followUp);
    expect(imported.session.brief.approvedRevision).toBeNull();
    expect(parseSession(JSON.stringify({ ...item.session, followUp: { dueDate: 'bad', note: 'Call', done: false } }))).toBeNull();
  });
  it('retains guest requests in a handoff and ignores unknown imported guest properties',()=>{
    const item=enquiry(); item.session.guestCare={...emptyGuestCare(),name:'Alex',dietary:'One vegetarian guest',occasion:'Birthday'};
    const exported=exportCase(item.session,item.title,item.notes);
    const imported=importCase(JSON.stringify({...exported,guestCare:{...item.session.guestCare,extra:'not a supported field'}}));
    expect(imported.session.guestCare).toEqual(item.session.guestCare);
    expect(shiftHandoff(buildServicePlan([item],'2027-10-18','2026-10-13'),'2027-10-18')).toContain('Dietary requests: One vegetarian guest');
    expect(item.session.brief.fields.partySize.value).toBe('4');
  });
  it('includes upcoming tasks in a shift handoff and excludes invalid guest counts from totals',()=>{
    const item=enquiry(); item.session.followUp={dueDate:'2026-10-14',note:'Check vegetarian request',done:false};
    expect(shiftHandoff(buildServicePlan([item],'2026-10-13','2026-10-13'),'2026-10-13')).toContain('Check vegetarian request');
    item.session.brief.fields.partySize.value='999';
    expect(buildServicePlan([item],'2027-10-18','2026-10-13').knownGuests).toBe(0);
  });
  it('does not present disputed guest counts or times as agreed in a handoff',()=>{
    const item=enquiry();
    item.session.brief.fields.time.review={reason:'staff_conflict',value:'9 pm',status:'resolved',constraint:null,evidenceIds:[]};
    item.session.brief.fields.partySize.review={reason:'staff_conflict',value:'5',status:'resolved',constraint:null,evidenceIds:[]};
    const plan=buildServicePlan([item],'2027-10-18','2026-10-13');
    const handoff=shiftHandoff(plan,'2027-10-18');
    expect(plan.knownGuests).toBe(0);
    expect(handoff).toContain('Time to confirm');
    expect(handoff).toContain('Guests to confirm');
    expect(handoff).not.toContain('8:30 pm');
    expect(handoff).not.toContain('4 guests');
  });
  it('keeps unfinished saved booking details out of the handoff while retaining staff tasks',()=>{
    const item=enquiry();item.session.pendingAnalysis=true;
    item.session.followUp={dueDate:'2026-10-14',note:'Check the updated request',done:false};
    const handoff=shiftHandoff(buildServicePlan([item],'2027-10-18','2026-10-13'),'2027-10-18');
    expect(handoff).toContain('Booking details need review.');
    expect(handoff).toContain('Check the updated request');
    expect(handoff).not.toContain('8:30 pm');
  });
});
