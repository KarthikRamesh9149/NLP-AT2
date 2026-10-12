import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { extractionInstructions, formbridgeModel, type ApiUsage } from '../ai';
import { utf8Bytes } from '../limits';

// Standard prices verified on OpenAI's model pages on 13 October 2026.
// The input margin covers cache writes and the regional-processing premium.
export function costMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rates = model.startsWith('gpt-6-luna') ? [0.1, 0.5] : model.startsWith('gpt-6.1-sol') ? [2, 10] : model.startsWith('gpt-4.1-mini') ? [0.4, 1.6] : null;
  if (!rates) throw new Error('This model needs a verified price before public use.');
  return Math.ceil(inputTokens * rates[0] * 1.4 + outputTokens * rates[1] * 1.1);
}
export function maximumCost(input: unknown, kind: 'formbridge' | 'model' | 'assistant' | 'rules'): number {
  if (kind === 'rules') return 0;
  const tokens = utf8Bytes(JSON.stringify(input)) + utf8Bytes(extractionInstructions) + 4000;
  if (kind === 'assistant') return costMicroUsd(formbridgeModel(), tokens, 1200);
  if (kind === 'model') return costMicroUsd(process.env.OPENAI_MODEL || 'gpt-4.1-mini-2025-04-14', tokens, 900);
  return costMicroUsd(formbridgeModel(), tokens, 2400) + costMicroUsd(process.env.FORMBRIDGE_REPAIR_MODEL || 'gpt-6.1-sol', tokens + 4000, 2400);
}
export class UsageLimitError extends Error {
  constructor(message: string, public status: number, public retryAfter = 60) { super(message); }
}
function serverDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(3000) }) } });
}
export async function reserveUsage(request: Request, input: unknown, kind: 'formbridge' | 'model' | 'assistant' | 'rules'): Promise<string | null> {
  if (process.env.NODE_ENV === 'test') return null;
  const database = serverDatabase();
  if (!database) {
    if (process.env.NODE_ENV === 'production') throw new UsageLimitError('Analysis is temporarily unavailable. You can keep editing and saving your draft.', 503);
    return null;
  }
  const address = (request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const identity = createHmac('sha256', process.env.SUPABASE_SECRET_KEY!).update(address).digest('hex');
  const { data, error } = await database.rpc('fb_reserve_usage', { p_identity: identity, p_max_cost: maximumCost(input, kind) });
  if (error || !data) throw new UsageLimitError('Analysis is temporarily unavailable. Your draft is kept; please retry in a moment.', 503);
  if (!data.allowed) throw new UsageLimitError(data.reason === 'rate' ? 'Too many updates in a short time. Your draft is kept. Please retry in a minute.' : 'The shared analysis allowance has been reached. Your draft is kept, and you can still review and save it.', 429, data.retryAfter || 60);
  return data.reservationId;
}
export async function settleUsage(id: string | null, usage: ApiUsage | null): Promise<void> {
  if (!id || usage?.incomplete) return;
  const database = serverDatabase();
  if (!database) return;
  const calls = usage?.calls ?? (usage ? [usage] : []);
  const cost = calls.reduce((sum, call) => sum + costMicroUsd(call.model, call.inputTokens, call.outputTokens), 0);
  try { await database.rpc('fb_settle_usage', { p_id: id, p_actual_cost: cost }); } catch { /* The full reservation remains charged. */ }
}
