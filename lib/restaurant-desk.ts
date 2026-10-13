import { z } from "zod";
import type { Message } from "./state";

export const roleSchema = z.enum(["owner", "manager", "staff", "member"]);
export type StaffRole = z.infer<typeof roleSchema>;
export const canManage = (role: StaffRole) =>
  role === "owner" || role === "manager";
export const factSchema = z.object({
  id: z.string().max(60),
  category: z.enum(["menu", "hours", "accessibility", "groups", "policy"]),
  title: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(1500),
  approved: z.boolean(),
});
export const restaurantSchema = z.object({
  name: z.string().trim().max(80),
  city: z.string().trim().max(80),
  welcome: z.string().trim().max(300),
  published: z.boolean(),
  facts: z.array(factSchema).max(30),
});
export const workflowSchema = z.object({
  stage: z.enum(["needs_reply", "under_review", "handed_off"]),
  priority: z.enum(["normal", "high", "urgent"]),
  assigneeId: z.string().nullable(),
  dueAt: z.iso.datetime({ offset: true }).nullable(),
  task: z.string().trim().max(200),
  escalationMinutes: z.number().int().min(15).max(1440),
  guestId: z.string().nullable(),
});
export const guestSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  contact: z.string().trim().max(120),
  notes: z.string().max(2000),
  caseIds: z.array(z.string()).max(200),
  updatedAt: z.iso.datetime({ offset: true }),
});
export const inboxSchema = z.object({
  id: z.string().max(100),
  channel: z.enum(["email", "whatsapp", "website", "guest_review"]),
  from: z.string().max(120),
  name: z.string().max(100),
  text: z.string().max(1000),
  caseId: z.uuid(),
  receivedAt: z.iso.datetime({ offset: true }),
  simulation: z.boolean(),
  read: z.boolean(),
  replies: z
    .array(
      z.object({
        id: z.uuid(),
        text: z.string().max(1000),
        sentAt: z.iso.datetime({ offset: true }),
        simulation: z.literal(true),
      }),
    )
    .max(30),
});
export const reservationSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  provider: z.enum(["opentable", "sevenrooms", "resy", "thefork"]),
  reference: z.string().max(80),
  idempotencyKey: z.string().max(100),
  status: z.enum(["simulated_confirmed", "simulated_cancelled"]),
  simulation: z.literal(true),
  createdAt: z.iso.datetime({ offset: true }),
  caseVersion: z.number().int().min(1),
});
export const connectorSchema = z.object({
  email: z.boolean(),
  whatsapp: z.boolean(),
  booking: z.enum(["opentable", "sevenrooms", "resy", "thefork"]),
  scenario: z.enum(["normal", "full", "unavailable"]),
});
export const deskSchema = z.object({
  restaurant: restaurantSchema,
  connectors: connectorSchema,
  workflows: z.record(z.string(), workflowSchema),
  comments: z
    .array(
      z.object({
        id: z.uuid(),
        caseId: z.uuid(),
        authorId: z.uuid(),
        text: z.string().trim().min(1).max(1000),
        createdAt: z.iso.datetime({ offset: true }),
      }),
    )
    .max(500),
  guests: z.array(guestSchema).max(200),
  inbox: z.array(inboxSchema).max(300),
  reservations: z.array(reservationSchema).max(200),
});
export type RestaurantDesk = z.infer<typeof deskSchema>;
export type Restaurant = z.infer<typeof restaurantSchema>;
export type Workflow = z.infer<typeof workflowSchema>;
export type Guest = z.infer<typeof guestSchema>;
export type InboxItem = z.infer<typeof inboxSchema>;
export const emptyWorkflow = (): Workflow => ({
  stage: "needs_reply",
  priority: "normal",
  assigneeId: null,
  dueAt: null,
  task: "",
  escalationMinutes: 60,
  guestId: null,
});
export const emptyDesk = (): RestaurantDesk => ({
  restaurant: {
    name: "",
    city: "",
    welcome:
      "Tell us about your plans. Our team will review your request and get back to you.",
    published: false,
    facts: [],
  },
  connectors: {
    email: true,
    whatsapp: true,
    booking: "opentable",
    scenario: "normal",
  },
  workflows: {},
  comments: [],
  guests: [],
  inbox: [],
  reservations: [],
});
export function publicRestaurant(restaurant: Restaurant) {
  if (!restaurant.published || !restaurant.name || !restaurant.city)
    return null;
  return {
    ...restaurant,
    facts: restaurant.facts.filter((fact) => fact.approved),
  };
}
export function updateWorkflow(
  desk: RestaurantDesk,
  id: string,
  input: Workflow,
  memberIds: string[],
): RestaurantDesk {
  const workflow = workflowSchema.parse(input);
  if (workflow.assigneeId && !memberIds.includes(workflow.assigneeId))
    throw new Error("Choose a teammate from this workspace.");
  if (
    workflow.guestId &&
    !desk.guests.some((guest) => guest.id === workflow.guestId)
  )
    throw new Error("Choose a guest from this workspace.");
  if (workflow.dueAt && !workflow.task)
    throw new Error("Add a task for this reminder.");
  return {
    ...desk,
    workflows: { ...desk.workflows, [id]: workflow },
    guests: desk.guests.map((guest) =>
      guest.id === workflow.guestId
        ? { ...guest, caseIds: [...new Set([...guest.caseIds, id])] }
        : guest,
    ),
  };
}
export function reminderAlerts(
  desk: RestaurantDesk,
  userId: string,
  role: StaffRole,
  now = new Date().toISOString(),
) {
  const current = Date.parse(now);
  return Object.entries(desk.workflows)
    .flatMap(([caseId, flow]) => {
      if (
        !flow.dueAt ||
        flow.stage === "handed_off" ||
        Date.parse(flow.dueAt) > current
      )
        return [];
      const escalated =
        current - Date.parse(flow.dueAt) >= flow.escalationMinutes * 60_000;
      if (
        flow.assigneeId &&
        flow.assigneeId !== userId &&
        !(escalated && canManage(role))
      )
        return [];
      return [
        {
          caseId,
          task: flow.task,
          dueAt: flow.dueAt,
          escalated,
          priority: flow.priority,
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(b.escalated) - Number(a.escalated) ||
        a.dueAt.localeCompare(b.dueAt),
    );
}
export const careSuggestionSchema = z.object({
  field: z.enum(["name", "contact", "dietary", "seating", "occasion"]),
  value: z.string().trim().min(1).max(200),
  quote: z.string().trim().min(1).max(500),
  messageId: z.string().min(1).max(100),
});
export type CareSuggestion = z.infer<typeof careSuggestionSchema>;
export function checkedCareSuggestions(
  raw: unknown[],
  messages: Message[],
): CareSuggestion[] {
  return raw
    .flatMap((value) => {
      const parsed = careSuggestionSchema.safeParse(value);
      if (!parsed.success) return [];
      const item = parsed.data;
      const source = messages.find(
        (message) =>
          message.id === item.messageId && message.speaker === "customer",
      );
      const normal = (text: string) =>
        text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
      if (
        !source ||
        !normal(source.text).includes(normal(item.quote)) ||
        !normal(item.quote).includes(normal(item.value))
      )
        return [];
      return [item];
    })
    .filter(
      (item, index, all) =>
        all.findIndex(
          (other) => other.field === item.field && other.value === item.value,
        ) === index,
    )
    .slice(0, 10);
}
export function mergeGuests(
  desk: RestaurantDesk,
  targetId: string,
  sourceId: string,
  confirmed: boolean,
): RestaurantDesk {
  if (!confirmed)
    throw new Error("Confirm that these records belong to the same guest.");
  if (targetId === sourceId)
    throw new Error("Choose two different guest records.");
  const target = desk.guests.find((guest) => guest.id === targetId),
    source = desk.guests.find((guest) => guest.id === sourceId);
  if (!target || !source)
    throw new Error("The guest records could not be found.");
  const notes = [target.notes, source.notes].filter(Boolean).join("\n");
  if (notes.length > 2000)
    throw new Error(
      "The combined notes are too long. Shorten them before merging so no details are lost.",
    );
  const merged = {
    ...target,
    contact: target.contact || source.contact,
    caseIds: [...new Set([...target.caseIds, ...source.caseIds])],
    notes,
    updatedAt: new Date().toISOString(),
  };
  return {
    ...desk,
    guests: desk.guests
      .filter((guest) => guest.id !== sourceId)
      .map((guest) => (guest.id === targetId ? merged : guest)),
    workflows: Object.fromEntries(
      Object.entries(desk.workflows).map(([id, flow]) => [
        id,
        flow.guestId === sourceId ? { ...flow, guestId: targetId } : flow,
      ]),
    ),
  };
}
