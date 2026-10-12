import { describe, expect, it } from 'vitest';
import { reconcileGroundedState, validationFeedback, type GroundedField, type GroundedState } from '../lib/grounding';
import { createEmptyBrief, type Message } from '../lib/state';

function propose(count: string, quote: string, source = quote) {
  const messages: Message[] = [{ id: 'family', speaker: 'customer', text: source }];
  const absent = (): GroundedField => ({ value: null, status: 'missing', constraint: null, evidence: [] });
  const state: GroundedState = { restaurantName: absent(), city: absent(), date: absent(), time: absent(), partySize: absent() };
  state.partySize = { value: count, status: 'resolved', constraint: null, evidence: [{ id: 'family', quote }] };
  return { messages, state, brief: reconcileGroundedState(createEmptyBrief(), state, messages, null) };
}

describe('guest count evidence in ordinary booking language', () => {
  it('accepts a total supported by all parts of a family headcount', () => {
    const { brief, state, messages } = propose('5', 'two adults and three children');
    expect(brief.fields.partySize).toMatchObject({ value: '5', status: 'resolved', evidenceIds: ['family'] });
    expect(validationFeedback(state, messages, null)).toEqual([]);
  });
  it('does not accept a subgroup as the total, even when the quotation hides the other guests', () => {
    expect(propose('2', 'two adults', 'two adults and three children').brief.fields.partySize.value).toBeNull();
  });
  it('requires the quotation to include every part of a composed total', () => {
    expect(propose('5', 'two adults', 'two adults and three children').brief.fields.partySize.value).toBeNull();
  });
  it('supports a direct count of us without needing the word people', () => {
    expect(propose('2', 'two of us').brief.fields.partySize.value).toBe('2');
  });
  it('does not make an exact guest total uncertain because the time is approximate', () => {
    expect(propose('5', 'two adults and three children', 'Around 7 pm for two adults and three children.').brief.fields.partySize.value).toBe('5');
  });
  it('handles three explicit additions without counting a shortened for phrase as the total', () => {
    expect(propose('6', 'three adults, two kids and one baby').brief.fields.partySize.value).toBe('6');
    expect(propose('2', 'for two', 'A table for two adults and three children.').brief.fields.partySize.value).toBeNull();
  });
  it('preserves the explicit total when it includes a smaller child subgroup', () => {
    expect(propose('5', 'five people', 'five people, including two children').brief.fields.partySize.value).toBe('5');
    expect(propose('2', 'two children', 'five people, including two children').brief.fields.partySize.value).toBeNull();
    expect(propose('7', 'five people, including two children').brief.fields.partySize.value).toBeNull();
  });
  it.each(['two adults and maybe three children', 'two or three adults and two children', 'two adults and three dogs'])('rejects an invented or uncertain total from %s', text => {
    expect(propose('5', text).brief.fields.partySize.value).toBeNull();
  });
  it('does not accept either side of an unresolved guest-count alternative', () => {
    expect(propose('4', 'four people', 'four people or five people').brief.fields.partySize.value).toBeNull();
    expect(propose('5', 'five people', 'four people or five people').brief.fields.partySize.value).toBeNull();
  });
  it('understands a terse correction after an established family headcount', () => {
    const { brief, state, messages } = propose('5', 'two adults and three children');
    messages.push({ id: 'correction', speaker: 'customer', text: 'Actually, six instead.' });
    state.partySize = { value: '6', status: 'resolved', constraint: null, evidence: [{ id: 'correction', quote: 'six' }] };
    expect(reconcileGroundedState(brief, state, messages, null).fields.partySize.value).toBe('6');
  });
});
