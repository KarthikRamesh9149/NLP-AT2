import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  deskSchema,
  emptyDesk,
  canManage,
  type StaffRole,
} from "../restaurant-desk";
import { parseSession } from "../session";

export class DeskError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function serviceDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new DeskError(
      "The team desk is temporarily unavailable. Please retry.",
      503,
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
    },
  });
}
export async function authenticate(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new DeskError("Sign in to open your team desk.", 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new DeskError("Team access is temporarily unavailable.", 503);
  const database = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
    },
  });
  const { data, error } = await database.auth.getUser(token);
  if (error || !data.user)
    throw new DeskError("Your sign-in expired. Sign in again.", 401);
  return { database, user: data.user };
}
export async function workspaceAccess(
  database: SupabaseClient,
  workspaceId: string,
  userId: string,
) {
  const { data, error } = await database
    .from("fb_members")
    .select("user_id,role,display_name")
    .eq("workspace_id", workspaceId);
  const members = (data || []) as {
    user_id: string;
    role: StaffRole;
    display_name: string;
  }[];
  const member = members.find((item) => item.user_id === userId);
  if (error || !member)
    throw new DeskError("You do not have access to this team.", 403);
  return { members, role: member.role };
}
export async function readDesk(
  database: SupabaseClient,
  workspaceId: string,
  userId: string,
) {
  const access = await workspaceAccess(database, workspaceId, userId);
  let { data, error } = await database
    .from("fb_desk")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error)
    throw new DeskError(
      "Your team desk could not be loaded. Please retry.",
      503,
    );
  if (!data && canManage(access.role)) {
    const result = await serviceDatabase().rpc("fb_save_desk_secure", {
      p_workspace: workspaceId,
      p_payload: emptyDesk(),
      p_version: 0,
      p_actor: userId,
    });
    if (result.error) {
      const retry = await database
        .from("fb_desk")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      data = retry.data;
    } else data = result.data;
  }
  if (!data)
    throw new DeskError(
      "The owner or manager needs to open this team desk once to finish setup.",
      409,
    );
  const parsed = deskSchema.safeParse(data.payload);
  if (!parsed.success)
    throw new DeskError(
      "This workspace needs a data check. Your saved enquiries are kept.",
      503,
    );
  return {
    ...access,
    desk: parsed.data,
    version: data.version as number,
    slug: data.slug as string,
  };
}
export async function teamCase(
  database: SupabaseClient,
  workspaceId: string,
  id: string,
) {
  const { data, error } = await database
    .from("fb_cases")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  const session = data
    ? parseSession(JSON.stringify(data.payload?.session))
    : null;
  if (error || !data || !session)
    throw new DeskError("This enquiry could not be found in your team.", 404);
  return { ...data, session };
}
export function databaseIssue(message: string) {
  const concurrency = /teammate|changed|current enquiry|reopen|refresh/i.test(
    message,
  );
  return new DeskError(message, concurrency ? 409 : 400);
}
export const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};
export function deskErrorResponse(cause: unknown) {
  return Response.json(
    {
      error:
        cause instanceof DeskError
          ? cause.message
          : "This action could not be completed. Your enquiry is kept. Please retry.",
    },
    {
      status: cause instanceof DeskError ? cause.status : 503,
      headers: privateHeaders,
    },
  );
}
