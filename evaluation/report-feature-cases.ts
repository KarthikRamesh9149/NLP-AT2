import type { FieldKey, FieldStatus, Message } from '../lib/state';

export interface FeatureExpectation {
  value: string | null;
  status: FieldStatus;
  constraint?: string;
  support: string[][];
  allowed: string[];
}
export interface FeatureCase {
  id: string;
  purpose: string;
  messages: Message[];
  referenceDate: string | null;
  expected: Record<FieldKey, FeatureExpectation>;
  question: string | null;
  approval: boolean;
}
const c = (id: string, text: string): Message => ({ id, text, speaker: 'customer' });
const s = (id: string, text: string): Message => ({ id, text, speaker: 'staff' });
const resolved = (value: string, support = [['m1']], allowed = support.flat()): FeatureExpectation => ({ value, status: 'resolved', support, allowed });
const missing = (): FeatureExpectation => ({ value: null, status: 'missing', support: [], allowed: [] });
const uncertain = (value: string | null, constraint: string, support = [['m1']], allowed = support.flat()): FeatureExpectation => ({ value, status: 'needs_clarification', constraint, support, allowed });
const text = 'A table for four at Juniper House in Sydney on 6 November 2026 at 7 pm.';
const base = (): Record<FieldKey, FeatureExpectation> => ({
  restaurantName: resolved('Juniper House'), city: resolved('Sydney'),
  date: resolved('6 November 2026'), time: resolved('7 pm'), partySize: resolved('4'),
});
const make = (id: string, purpose: string, messages: Message[], overrides: Partial<Record<FieldKey, FeatureExpectation>> = {}, question: string | null = null, approval = true, referenceDate: string | null = null): FeatureCase =>
  ({ id, purpose, messages, referenceDate, expected: { ...base(), ...overrides }, question, approval });

/** Fixed expected outcomes and source links written before the provider run.
 * Constructed English cases; no recruited-user or unseen-population claim.
 * A support bundle lists the messages needed to establish the final value.
 * Allowed also permits relevant question, acceptance and supersession context.
 */
export const featureCases: FeatureCase[] = [
  make('F01','Explicit complete request',[c('m1',text)]),
  make('F02','Guest correction changes one field',[c('m1',text),c('m2','Actually make that six guests instead.')],{partySize:resolved('6',[['m2']],['m1','m2'])}),
  make('F03','Accepted staff time links offer and acceptance',[c('m1','A table for four at Juniper House in Sydney on 6 November 2026, after 7 pm.'),s('m2','Would 8:30 pm work?'),c('m3','Yes, that works.')],{time:resolved('8:30 pm',[['m2','m3']],['m1','m2','m3'])}),
  make('F04','Unaccepted offer stays uncertain',[c('m1','A table for four at Juniper House in Sydney on 6 November 2026, after 7 pm.'),s('m2','Would 8:30 pm work?'),c('m3','Is the restaurant accessible?')],{time:uncertain(null,'after.*7',[['m1']],['m1','m2','m3'])},'time',false),
  make('F05','Rejected alternative retains chosen time',[c('m1',text),s('m2','Would 8 pm work instead?'),c('m3','No, keep my original time.')],{time:resolved('7 pm',[['m1']],['m1','m2','m3'])}),
  make('F06','Time range replaces an exact value',[c('m1',text),c('m2','Change the time to sometime after 8 pm.')],{time:uncertain(null,'after.*8',[['m2']],['m1','m2'])},'time',false),
  make('F07','Alternatives require a choice',[c('m1','Four people at Juniper House in Sydney on 6 November 2026, either 7 pm or 8 pm.')],{time:uncertain(null,'7.*8')},'time',false),
  make('F08','Clock time without a period stays uncertain',[c('m1','Four people at Juniper House in Sydney on 6 November 2026 at 7.')],{time:uncertain(null,'7')},'time',false),
  make('F09','Missing year is asked explicitly',[c('m1','Four people at Juniper House in Sydney on November 6th at 7 pm.')],{date:uncertain('November 6th','year')},'year',false),
  make('F10','Relative date without an anchor stays visible',[c('m1','Four people at Juniper House in Sydney tomorrow at 7 pm.')],{date:uncertain('tomorrow','tomorrow')},'date.*tomorrow',false),
  make('F11','Reference date anchors tomorrow',[c('m1','Four people at Juniper House in Sydney tomorrow at 7 pm.')],{},null,true,'2026-11-05'),
  make('F12','A missing guest count is not defaulted',[c('m1','Juniper House in Sydney on 6 November 2026 at 7 pm.')],{partySize:missing()},'how many',false),
  make('F13','An unaccepted staff default remains absent',[c('m1','Juniper House in Sydney on 6 November 2026 at 7 pm.'),s('m2','Shall I put two guests?'),c('m3','What food do they serve?')],{partySize:missing()},'how many',false),
  make('F14','Negated cancellation retains the request',[c('m1',text),c('m2','Please do not cancel my booking.')]),
  make('F15','Explicit cancellation clears every field',[c('m1',text),c('m2','Please cancel the whole booking request.')],Object.fromEntries(Object.keys(base()).map(key=>[key,missing()])) as Record<FieldKey,FeatureExpectation>,null,false),
  make('F16','Adults and children are counted once',[c('m1','A table for two adults and three children at Juniper House in Sydney on 6 November 2026 at 7 pm.')],{partySize:resolved('5')}),
  make('F17','Subgroup is already included in the total',[c('m1','A table for four people including two children at Juniper House in Sydney on 6 November 2026 at 7 pm.')]),
  make('F18','A separate year answer combines two sources',[c('m1','Four people at Juniper House in Sydney on November 6th at 7 pm.'),s('m2','Which year do you mean?'),c('m3','2026, please.')],{date:resolved('6 November 2026',[['m1','m3']],['m1','m2','m3'])}),
  make('F19','Day correction preserves month and year',[c('m1',text),c('m2','Actually the 7th, everything else stays the same.')],{date:resolved('7 November 2026',[['m1','m2']],['m1','m2'])}),
  make('F20','An impossible calendar date blocks approval',[c('m1','Four people at Juniper House in Sydney on 31 November 2026 at 7 pm.')],{date:uncertain(null,'31.*november.*2026')},'date',false),
];

