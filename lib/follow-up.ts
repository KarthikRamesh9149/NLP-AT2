import { z } from 'zod';
import { validIsoDate } from './temporal';

export const followUpSchema = z.object({
  dueDate: z.string().refine(validIsoDate),
  note: z.string().trim().min(1).max(200),
  done: z.boolean(),
});
export type FollowUp = z.infer<typeof followUpSchema>;
export const guestCareSchema = z.object({
  name: z.string().trim().max(100), contact: z.string().trim().max(120),
  dietary: z.string().trim().max(300), seating: z.string().trim().max(200),
  occasion: z.string().trim().max(120),
});
export type GuestCare = z.infer<typeof guestCareSchema>;
export const emptyGuestCare = (): GuestCare => ({ name: '', contact: '', dietary: '', seating: '', occasion: '' });
