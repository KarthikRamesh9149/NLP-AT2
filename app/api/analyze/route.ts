import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeConversation } from '@/lib/engine';
import { createEmptyBrief, FIELD_KEYS, type Brief } from '@/lib/state';

export const runtime = 'nodejs';
export const maxDuration = 30;

const messageSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
  speaker: z.enum(['customer', 'staff']),
  text: z.string().trim().min(1).max(1000),
});
const fieldSchema = z.object({
  value: z.string().max(120).nullable(),
  status: z.enum(['missing', 'resolved', 'needs_clarification']),
  constraint: z.string().max(120).nullable(),
  evidenceIds: z.array(z.string()).max(30),
  source: z.enum(['model', 'rule', 'staff']).nullable(),
  note: z.string().max(300),
});
const fieldsShape = Object.fromEntries(FIELD_KEYS.map((field) => [field, fieldSchema])) as Record<(typeof FIELD_KEYS)[number], typeof fieldSchema>;
const briefSchema = z.object({
  fields: z.object(fieldsShape),
  history: z.array(z.object({
    field: z.enum(FIELD_KEYS),
    previousValue: z.string().nullable(),
    nextValue: z.string().nullable(),
    operation: z.enum(['set', 'replace', 'clear', 'constrain', 'manual']),
    evidenceIds: z.array(z.string()),
    revision: z.number().int().nonnegative(),
  })).max(200),
  revision: z.number().int().nonnegative(),
  approvedRevision: z.number().int().nonnegative().nullable(),
});
const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
  brief: briefSchema.optional(),
  mode: z.enum(['formbridge', 'model', 'rules']).default('formbridge'),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 }); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'The conversation or brief is invalid.' }, { status: 400 });
  const { messages, mode, referenceDate } = parsed.data;
  if (new Set(messages.map((message) => message.id)).size !== messages.length) return NextResponse.json({ error: 'Message IDs must be unique.' }, { status: 400 });
  const brief = (parsed.data.brief ?? createEmptyBrief()) as Brief;
  try {
    const analysis = await analyzeConversation(messages, brief, mode, referenceDate);
    return NextResponse.json(analysis, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error && error.message === 'OpenAI API key is not configured.' ? error.message : 'Could not analyse this turn. Your last valid brief is unchanged.';
    return NextResponse.json({ error: message, brief }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
