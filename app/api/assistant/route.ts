import { z } from 'zod';
import { briefSchema, messageSchema } from '@/lib/contracts';
import { MAX_BODY_BYTES, utf8Bytes } from '@/lib/limits';
import { validIsoDate } from '@/lib/temporal';
import { askDeskAssistant } from '@/lib/server/desk-assistant';
import { reserveUsage, settleUsage, UsageLimitError } from '@/lib/server/usage-budget';
import { followUpSchema, guestCareSchema } from '@/lib/follow-up';

export const runtime = 'nodejs';
export const maxDuration = 20;
const schema = z.object({ question: z.string().trim().min(1).max(1000), history: z.array(z.object({ role: z.enum(['user','assistant']), text: z.string().max(4000) })).max(8).default([]), messages: z.array(messageSchema).max(30), brief: briefSchema, pendingAnalysis: z.boolean().default(false), referenceDate: z.string().refine(validIsoDate).nullable().default(null), today: z.string().refine(validIsoDate).optional(), notes: z.string().max(2000).default(''), followUp: followUpSchema.nullable().optional(), guestCare: guestCareSchema.optional() });
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  let body: unknown;
  try { const raw = await request.text(); if (utf8Bytes(raw) > MAX_BODY_BYTES) return Response.json({ error: 'This enquiry is too large. Shorten the conversation first.' }, { status: 413, headers }); body = JSON.parse(raw); }
  catch { return Response.json({ error: 'Check your question and retry.' }, { status: 400, headers }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Check your question and enquiry, then retry.' }, { status: 400, headers });
  try {
    const reservation = await reserveUsage(request, parsed.data, 'assistant');
    const result = await askDeskAssistant(parsed.data);
    await settleUsage(reservation, result.usage);
    return Response.json(result.reply, { headers });
  } catch (cause) {
    if (cause instanceof UsageLimitError) return Response.json({ error: cause.message }, { status: cause.status, headers: { ...headers, 'Retry-After': String(cause.retryAfter) } });
    return Response.json({ error: 'The assistant could not finish this answer. Your brief is unchanged. Please retry.' }, { status: 503, headers });
  }
}
