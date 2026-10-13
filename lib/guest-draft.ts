import { z } from "zod";
import { briefSchema, messageSchema } from "./contracts";
import { guestCareSchema } from "./follow-up";
import { factSchema } from "./restaurant-desk";
const schema = z.object({
  messages: z.array(messageSchema).max(30),
  facts: z
    .record(
      z.string().max(40),
      z.array(factSchema.extend({ approved: z.literal(true) })).max(30),
    )
    .refine((value) => Object.keys(value).length <= 30)
    .default({}),
  draft: z.string().max(1000),
  care: guestCareSchema,
  fields: briefSchema.shape.fields.nullable(),
  submissionId: z.uuid(),
  received: z.boolean(),
  savedAt: z.number(),
});
export type GuestDraft = z.infer<typeof schema>;
export function readGuestDraft(
  raw: string | null,
  now = Date.now(),
): GuestDraft | null {
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success &&
      parsed.data.savedAt <= now &&
      now - parsed.data.savedAt < 24 * 60 * 60 * 1000
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}
