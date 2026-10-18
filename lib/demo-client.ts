"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DeskResponse } from "@/hooks/use-restaurant-desk";
import { DEMO_AUTH_KEY, DEMO_WORKSPACE, type DemoRun } from "./guided-demo";
import { parseSession, type SavedSession } from "./session";

let client: SupabaseClient | undefined;
let opening:
  | Promise<{ userId: string; workspaceId: string; desk: DeskResponse }>
  | undefined;
export function demoDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error(
      "The guided demo needs the team service. Please try again shortly.",
    );
  client ??= createClient(url, key, { auth: { storageKey: DEMO_AUTH_KEY } });
  return client;
}

export async function demoRequest<T>(
  path: string,
  body?: unknown,
  authenticated = false,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authenticated) {
    const { data, error } = await demoDatabase().auth.getSession();
    if (error || !data.session)
      throw new Error(
        "The demo session has expired. Reload the page to reconnect.",
      );
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(65_000),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error ||
        "This step could not finish. Your progress is kept; please retry.",
    );
  return result as T;
}

export const readDemoDesk = (workspaceId: string) =>
  demoRequest<DeskResponse>(
    `/api/restaurant/desk?workspace=${encodeURIComponent(workspaceId)}`,
    undefined,
    true,
  );
export async function demoOperation<T = DeskResponse>(
  workspaceId: string,
  operation: unknown,
): Promise<T> {
  const current = await readDemoDesk(workspaceId);
  return demoRequest<T>(
    "/api/restaurant/desk",
    { workspaceId, version: current.version, operation },
    true,
  );
}

export function openDemoWorkspace() {
  // A shared promise prevents Strict Mode / simultaneous mounts creating two workspaces.
  opening ??= (async () => {
    const database = demoDatabase();
    let {
      data: { session },
    } = await database.auth.getSession();
    if (!session) {
      const result = await database.auth.signInAnonymously();
      if (result.error || !result.data.session)
        throw new Error(
          result.error?.message || "The demo could not sign in. Please retry.",
        );
      session = result.data.session;
    }
    const userId = session.user.id;
    const lookup = await database
      .from("fb_workspaces")
      .select("id")
      .eq("owner_id", userId)
      .eq("name", DEMO_WORKSPACE)
      .limit(1);
    if (lookup.error) throw new Error(lookup.error.message);
    let workspaceId: string = lookup.data?.[0]?.id;
    if (!workspaceId) {
      const created = await database.rpc("fb_create_workspace", {
        p_name: DEMO_WORKSPACE,
      });
      if (created.error || !created.data)
        throw new Error(
          created.error?.message || "The demo workspace could not be created.",
        );
      workspaceId = created.data;
    }
    let desk = await readDemoDesk(workspaceId);
    if (!desk.desk.restaurant.published) {
      desk = await demoOperation(workspaceId, {
        type: "restaurant",
        restaurant: {
          name: "Juniper House",
          city: "Sydney",
          welcome:
            "A thoughtful welcome, from the first hello. Try a fictional birthday enquiry in our guided demo.",
          published: true,
          facts: [
            {
              id: "demo-hours",
              category: "hours",
              title: "Dinner service",
              text: "Dinner is served Tuesday to Sunday, 5:30 pm to 10 pm. The kitchen closes at 9 pm.",
              approved: true,
            },
            {
              id: "demo-dietary",
              category: "menu",
              title: "Dietary requests",
              text: "Tell the team about dietary requirements. The guest and kitchen must confirm any allergy requirements before dining.",
              approved: true,
            },
          ],
        },
      });
    }
    return { userId, workspaceId, desk };
  })().finally(() => {
    opening = undefined;
  });
  return opening;
}

export async function loadDemoCase(
  run: Pick<DemoRun, "workspaceId" | "caseId">,
) {
  if (!run.caseId) throw new Error("Send the guest enquiry first.");
  const { data, error } = await demoDatabase()
    .from("fb_cases")
    .select("payload,version")
    .eq("workspace_id", run.workspaceId)
    .eq("id", run.caseId)
    .single();
  if (error) throw new Error(error.message);
  const session = parseSession(JSON.stringify(data.payload?.session));
  if (!session)
    throw new Error("The saved enquiry could not be read. Start a fresh tour.");
  return { session, caseVersion: data.version as number };
}

export async function saveDemoCase(run: DemoRun, session: SavedSession) {
  const { data, error } = await demoDatabase().rpc("fb_save_case", {
    p_workspace: run.workspaceId,
    p_id: run.caseId,
    p_title: "Alex Morgan · Birthday dinner",
    p_payload: { session, notes: session.notes || "" },
    p_archived: false,
    p_expected_version: run.caseVersion,
  });
  if (error) throw new Error(error.message);
  return { session, caseVersion: data.version as number };
}
