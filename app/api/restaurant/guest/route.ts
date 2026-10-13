import { z } from "zod";
import { messageSchema } from "@/lib/contracts";
import {
  publicRestaurant,
  restaurantSchema,
  inboxSchema,
} from "@/lib/restaurant-desk";
import {
  approvedAnswers,
  isRestaurantQuestion,
  isBookingRequest,
} from "@/lib/guest-portal";
import {
  serviceDatabase,
  DeskError,
  databaseIssue,
  privateHeaders,
  deskErrorResponse,
} from "@/lib/server/restaurant-db";
import { analyzeConversation } from "@/lib/engine";
import {
  applyManualEdit,
  createEmptyBrief,
  clarificationFor,
  type Message,
} from "@/lib/state";
import { CURRENT_ANALYSIS_VERSION } from "@/lib/session";
import { guestCareSchema } from "@/lib/follow-up";
import {
  reserveUsage,
  settleUsage,
  UsageLimitError,
} from "@/lib/server/usage-budget";
import { utf8Bytes } from "@/lib/limits";

export const runtime = "nodejs";
export const maxDuration = 60;
const schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("chat"),
    slug: z.string().regex(/^[a-f0-9]{16}$/),
    messages: z.array(messageSchema).min(1).max(30),
  }),
  z.object({
    type: z.literal("submit"),
    slug: z.string().regex(/^[a-f0-9]{16}$/),
    messages: z.array(messageSchema).min(1).max(30),
    guestCare: guestCareSchema,
    consent: z.literal(true),
    id: z.uuid(),
  }),
]);
async function restaurantFor(slug: string) {
  if (!/^[a-f0-9]{16}$/.test(slug))
    throw new DeskError("This restaurant page is unavailable.", 404);
  const { data, error } = await serviceDatabase()
    .from("fb_desk")
    .select("workspace_id,payload")
    .eq("slug", slug)
    .maybeSingle();
  const parsed = restaurantSchema.safeParse(data?.payload?.restaurant);
  const restaurant = parsed.success ? publicRestaurant(parsed.data) : null;
  if (error || !data || !restaurant)
    throw new DeskError(
      "This restaurant is not accepting website enquiries right now.",
      404,
    );
  return { workspaceId: data.workspace_id as string, restaurant };
}
export async function GET(request: Request) {
  try {
    const { restaurant } = await restaurantFor(
      new URL(request.url).searchParams.get("slug") || "",
    );
    return Response.json({ restaurant }, { headers: privateHeaders });
  } catch (cause) {
    return deskErrorResponse(cause);
  }
}
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (utf8Bytes(raw) > 35_000)
      throw new DeskError(
        "This conversation is too long. Shorten it before sending.",
        413,
      );
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new DeskError("Check the enquiry and retry.");
    const input = parsed.data;
    if (
      new Set(input.messages.map((message) => message.id)).size !==
        input.messages.length ||
      !input.messages.some((message) => message.speaker === "customer")
    )
      throw new DeskError("Add a message about your request first.");
    const { workspaceId, restaurant } = await restaurantFor(input.slug);
    if (
      input.type === "submit" &&
      (!input.guestCare.name ||
        !input.guestCare.contact ||
        (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.guestCare.contact) &&
          !/^\+?[\d ()-]{7,30}$/.test(input.guestCare.contact)))
    )
      throw new DeskError(
        "Add your name and a valid email address or phone number.",
      );
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Sydney",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const question = [...input.messages]
      .reverse()
      .find((message) => message.speaker === "customer")!.text;
    const facts = isRestaurantQuestion(question)
      ? approvedAnswers(restaurant, question)
      : [];
    if (input.type === "chat") {
      if (isRestaurantQuestion(question) && !isBookingRequest(question)) {
        const id = await reserveUsage(request, {}, "rules");
        await settleUsage(id, null);
        return Response.json(
          {
            answer: facts.length
              ? "Here is the information our team has approved. Include any particular requests in your enquiry so we can check them with you."
              : "Our team has not published an answer to that yet. Include your question in the enquiry and we can check it with you.",
            facts,
          },
          { headers: privateHeaders },
        );
      }
    }
    let current = applyManualEdit(
      applyManualEdit(createEmptyBrief(), "restaurantName", restaurant.name),
      "city",
      restaurant.city,
    );
    const reservation = await reserveUsage(
      request,
      { messages: input.messages },
      "formbridge",
    );
    const analysis = await analyzeConversation(
      input.messages,
      current,
      "formbridge",
      date,
    );
    await settleUsage(reservation, analysis.usage);
    current = analysis.brief;
    if (input.type === "chat")
      return Response.json(
        {
          answer:
            clarificationFor(current) ||
            "Your request is ready to send to our team. Add your contact details below so we can get back to you. No table is reserved yet.",
          facts,
          fields: current.fields,
        },
        { headers: privateHeaders },
      );
    const now = new Date().toISOString(),
      id = crypto.randomUUID();
    const event = inboxSchema.parse({
      id: `website:${input.id}`,
      channel: "website",
      from: input.guestCare.contact,
      name: input.guestCare.name,
      text: input.messages
        .filter((message) => message.speaker === "customer")
        .map((message) => message.text)
        .join("\n")
        .slice(0, 1000),
      caseId: id,
      receivedAt: now,
      simulation: false,
      read: false,
      replies: [],
    });
    const session = {
      messages: input.messages as Message[],
      brief: { ...current, approvedRevision: null },
      referenceDate: date,
      analysisVersion: CURRENT_ANALYSIS_VERSION,
      guestCare: input.guestCare,
      pendingAnalysis: false,
    };
    const result = await serviceDatabase().rpc("fb_receive_enquiry", {
      p_workspace: workspaceId,
      p_case: id,
      p_title: `${input.guestCare.name} · Website enquiry`.slice(0, 80),
      p_payload: { session, notes: "" },
      p_event: event,
      p_actor: null,
    });
    if (result.error) throw databaseIssue(result.error.message);
    return Response.json(
      {
        received: true,
        message:
          "Your request has reached our team. We will review the details and contact you. No table has been reserved.",
      },
      { headers: privateHeaders },
    );
  } catch (cause) {
    if (cause instanceof UsageLimitError)
      return Response.json(
        { error: cause.message },
        {
          status: cause.status,
          headers: {
            ...privateHeaders,
            "Retry-After": String(cause.retryAfter),
          },
        },
      );
    return deskErrorResponse(
      cause instanceof SyntaxError || cause instanceof z.ZodError
        ? new DeskError("Check your enquiry and retry.")
        : cause,
    );
  }
}
