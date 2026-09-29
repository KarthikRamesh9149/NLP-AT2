import { applyProposals, createEmptyBrief, type Brief, type Message, type Proposal } from './state';

const numberWords: Record<string, string> = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8',
  nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14',
  fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20',
};
const digit = (raw: string) => numberWords[raw.toLowerCase()] ?? raw;
const number = '(?:\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)';

function proposalsFrom(message: Message, evidenceIds: string[], previous: Brief): Proposal[] {
  const text = message.text;
  const proposals: Proposal[] = [];
  const correction = /\b(actually|instead|make that|change (?:it|that) to)\b/i.test(text);
  const party = text.match(new RegExp(`(?:table|booking|reservation)\\s+for\\s+(${number})\\b|\\b(${number})\\s+(?:people|persons|guests)\\b|make\\s+that\\s+(${number})\\b`, 'i'));
  if (party) {
    const value = digit(party[1] ?? party[2] ?? party[3]);
    proposals.push({ field: 'partySize', operation: previous.fields.partySize.value || correction ? 'replace' : 'set', value, status: 'resolved', evidenceIds, note: 'Explicit party size' });
  }
  const date = text.match(/\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|\d{4}-\d{2}-\d{2})\b/i);
  if (date) proposals.push({ field: 'date', operation: previous.fields.date.value ? 'replace' : 'set', value: date[1], status: 'resolved', evidenceIds, note: 'Explicit date' });
  const after = text.match(new RegExp(`\\b(?:sometime\\s+)?after\\s+(${number})(?::(\\d{2}))?\\s*(am|pm)?\\b`, 'i'));
  if (after) {
    const value = `after ${digit(after[1])}${after[2] ? `:${after[2]}` : ''}${after[3] ? ` ${after[3].toLowerCase()}` : ''}`;
    proposals.push({ field: 'time', operation: 'constrain', value, status: 'needs_clarification', evidenceIds, note: 'An exact time is still needed' });
  } else {
    const exact = text.match(new RegExp(`\\b(?:at|for|would)\\s+(${number})(?::(\\d{2}))?\\s*(am|pm)\\b`, 'i'));
    if (exact) {
      const value = `${digit(exact[1])}${exact[2] ? `:${exact[2]}` : ''} ${exact[3].toLowerCase()}`;
      proposals.push({ field: 'time', operation: previous.fields.time.value || previous.fields.time.constraint ? 'replace' : 'set', value, status: 'resolved', evidenceIds, note: 'Explicit time' });
    }
  }
  const restaurant = text.match(/\b(?:at|restaurant(?: is| called)?)\s+([A-Z][A-Za-z&' -]{2,35})(?=[,.!?]|\s+(?:in|on|for|at)\b|$)/);
  if (restaurant && !/^(?:Friday|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday)$/i.test(restaurant[1].trim())) {
    proposals.push({ field: 'restaurantName', operation: previous.fields.restaurantName.value ? 'replace' : 'set', value: restaurant[1].trim(), status: 'resolved', evidenceIds, note: 'Named restaurant' });
  }
  const city = text.match(/\bin\s+([A-Z][a-z]+)(?=[,.!?]|\s+(?:on|at|for)\b|$)/);
  if (city) proposals.push({ field: 'city', operation: previous.fields.city.value ? 'replace' : 'set', value: city[1], status: 'resolved', evidenceIds, note: 'Named city' });
  return proposals;
}

export function runRules(messages: Message[]): Brief {
  let brief = createEmptyBrief();
  let staffProposal: Message | null = null;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.speaker === 'staff') {
      staffProposal = message;
      continue;
    }
    if (/\b(yes|that works|sounds good|okay|ok)\b/i.test(message.text) && staffProposal) {
      const accepted = proposalsFrom(staffProposal, [staffProposal.id, message.id], brief);
      brief = applyProposals(brief, accepted, messages.slice(0, index + 1), 'rule');
    }
    brief = applyProposals(brief, proposalsFrom(message, [message.id], brief), messages.slice(0, index + 1), 'rule');
    staffProposal = null;
  }
  return brief;
}
