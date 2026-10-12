import { createEmptyBrief, type Brief, type Message } from './state';
import type { ApiUsage } from './ai';
import type { Mode } from './engine';

export interface ReplayStep { brief: Brief; usage: ApiUsage | null; latencyMs: number; warning?: string }
export type ReplayCall = (mode: Mode, messages: Message[], current: Brief) => Promise<ReplayStep>;

/** All systems see the same ordered prefixes, stopping at each customer turn. */
export async function replayDialogue(messages: Message[], mode: Mode, call: ReplayCall) {
  let brief = createEmptyBrief();
  let inputTokens = 0; let outputTokens = 0; let latencyMs = 0; let providerRequests = 0; let incomplete = false;
  const turns: Array<{ messageId: string; usage: ApiUsage | null; latencyMs: number; warning?: string }> = [];
  const models = new Set<string>();
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index].speaker !== 'customer') continue;
    const step = await call(mode, messages.slice(0, index + 1), brief);
    brief = step.brief; latencyMs += step.latencyMs;
    inputTokens += step.usage?.inputTokens ?? 0; outputTokens += step.usage?.outputTokens ?? 0;
    if (step.usage) {
      const returnedModels = step.usage.model.split(' + ');
      returnedModels.forEach(model => models.add(model));
      providerRequests += step.usage.attemptedCalls ?? (returnedModels.length + (step.warning ? 1 : 0));
      incomplete ||= step.usage.incomplete === true;
    }
    turns.push({ messageId: messages[index].id, usage: step.usage, latencyMs: step.latencyMs, ...(step.warning ? { warning: step.warning } : {}) });
  }
  return { brief, usage: models.size ? { inputTokens, outputTokens, model: [...models].join(' + '), ...(incomplete ? {incomplete:true} : {}) } : null,
    latencyMs, analysisRequests: turns.length, providerRequests, turns };
}
