import { z } from 'zod';
import { FIELD_KEYS } from './state';
import { validIsoDate } from './temporal';

export const messageSchema = z.object({
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
export const briefSchema = z.object({
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
export const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
  brief: briefSchema.optional(),
  mode: z.enum(['formbridge', 'model', 'rules']).default('formbridge'),
  referenceDate: z.string().refine(validIsoDate).nullable().default(null),
});

