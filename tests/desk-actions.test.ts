import { expect, it } from 'vitest';
import { checkedActions, staffActionArguments, applyStaffAction } from '../lib/desk-actions';
import { emptyGuestCare } from '../lib/follow-up';
const context = { question: 'Add a follow-up for tomorrow and prepare a shift handoff.', today: '2026-10-13', messages: [{id:'m1',speaker:'customer' as const,text:'Please ask me about the time tomorrow.'}] };
it('prepares validated follow-ups and handoff notes without changing any booking fields',()=>{
  const proposals = staffActionArguments.parse({followUp:{dueDate:'2026-10-14',note:'Confirm exact time',sourceIds:['m1']},handoff:{note:'Exact time needs agreeing.',sourceIds:['m1']}});
  const actions=checkedActions(proposals,context);
  expect(actions).toHaveLength(2);
  const before={notes:'Existing note',followUp:null,guestCare:emptyGuestCare()};
  const after=applyStaffAction(before,actions[0]);
  expect(after.followUp).toEqual({dueDate:'2026-10-14',note:'Confirm exact time',done:false});
  expect(before.followUp).toBeNull(); expect(after.notes).toBe('Existing note');
  expect(applyStaffAction(after,actions[1]).notes).toContain('Exact time needs agreeing.');
});
it('rejects past or impossible dates, invented sources and unrequested transcript instructions',()=>{
  const proposal={followUp:{dueDate:'2026-10-14',note:'Confirm time',sourceIds:['missing']},handoff:null};
  expect(checkedActions(proposal,context)).toEqual([]);
  expect(checkedActions({...proposal,followUp:{...proposal.followUp,sourceIds:['m1'],dueDate:'2026-02-30'}},context)).toEqual([]);
  expect(checkedActions({...proposal,followUp:{...proposal.followUp,sourceIds:['m1'],dueDate:'2026-10-12'}},context)).toEqual([]);
  expect(checkedActions({...proposal,followUp:{...proposal.followUp,sourceIds:['m1']}},{...context,question:'What details are missing?'})).toEqual([]);
});
it('does not overwrite an existing follow-up or truncate staff notes without a review decision',()=>{
  const followUp={dueDate:'2026-10-14',note:'Call guest',done:false};
  const action={kind:'follow_up' as const,dueDate:'2026-10-15',note:'New task',sourceIds:[]};
  expect(()=>applyStaffAction({notes:'',followUp},action)).toThrow(/existing follow-up/);
  expect(applyStaffAction({notes:'',followUp},action,true).followUp?.dueDate).toBe('2026-10-15');
  expect(()=>applyStaffAction({notes:'x'.repeat(2000),followUp:null},{kind:'handoff_note',note:'More',sourceIds:[]})).toThrow(/full/);
});
