import { z } from "zod";
import {
  authenticate,
  readDesk,
  teamCase,
  serviceDatabase,
  DeskError,
  databaseIssue,
  privateHeaders,
  deskErrorResponse,
} from "@/lib/server/restaurant-db";
import {
  restaurantSchema,
  connectorSchema,
  workflowSchema,
  guestSchema,
  deskSchema,
  canManage,
  updateWorkflow,
  mergeGuests,
  inboxSchema,
} from "@/lib/restaurant-desk";
import {
  channelMessageSchema,
  mockAvailability,
  mockReservation,
  bookingRequest,
} from "@/lib/mock-connectors";
import { createEmptyBrief } from "@/lib/state";
import { CURRENT_ANALYSIS_VERSION } from "@/lib/session";
import { utf8Bytes } from "@/lib/limits";
import {
  reserveUsage,
  settleUsage,
  UsageLimitError,
} from "@/lib/server/usage-budget";

export const runtime = "nodejs";
export const maxDuration = 30;
const operation = z.discriminatedUnion("type", [
  z.object({ type: z.literal("restaurant"), restaurant: restaurantSchema }),
  z.object({ type: z.literal("connectors"), connectors: connectorSchema }),
  z.object({
    type: z.literal("workflow"),
    caseId: z.uuid(),
    workflow: workflowSchema,
  }),
  z.object({
    type: z.literal("comment"),
    caseId: z.uuid(),
    text: z.string().trim().min(1).max(1000),
  }),
  z.object({ type: z.literal("guest"), guest: guestSchema }),
  z.object({
    type: z.literal("merge"),
    targetId: z.uuid(),
    sourceId: z.uuid(),
    confirmed: z.literal(true),
  }),
  z.object({ type: z.literal("read"), id: z.string().max(100) }),
  z.object({
    type: z.literal("reply"),
    id: z.string().max(100),
    text: z.string().trim().min(1).max(1000),
    key: z.uuid(),
  }),
  z.object({ type: z.literal("mock_receive"), event: channelMessageSchema }),
  z.object({ type: z.literal("availability"), caseId: z.uuid() }),
  z.object({
    type: z.literal("reserve"),
    caseId: z.uuid(),
    caseVersion: z.number().int().min(1),
    key: z.uuid(),
  }),
  z.object({ type: z.literal("cancel_simulation"), reservationId: z.uuid() }),
]);
const inputSchema = z.object({
  workspaceId: z.uuid(),
  version: z.number().int().min(1),
  operation,
});
export async function GET(request: Request) {
  try {
    const workspaceId = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("workspace"));
    const { database, user } = await authenticate(request);
    return Response.json(await readDesk(database, workspaceId, user.id), {
      headers: privateHeaders,
    });
  } catch (cause) {
    return deskErrorResponse(cause);
  }
}
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (utf8Bytes(raw) > 60_000)
      throw new DeskError("This update is too large.", 413);
    const parsed = inputSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new DeskError("Check the details and retry.");
    const { workspaceId, version, operation: op } = parsed.data;
    const { database, user } = await authenticate(request);
    const current = await readDesk(database, workspaceId, user.id);
    if (version !== current.version)
      throw new DeskError(
        "A teammate updated the workspace. Refresh and retry your change.",
        409,
      );
    if (
      (op.type === "restaurant" || op.type === "connectors") &&
      !canManage(current.role)
    )
      throw new DeskError(
        "Only an owner or manager can change restaurant information and connections.",
        403,
      );
    let next = current.desk;
    const now = new Date().toISOString();
    if (op.type === "restaurant") {
      if (
        op.restaurant.published &&
        (!op.restaurant.name || !op.restaurant.city)
      )
        throw new DeskError(
          "Add a restaurant name and city before publishing.",
        );
      next = { ...next, restaurant: op.restaurant };
    }
    if (op.type === "connectors") next = { ...next, connectors: op.connectors };
    if (op.type === "workflow") {
      await teamCase(database, workspaceId, op.caseId);
      next = updateWorkflow(
        next,
        op.caseId,
        op.workflow,
        current.members.map((member) => member.user_id),
      );
    }
    if (op.type === "comment") {
      await teamCase(database, workspaceId, op.caseId);
      if (next.comments.length >= 500)
        throw new DeskError("This workspace has reached its comment limit.");
      next = {
        ...next,
        comments: [
          ...next.comments,
          {
            id: crypto.randomUUID(),
            caseId: op.caseId,
            authorId: user.id,
            text: op.text,
            createdAt: now,
          },
        ],
      };
    }
    if (op.type === "guest") {
      for (const id of op.guest.caseIds)
        await teamCase(database, workspaceId, id);
      if (
        !next.guests.some((guest) => guest.id === op.guest.id) &&
        next.guests.length >= 200
      )
        throw new DeskError("This workspace has reached its guest limit.");
      next = {
        ...next,
        guests: [
          { ...op.guest, updatedAt: now },
          ...next.guests.filter((guest) => guest.id !== op.guest.id),
        ],
      };
    }
    if (op.type === "merge")
      next = mergeGuests(next, op.targetId, op.sourceId, op.confirmed);
    if (op.type === "read")
      next = {
        ...next,
        inbox: next.inbox.map((item) =>
          item.id === op.id ? { ...item, read: true } : item,
        ),
      };
    if (op.type === "reply") {
      const item = next.inbox.find((item) => item.id === op.id);
      if (!item) throw new DeskError("This message could not be found.", 404);
      if (!item.simulation || !["email", "whatsapp"].includes(item.channel))
        throw new DeskError(
          "Replies are available for the email and WhatsApp simulations. Contact this guest through your usual channel.",
        );
      if (item.replies.length >= 30)
        throw new DeskError("This conversation has reached its reply limit.");
      const record = await teamCase(database, workspaceId, item.caseId);
      const result = await serviceDatabase().rpc("fb_append_channel_message", {
        p_workspace: workspaceId,
        p_case: item.caseId,
        p_case_version: record.version,
        p_desk_version: version,
        p_event: {
          id: op.key,
          inboxId: op.id,
          text: op.text,
          sentAt: now,
          simulation: true,
        },
        p_reply: true,
        p_actor: user.id,
      });
      if (result.error) throw databaseIssue(result.error.message);
      return Response.json(await readDesk(database, workspaceId, user.id), {
        headers: privateHeaders,
      });
    }
    if (op.type === "mock_receive") {
      if (!next.connectors[op.event.channel])
        throw new DeskError("Enable this mock connector first.");
      const quota = await reserveUsage(request, {}, "rules");
      await settleUsage(quota, null);
      const id = op.event.caseId || crypto.randomUUID();
      const item = inboxSchema.parse({
        ...op.event,
        id: `${op.event.channel}:${op.event.id}`,
        caseId: id,
        receivedAt: now,
        simulation: true,
        read: false,
        replies: [],
      });
      if (op.event.caseId) {
        const record = await teamCase(database, workspaceId, id);
        const result = await serviceDatabase().rpc(
          "fb_append_channel_message",
          {
            p_workspace: workspaceId,
            p_case: id,
            p_case_version: record.version,
            p_desk_version: version,
            p_event: item,
            p_reply: false,
            p_actor: user.id,
          },
        );
        if (result.error) throw databaseIssue(result.error.message);
        return Response.json(
          {
            ...(await readDesk(database, workspaceId, user.id)),
            receivedCaseId: id,
          },
          { headers: privateHeaders },
        );
      }
      const session = {
        messages: [
          {
            id: `m_${crypto.randomUUID()}`,
            speaker: "customer",
            text: op.event.text,
          },
        ],
        brief: createEmptyBrief(),
        pendingAnalysis: true,
        analysisVersion: CURRENT_ANALYSIS_VERSION,
        referenceDate: now.slice(0, 10),
        guestCare: {
          name: op.event.name,
          contact: op.event.from,
          dietary: "",
          seating: "",
          occasion: "",
        },
      };
      const result = await serviceDatabase().rpc("fb_receive_enquiry", {
        p_workspace: workspaceId,
        p_case: id,
        p_title: `${op.event.name} · ${op.event.channel}`.slice(0, 80),
        p_payload: { session, notes: "" },
        p_event: item,
        p_actor: user.id,
      });
      if (result.error) throw databaseIssue(result.error.message);
      return Response.json(
        {
          ...(await readDesk(database, workspaceId, user.id)),
          receivedCaseId: result.data,
        },
        { headers: privateHeaders },
      );
    }
    if (op.type === "availability" || op.type === "reserve") {
      const record = await teamCase(database, workspaceId, op.caseId);
      if (record.archived)
        throw new DeskError(
          "Restore this enquiry before trying a booking handoff.",
        );
      if (op.type === "availability")
        return Response.json(
          {
            availability: mockAvailability(
              bookingRequest(record.session),
              next.connectors.scenario,
            ),
          },
          { headers: privateHeaders },
        );
      if (record.version !== op.caseVersion)
        throw new DeskError(
          "The enquiry changed. Reopen and approve its latest version.",
          409,
        );
      const existing = next.reservations.find(
        (item) => item.idempotencyKey === op.key && item.caseId === op.caseId,
      );
      if (existing)
        return Response.json(
          { ...current, reservation: existing },
          { headers: privateHeaders },
        );
      const active = next.reservations.find(
        (item) =>
          item.caseId === op.caseId && item.status === "simulated_confirmed",
      );
      if (active)
        throw new DeskError(
          "This enquiry already has a simulated reservation. Cancel that simulation before trying another handoff.",
        );
      const result = mockReservation(
        record.session,
        next.connectors.booking,
        op.key,
        next.connectors.scenario,
      );
      if (next.reservations.length >= 200)
        throw new DeskError(
          "This workspace has reached its reservation simulation limit.",
        );
      next = {
        ...next,
        reservations: [
          {
            id: crypto.randomUUID(),
            caseId: op.caseId,
            provider: result.provider,
            reference: result.reference,
            idempotencyKey: op.key,
            status: result.status,
            simulation: true,
            createdAt: now,
            caseVersion: record.version,
          },
          ...next.reservations,
        ],
      };
    }
    if (op.type === "cancel_simulation") {
      if (!next.reservations.some((item) => item.id === op.reservationId))
        throw new DeskError("This simulated reservation could not be found.");
      next = {
        ...next,
        reservations: next.reservations.map((item) =>
          item.id === op.reservationId
            ? { ...item, status: "simulated_cancelled" }
            : item,
        ),
      };
    }
    deskSchema.parse(next);
    const result = await serviceDatabase().rpc(
      op.type === "reserve" ? "fb_save_desk_for_case" : "fb_save_desk_secure",
      {
        p_workspace: workspaceId,
        p_payload: next,
        p_version: version,
        p_actor: user.id,
        ...(op.type === "reserve"
          ? { p_case: op.caseId, p_case_version: op.caseVersion }
          : {}),
      },
    );
    if (result.error) throw databaseIssue(result.error.message);
    return Response.json(
      { ...current, desk: next, version: result.data.version },
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
    if (cause instanceof SyntaxError || cause instanceof z.ZodError)
      return deskErrorResponse(new DeskError("Check the details and retry."));
    return deskErrorResponse(
      cause instanceof Error && !(cause instanceof DeskError)
        ? new DeskError(cause.message)
        : cause,
    );
  }
}
