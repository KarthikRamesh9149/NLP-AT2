import { z } from "zod";
import { parseSession, type SavedSession } from "./session";
import { createEmptyBrief } from "./state";
import { validIsoDate } from "./temporal";

export const DEMO_AUTH_KEY = "formbridge-guided-demo-auth-v1";
export const DEMO_RUN_KEY = "formbridge-guided-demo-run-v1";
export const DEMO_WORKSPACE = "Juniper House · Guided demo";
export const DEMO_STEPS = [
  {
    title: "A birthday begins",
    short: "Guest enquiry",
    role: "Guest",
    action: "Send enquiry to the team",
    detail:
      "You’re Alex, planning a birthday at Juniper House. Send a natural message and watch the restaurant’s brief take shape.",
    point:
      "A guest can write naturally. The team receives a saved enquiry with the conversation attached.",
  },
  {
    title: "Plans change. Details follow.",
    short: "Change of plans",
    role: "Guest",
    action: "Update the enquiry",
    detail:
      "Two more friends can make it, but the arrival time is now flexible. Add Alex’s correction.",
    point:
      "The guest count changes. “After 8 pm” stays a preference until an exact time is agreed.",
  },
  {
    title: "Offer a time",
    short: "Staff reply",
    role: "Staff",
    action: "Add the staff reply",
    detail: "Now you’re the host. Suggest an exact time for Alex to consider.",
    point:
      "A staff suggestion is an offer. It should not silently become the guest’s decision.",
  },
  {
    title: "An answer, with its source",
    short: "Guest accepts",
    role: "Guest",
    action: "Add Alex’s answer",
    detail:
      "Alex accepts the proposed time. Open Time in the brief to show the messages that support it.",
    point:
      "The conversation provides the context for “Yes”. Supporting messages stay one click away.",
  },
  {
    title: "Remember the little things",
    short: "Guest care",
    role: "Staff",
    action: "Find guest requests",
    detail:
      "Find the birthday, seating and dietary requests. Read their quotations, then choose which requests to keep.",
    point:
      "Preferences come with their source. Dietary requests still need a conversation with the guest and kitchen.",
  },
  {
    title: "Ready for the next shift",
    short: "Staff approval",
    role: "Staff",
    action: "Approve and save handoff",
    detail:
      "Check the five details, then leave the next shift a clear note. The enquiry is assigned to you with a follow-up time.",
    point:
      "Staff approve the brief. A saved owner, priority and next step make the handoff clear.",
  },
  {
    title: "Let the guest check",
    short: "Guest review",
    role: "Guest",
    action: "Create guest review link",
    detail:
      "Create the private review page, then check the details as Alex and return a confirmation.",
    point:
      "The guest sees their request and preferences. Staff notes and the full conversation stay private.",
  },
  {
    title: "One clear handoff",
    short: "Reservation handoff",
    role: "Staff",
    action: "Check simulated availability",
    detail:
      "Check the reviewed request with the demonstration connector, then complete the simulated handoff.",
    point:
      "The provider step is a simulation. The displayed reference does not represent a real reservation.",
  },
] as const;

const runSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  workspaceId: z.uuid(),
  slug: z.string().regex(/^[a-f0-9]{16}$/),
  step: z.number().int().min(0).max(DEMO_STEPS.length),
  referenceDate: z.string().refine(validIsoDate),
  date: z.string().refine(validIsoDate),
  caseId: z.uuid().nullable(),
  caseVersion: z.number().int().min(0),
  session: z.unknown(),
  reviewToken: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  reviewConfirmed: z.boolean(),
  reservation: z.string().nullable(),
  draft: z.string().max(1000),
});
export type DemoRun = Omit<z.infer<typeof runSchema>, "session"> & {
  session: SavedSession;
};

export function demoDates(now = new Date()) {
  const referenceDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const future = new Date(`${referenceDate}T12:00:00Z`);
  future.setUTCDate(future.getUTCDate() + 21);
  // Pick a Friday. The story remains usable after the original presentation date.
  future.setUTCDate(future.getUTCDate() + ((5 - future.getUTCDay() + 7) % 7));
  return { referenceDate, date: future.toISOString().slice(0, 10) };
}

export function newDemoRun(
  userId: string,
  workspaceId: string,
  slug: string,
): DemoRun {
  const dates = demoDates();
  return {
    id: crypto.randomUUID(),
    userId,
    workspaceId,
    slug,
    step: 0,
    ...dates,
    caseId: null,
    caseVersion: 0,
    session: {
      messages: [],
      brief: createEmptyBrief(),
      referenceDate: dates.referenceDate,
    },
    reviewToken: null,
    reviewConfirmed: false,
    reservation: null,
    draft: "",
  };
}

export function readDemoRun(raw: string | null): DemoRun | null {
  try {
    if (!raw || raw.length > 200_000) return null;
    const result = runSchema.parse(JSON.parse(raw));
    const session = parseSession(JSON.stringify(result.session));
    if (
      !session ||
      (result.step > 0 && !result.caseId) ||
      (result.step > 6 && !result.reviewConfirmed) ||
      (result.step === 8 && !result.reservation)
    )
      return null;
    return { ...result, session };
  } catch {
    return null;
  }
}

export function demoSuggestion(
  run: Pick<DemoRun, "step" | "date" | "session">,
): string {
  const date = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${run.date}T12:00:00Z`));
  switch (run.step) {
    case 0:
      return `Hi, I’m Alex Morgan. I’d like a table for four at Juniper House in Sydney on ${date} at 7 pm. It’s a birthday dinner. One guest has a peanut allergy, and we’d prefer a quiet table.`;
    case 1:
      return "Actually, make that six guests, and sometime after 8 pm instead.";
    case 2:
      return "Would 8:30 pm work for your request?";
    case 3:
      return "Yes, 8:30 pm is perfect. Thank you!";
    case 5:
      return `Birthday enquiry for ${run.session.brief.fields.partySize.value || "the"} guests. Check the dietary request with the guest and kitchen, and ask the floor team about a quiet table.`;
    default:
      return "";
  }
}

export function shouldFillSuggestion(
  event: {
    key: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    isComposing?: boolean;
  },
  value: string,
) {
  return (
    event.key === "Tab" &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.isComposing &&
    value.length === 0
  );
}
