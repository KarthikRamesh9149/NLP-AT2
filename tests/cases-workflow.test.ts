import { describe, expect, it } from 'vitest';
import { applyManualEdit, createEmptyBrief } from '../lib/state';
import { restoreSession } from '../lib/session';

// The existing saved-draft format must survive future workflow additions.
describe('case handoff validation', () => {
  it('does not restore an approved revision that is ahead of the brief', () => {
    const brief = createEmptyBrief(); brief.approvedRevision = 999;
    expect(restoreSession(JSON.stringify({ messages: [], brief }), null)?.brief.approvedRevision).toBeNull();
  });
  it('removes approval from a saved draft with an unfinished update', () => {
    let brief = createEmptyBrief();
    for (const [field, value] of [['restaurantName', 'Juniper'], ['city', 'Sydney'], ['date', '18 October 2027'], ['time', '7 pm'], ['partySize', '4']] as const) brief = applyManualEdit(brief, field, value);
    brief.approvedRevision = brief.revision;
    expect(restoreSession(JSON.stringify({ messages: [], brief, pendingAnalysis: true }), null)?.brief.approvedRevision).toBeNull();
  });
});
