import { applyProposals, createEmptyBrief, type Message, type Proposal } from './state';

export const demoMessages: Message[] = [
  { id: 'm1', speaker: 'customer', text: "I'd like a table at Ember House in Sydney on 9 October 2026 at 7 pm for four people." },
  { id: 'm2', speaker: 'customer', text: 'Actually, make that five people, and sometime after 8 pm.' },
];

const first: Proposal[] = [
  { field: 'restaurantName', operation: 'set', value: 'Ember House', status: 'resolved', evidenceIds: ['m1'], note: 'Named by customer' },
  { field: 'city', operation: 'set', value: 'Sydney', status: 'resolved', evidenceIds: ['m1'], note: 'Named by customer' },
  { field: 'date', operation: 'set', value: '9 October 2026', status: 'resolved', evidenceIds: ['m1'], note: 'Requested date' },
  { field: 'time', operation: 'set', value: '7 pm', status: 'resolved', evidenceIds: ['m1'], note: 'Initial requested time' },
  { field: 'partySize', operation: 'set', value: '4', status: 'resolved', evidenceIds: ['m1'], note: 'Initial party size' },
];
const correction: Proposal[] = [
  { field: 'partySize', operation: 'replace', value: '5', status: 'resolved', evidenceIds: ['m2'], note: 'Customer correction' },
  { field: 'time', operation: 'constrain', value: 'after 8 pm', status: 'needs_clarification', evidenceIds: ['m2'], note: 'Exact time not yet chosen' },
];

export const demoBrief = applyProposals(applyProposals(createEmptyBrief(), first, demoMessages.slice(0, 1)), correction, demoMessages);
