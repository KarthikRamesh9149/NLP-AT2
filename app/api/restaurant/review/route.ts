import { z } from "zod";
import { createHash } from "node:crypto";
import {
  authenticate,
  workspaceAccess,
  teamCase,
  serviceDatabase,
  DeskError,
  databaseIssue,
  privateHeaders,
  deskErrorResponse,
} from "@/lib/server/restaurant-db";
import {
  reviewChangeSchema,
  reviewSnapshotSchema,
  reviewSubmission,
} from "@/lib/guest-portal";
import {
  reserveUsage,
  settleUsage,
  UsageLimitError,
} from "@/lib/server/usage-budget";
import { utf8Bytes } from "@/lib/limits";

export const runtime = "nodejs";
export const maxDuration = 30;
const schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create"),
    workspaceId: z.uuid(),
    caseId: z.uuid(),
    caseVersion: z.number().int().min(1),
  }),
  z.object({
    type: z.literal("revoke"),
    workspaceId: z.uuid(),
    caseId: z.uuid(),
  }),
  z.object({
    type: z.literal("view"),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({
    type: z.literal("submit"),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    changes: reviewChangeSchema,
  }),
]);
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (utf8Bytes(raw) > 6000)
      throw new DeskError("This update is too large.", 413);
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      throw new DeskError("Check the link or details and retry.");
    const input = parsed.data;
    const rate = await reserveUsage(request, {}, "rules");
    await settleUsage(rate, null);
    if (input.type === "create" || input.type === "revoke") {
      const { database, user } = await authenticate(request);
      await workspaceAccess(database, input.workspaceId, user.id);
      await teamCase(database, input.workspaceId, input.caseId);
      const { data, error } = await database.rpc(
        input.type === "create"
          ? "fb_create_guest_review"
          : "fb_revoke_guest_reviews",
        {
          p_workspace: input.workspaceId,
          p_case: input.caseId,
          ...(input.type === "create" ? { p_version: input.caseVersion } : {}),
        },
      );
      if (error) throw databaseIssue(error.message);
      return Response.json(input.type === "create" ? data : { revoked: true }, {
        headers: privateHeaders,
      });
    }
    const db = serviceDatabase();
    const view = await db.rpc("fb_view_guest_review", { p_token: input.token });
    if (view.error) throw databaseIssue(view.error.message);
    const snapshot = reviewSnapshotSchema.parse(view.data.snapshot);
    if (input.type === "view")
      return Response.json(
        { ...view.data, snapshot },
        { headers: privateHeaders },
      );
    let submission: ReturnType<typeof reviewSubmission>;
    try {
      submission = reviewSubmission(snapshot, input.changes);
    } catch (cause) {
      throw new DeskError(
        cause instanceof Error ? cause.message : "Check your changes.",
      );
    }
    const result = await db.rpc("fb_submit_guest_review", {
      p_token: input.token,
      p_message: submission.message,
      p_changed: submission.changed,
      p_hash: createHash("sha256")
        .update(JSON.stringify(submission))
        .digest("hex"),
    });
    if (result.error) throw databaseIssue(result.error.message);
    return Response.json(
      {
        received: true,
        submittedAt: result.data.submittedAt,
        message: submission.changed
          ? "Your changes have reached the team for review. No table has been reserved."
          : "Thank you. The team has received your review. Your request still needs a reservation with the restaurant.",
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
        ? new DeskError("Check the link or details and retry.")
        : cause,
    );
  }
}
