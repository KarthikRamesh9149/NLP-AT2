import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { exportCase, importCase, saveCase, type BookingCase } from '../lib/cases';
import { analysisPayload, mergeAnalysisHistory, rebuildForTranscriptChange, resolveFieldReview } from '../lib/draft-workflow';
import { applyManualEdit, approveBrief, createEmptyBrief, FIELD_KEYS } from '../lib/state';
import { calendarExport, textExport } from '../lib/exports';
import { reconcileGroundedState, type GroundedState } from '../lib/grounding';
import { validateBookingLink } from '../lib/booking-links';
import { checkedDeskReply } from '../lib/server/desk-assistant';
import { costMicroUsd, maximumCost } from '../lib/server/usage-budget';
import type { SavedSession } from '../lib/session';

function session(): SavedSession {
  let brief = createEmptyBrief();
  for (const [field,value] of [['restaurantName','Juniper'],['city','Sydney'],['date','18 October 2027'],['time','7 pm'],['partySize','4']] as const) brief = applyManualEdit(brief,field,value);
  return { messages:[{id:'m1',speaker:'customer',text:'Juniper in Sydney for four people on 18 October 2027 at 7 pm.'}], brief:approveBrief(brief), referenceDate:'2026-10-13', pendingAnalysis:false };
}
describe('enquiry workflow', () => {
  it('reopens an exported case without importing its approval as a new decision', () => {
    const reopened=importCase(JSON.stringify(exportCase(session(),'Saturday dinner','Call before handoff')));
    expect(reopened.title).toBe('Saturday dinner'); expect(reopened.notes).toBe('Call before handoff');
    expect(reopened.session.messages).toHaveLength(1); expect(reopened.session.pendingAnalysis).toBe(true);
    expect(reopened.session.brief.approvedRevision).toBeNull(); expect(()=>approveBrief(reopened.session.brief)).toThrow();
  });
  it('supports the earlier JSON format while rejecting duplicate message IDs', () => {
    const original=session();
    const file={fields:original.brief.fields,changes:original.brief.history,messages:original.messages};
    expect(importCase(JSON.stringify(file)).session.messages[0].text).toContain('Juniper');
    expect(()=>importCase(JSON.stringify({...file,messages:[...file.messages,...file.messages]}))).toThrow(/invalid/i);
  });
  it('discards model-derived fields when a source message is edited or removed', () => {
    const original=session(); original.brief.fields.city.source='model'; original.brief.fields.city.evidenceIds=['m1'];
    const reset=rebuildForTranscriptChange(original.brief);
    expect(reset.fields.city.value).toBeNull(); expect(reset.fields.city.evidenceIds).toEqual([]);
    expect(reset.fields.partySize.value).toBe('4'); expect(reset.fields.partySize.status).toBe('needs_clarification');
    expect(()=>approveBrief(reset)).toThrow();
  });
  it('requires a choice on a staff conflict and remembers a deliberate choice', () => {
    const original=session(); const messages=[...original.messages,{id:'m2',speaker:'customer' as const,text:'Actually five people.'}];
    const candidate=Object.fromEntries(FIELD_KEYS.map(key=>[key,{value:null,status:'missing',constraint:null,evidence:[]}])) as unknown as GroundedState;
    candidate.partySize={value:'5',status:'resolved',constraint:null,evidence:[{id:'m2',quote:'five people'}]};
    const conflict=reconcileGroundedState(original.brief,candidate,messages,null);
    expect(()=>approveBrief(conflict)).toThrow();
    const chosen=resolveFieldReview(conflict,'partySize','conversation'); expect(chosen.fields.partySize.value).toBe('5'); expect(chosen.fields.partySize.review).toBeUndefined();
    const kept=resolveFieldReview(conflict,'partySize','staff'); expect(kept.fields.partySize.value).toBe('4');
    expect(reconcileGroundedState(kept,candidate,[...messages,{id:'m3',speaker:'customer',text:'Thanks'}],null).fields.partySize.review).toBeUndefined();
  });
  it('does not send the change history over the wire, but preserves it after analysis', () => {
    const original=session(); for(let i=0;i<220;i++) original.brief=applyManualEdit(original.brief,'partySize',i%2?'4':'5');
    expect(analysisPayload(original.messages,original.brief,original.referenceDate!).brief.history).toEqual([]);
    const result=applyManualEdit({...original.brief,history:[]},'partySize','6');
    const merged=mergeAnalysisHistory(original.brief,result); expect(merged.history).toHaveLength(200); expect(merged.history.at(-1)?.nextValue).toBe('6');
  });
  it('refuses to silently evict an existing device case at the storage limit', () => {
    const records:BookingCase[]=Array.from({length:50},(_,index)=>({id:randomUUID(),title:`Enquiry ${index}`,notes:'',archived:false,updatedAt:new Date().toISOString(),session:session()}));
    expect(()=>saveCase(records,{...records[0],id:randomUUID()})).toThrow(/50/);
    expect(saveCase(records,{...records[0],title:'Revised enquiry'})).toHaveLength(50);
    expect(records[0].title).toBe('Enquiry 0');
  });
});
describe('safe handoffs',()=>{
  it('marks exports with stale details as unfinished, even if an old revision was approved',()=>{
    const original=session(); original.pendingAnalysis=true;
    expect(exportCase(original,'Dinner').status).toBe('unfinished_update');
    expect(textExport(original,'Dinner')).toContain('UNFINISHED UPDATE');
    expect(()=>calendarExport(original)).toThrow();
  });
  it('creates a tentative calendar reminder at the requested time without inventing a duration',()=>{
    const content=calendarExport(session());
    expect(content).toContain('DTSTART:20271018T190000\r\n'); expect(content).toContain('STATUS:TENTATIVE');
    expect(content).not.toContain('DTEND:'); expect(content).toContain('No table is reserved.');
  });
  it.each(['https://opentable.com.evil.example/r/venue','javascript:alert(1)','http://www.opentable.com/r/venue','https://user:password@opentable.com/r/venue'])('rejects unsafe provider URL %s',url=>{
    expect(()=>validateBookingLink({provider:'opentable',url,restaurantName:'Juniper',city:'Sydney'})).toThrow();
  });
  it('accepts a secure page on the chosen provider',()=>{ expect(validateBookingLink({provider:'resy',url:'https://resy.com/cities/sydney',restaurantName:'Juniper',city:'Sydney'}).provider).toBe('resy'); });
  it('does not deliver an assistant claim that it reserved a table',()=>{
    expect(checkedDeskReply({answer:'I have booked your table.',replyDraft:'Your booking is confirmed.',sourceIds:['made-up']},[]).replyDraft).toBeNull();
    expect(checkedDeskReply({answer:'Ask for an exact time.',replyDraft:null,sourceIds:['m1','made-up','m1']},session().messages).sourceIds).toEqual(['m1']);
  });
  it('reserves enough budget for both extraction and a full repair, and rejects unknown prices',()=>{
    const ceiling=maximumCost({messages:session().messages},'formbridge');
    expect(ceiling).toBeGreaterThan(costMicroUsd('gpt-6-luna',2000,2400)+costMicroUsd('gpt-6.1-sol',3000,2400));
    expect(()=>costMicroUsd('unknown-model',100,100)).toThrow(/verified price/);
  });
});
