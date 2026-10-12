import { describe, expect, it } from 'vitest';
import { demoBrief, demoMessages } from '../lib/demo';
import { restoreSession, CURRENT_ANALYSIS_VERSION } from '../lib/session';
import { createEmptyBrief } from '../lib/state';

describe('browser draft restoration', () => {
  const example = JSON.stringify({ messages: demoMessages, brief: demoBrief, analysisVersion: CURRENT_ANALYSIS_VERSION });

  it('starts empty on a new visit or after the old automatic example', () => {
    expect(restoreSession(null, null)).toBeNull();
    expect(restoreSession(null, example)).toBeNull();
  });

  it('preserves a visitor-created draft from the previous storage key', () => {
    const draft = { messages: [{ id: 'custom-1', speaker: 'customer' as const, text: 'A table for two, please.' }], brief: createEmptyBrief() };
    expect(restoreSession(null, JSON.stringify(draft))).toEqual(draft);
  });

  it('preserves an explicitly loaded example from the new storage key', () => {
    expect(restoreSession(example, null)).toEqual({ messages: demoMessages, brief: demoBrief, analysisVersion: CURRENT_ANALYSIS_VERSION });
  });

  it('requires a fresh check for cached model values from an older extractor', () => {
    const brief=createEmptyBrief();
    for (const [key,value] of [['restaurantName','Juniper'],['city','Sydney'],['date','4 March 2027'],['time','7 pm'],['partySize','4']] as const) brief.fields[key]={value,status:'resolved',constraint:null,evidenceIds:['m1'],source:'model',note:''};
    brief.approvedRevision=brief.revision;
    const raw=JSON.stringify({messages:[{id:'m1',speaker:'customer',text:'Juniper in Sydney for 4 March 2027 at 7 pm.'}],brief,analysisVersion:'grounded-state-v7',notes:'Keep this handoff note'});
    const restored=restoreSession(raw,null)!;
    expect(restored.pendingAnalysis).toBe(true); expect(restored.brief.approvedRevision).toBeNull();
    expect(restored.brief.fields.partySize.value).toBeNull(); expect(restored.messages).toHaveLength(1); expect(restored.notes).toBe('Keep this handoff note');
  });
  it('ignores damaged storage', () => {
    expect(restoreSession('{', '{')).toBeNull();
  });
});
