import { NextResponse } from 'next/server';
import { requestSchema } from '@/lib/contracts';
import { analyzeConversation } from '@/lib/engine';
import { createEmptyBrief, type Brief } from '@/lib/state';
import { isCancelledBooking } from '@/lib/cancellation-status';
import { MAX_BODY_BYTES } from '@/lib/limits';
import { reserveUsage, settleUsage, UsageLimitError } from '@/lib/server/usage-budget';

export const runtime = 'nodejs';
export const maxDuration = 30;
const MAX_REQUESTS_PER_MINUTE = 60;
const requests = new Map<string, { windowStart: number; count: number }>();

function isRateLimited(request: Request): boolean {
  if (process.env.NODE_ENV !== 'production') return false;
  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const now = Date.now();
  const entry = requests.get(address);
  if (!entry || now - entry.windowStart >= 60_000) {
    if (requests.size > 2_000) {
      for (const [key, previous] of requests) if (now - previous.windowStart >= 60_000) requests.delete(key);
    }
    requests.set(address, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS_PER_MINUTE;
}


export async function POST(request: Request) {
  if (isRateLimited(request)) return NextResponse.json({ error: 'Too many analysis requests. Please try again in a minute.' }, { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'This conversation is too large.' }, { status: 413 });
  let body: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return NextResponse.json({ error: 'This conversation is too large.' }, { status: 413 });
    body = JSON.parse(raw);
  } catch { return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 }); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'The conversation or brief is invalid.' }, { status: 400 });
  const { messages, mode, referenceDate } = parsed.data;
  if (new Set(messages.map((message) => message.id)).size !== messages.length) return NextResponse.json({ error: 'Message IDs must be unique.' }, { status: 400 });
  const brief = (parsed.data.brief ?? createEmptyBrief()) as Brief;
  try {
    const reservation = await reserveUsage(request, { messages, brief, referenceDate }, mode);
    const analysis = await analyzeConversation(messages, brief, mode, referenceDate);
    if (!analysis.warning) await settleUsage(reservation, analysis.usage);
    return NextResponse.json({ ...analysis, clarification: isCancelledBooking(analysis.brief, messages) ? null : analysis.clarification }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof UsageLimitError) return NextResponse.json({ error: error.message, brief }, { status: error.status, headers: { 'Retry-After': String(error.retryAfter), 'Cache-Control': 'no-store' } });
    const message = error instanceof Error && error.message === 'OpenAI API key is not configured.' ? error.message : 'Could not analyse this turn. Your last valid brief is unchanged.';
    return NextResponse.json({ error: message, brief }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
