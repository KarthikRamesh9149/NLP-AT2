import { z } from "zod";
import { calendarDate, clockTime } from "./temporal";
import type { Restaurant } from "./restaurant-desk";

export const reviewSnapshotSchema = z.object({
  restaurantName: z.string().max(120),
  city: z.string().max(120),
  date: z.string().max(120),
  time: z.string().max(120),
  partySize: z.string().max(3),
  guestCare: z.object({
    name: z.string().max(100),
    dietary: z.string().max(300),
    seating: z.string().max(200),
    occasion: z.string().max(120),
  }),
});
export type ReviewSnapshot = z.infer<typeof reviewSnapshotSchema>;
export const reviewChangeSchema = z.object({
  date: z.string().trim().min(1).max(120),
  time: z.string().trim().min(1).max(120),
  partySize: z
    .string()
    .regex(/^\d{1,2}$/)
    .refine((value) => Number(value) >= 1 && Number(value) <= 30),
  dietary: z.string().trim().max(300),
  seating: z.string().trim().max(200),
  occasion: z.string().trim().max(120),
  message: z.string().trim().max(300).default(""),
  consent: z.literal(true),
});
export function reviewSubmission(snapshot: ReviewSnapshot, raw: unknown) {
  const input = reviewChangeSchema.parse(raw);
  const changes: string[] = [];
  const dateEqual =
    calendarDate(snapshot.date)?.value === calendarDate(input.date)?.value &&
    calendarDate(input.date) !== null;
  const timeEqual =
    clockTime(snapshot.time) === clockTime(input.time) &&
    clockTime(input.time) !== null;
  if (!dateEqual && input.date !== snapshot.date) {
    const date = calendarDate(input.date);
    if (!date?.year) throw new Error("Enter a valid date including the year.");
    changes.push(`Date: ${input.date}`);
  }
  if (!timeEqual && input.time !== snapshot.time) {
    if (!clockTime(input.time))
      throw new Error(
        "Enter an exact time, for example 8:30 pm. Add a flexible time request in your message instead.",
      );
    changes.push(`Time: ${input.time}`);
  }
  if (Number(input.partySize) !== Number(snapshot.partySize))
    changes.push(`Guests: ${input.partySize}`);
  for (const key of ["dietary", "seating", "occasion"] as const)
    if (input[key] !== snapshot.guestCare[key])
      changes.push(
        `${key === "dietary" ? "Dietary requests" : key === "seating" ? "Seating preference" : "Occasion"}: ${input[key] || "Please remove this request"}`,
      );
  if (input.message) changes.push(`Message: ${input.message}`);
  const message = changes.length
    ? `Please update my enquiry. ${changes.join(". ")}`
    : "I have reviewed these details and confirm they describe my request. I understand that a table has not been reserved.";
  if (message.length > 1000)
    throw new Error("Shorten your message or preferences before sending.");
  return { message, changed: changes.length > 0 };
}
export function approvedAnswers(restaurant: Restaurant, question: string) {
  const categories = new Set<string>();
  if (
    /menu|dish|food|vegetarian|vegan|gluten|dairy|allerg|diet/i.test(question)
  )
    categories.add("menu");
  if (/open|clos|hours|lunch|dinner service/i.test(question))
    categories.add("hours");
  if (/access|wheelchair|step.free|stairs/i.test(question))
    categories.add("accessibility");
  if (/group|private din|package|large part/i.test(question))
    categories.add("groups");
  if (
    /policy|policies|deposit|cancel|dogs?|pets?|children|dress|corkage/i.test(
      question,
    )
  )
    categories.add("policy");
  return restaurant.facts
    .filter((fact) => fact.approved && categories.has(fact.category))
    .slice(0, 4);
}

export function isRestaurantQuestion(question: string) {
  return (
    /\?|^(?:what|when|where|how|can|do|does|is|are)\b/i.test(question.trim()) &&
    /hours?|open|clos|menu|food|diet|allerg|access|wheelchair|policy|policies|deposit|cancel|dogs?|pets?|children|dress|corkage|parking|service|package/i.test(
      question,
    )
  );
}
