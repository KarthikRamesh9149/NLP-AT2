import { reconcileGroundedState, validationFeedback, withExplicitClears, type GroundedState } from './grounding';
import { extractFullState, extractGroundedState, type ApiUsage } from './ai';
import { clarificationFor, createEmptyBrief, FIELD_KEYS, type Brief, type Message } from './state';
import { runRules } from './rules';

export type Mode = 'formbridge' | 'model' | 'rules';
export interface Analysis { brief: Brief; clarification: string | null; usage: ApiUsage | null; appliedUpdates: number; warning?: string }

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
  // Discard instruction attempts without discarding the real conversation
  // surrounding them. This works for both pasted transcripts and live updates.
  messages = messages.filter((message) => !/\b(?:ignore (?:all |any )?(?:previous|prior|system) instructions|not a booking change)\b/i.test(message.text));
  if (!messages.some((message) => message.speaker === 'customer')) return { brief: current, clarification: clarificationFor(current), usage: null, appliedUpdates: 0 };
  const initial = await extractGroundedState(messages, referenceDate);
  let state: GroundedState = withExplicitClears(initial.state, messages, referenceDate); let usage = initial.usage; let warning: string | undefined;
  const issues = validationFeedback(state, messages, referenceDate);
  if (issues.length) {
    try {
      const repair = await extractGroundedState(messages, referenceDate, issues.join('\n'));
      state = withExplicitClears(repair.state, messages, referenceDate);
      usage = { inputTokens: usage.inputTokens + repair.usage.inputTokens, outputTokens: usage.outputTokens + repair.usage.outputTokens, model: `${usage.model} + ${repair.usage.model}` };
    } catch {
      // The first response is still subject to every evidence check. A failed
      // second check must not destroy a valid result or apply unsupported data.
      warning = 'Some details need another check. Review the sources or retry analysis.';
    }
  }
  const brief = reconcileGroundedState(current, state, messages, referenceDate);
  return { brief, clarification: clarificationFor(brief), usage, appliedUpdates: brief.history.length - current.history.length, ...(warning ? { warning } : {}) };
}
