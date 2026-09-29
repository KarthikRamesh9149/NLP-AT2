import { extractFullState, extractUpdates, type ApiUsage } from './ai';
import { applyProposals, clarificationFor, createEmptyBrief, FIELD_KEYS, type Brief, type Message } from './state';
import { runRules } from './rules';

export type Mode = 'formbridge' | 'model' | 'rules';
export interface Analysis { brief: Brief; clarification: string | null; usage: ApiUsage | null; appliedUpdates: number }

export async function analyzeConversation(messages: Message[], current: Brief, mode: Mode, referenceDate: string | null): Promise<Analysis> {
  if (messages.length === 0) return { brief: current, clarification: clarificationFor(current), usage: null, appliedUpdates: 0 };
  if (mode === 'rules') {
    const brief = runRules(messages);
    return { brief, clarification: clarificationFor(brief), usage: null, appliedUpdates: brief.history.length };
  }
  if (mode === 'model') {
    const { state, usage } = await extractFullState(messages, referenceDate);
    const brief = createEmptyBrief();
    for (const field of FIELD_KEYS) {
      brief.fields[field] = { ...state[field], evidenceIds: [], source: 'model', note: 'Contextual baseline prediction' };
    }
    return { brief, clarification: clarificationFor(brief), usage, appliedUpdates: FIELD_KEYS.filter((field) => !!brief.fields[field].value).length };
  }
  const latestCustomer = [...messages].reverse().find((message) => message.speaker === 'customer');
  if (latestCustomer && /\b(?:ignore (?:all |any )?(?:previous|prior|system) instructions|system prompt|not a booking change|this is a test)\b/i.test(latestCustomer.text)) {
    return { brief: current, clarification: clarificationFor(current), usage: null, appliedUpdates: 0 };
  }
  const { proposals, usage } = await extractUpdates(messages, current, referenceDate);
  const brief = applyProposals(current, proposals, messages);
  return { brief, clarification: clarificationFor(brief), usage, appliedUpdates: brief.history.length - current.history.length };
}
