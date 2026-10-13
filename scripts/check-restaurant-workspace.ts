import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createEmptyBrief, applyManualEdit, approveBrief } from "../lib/state";
import { CURRENT_ANALYSIS_VERSION } from "../lib/session";
import { emptyWorkflow } from "../lib/restaurant-desk";
process.loadEnvFile(".env.local");
const base = process.env.FORMBRIDGE_TEST_URL || "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!,
  key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { retry: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
  },
});
const results: { name: string; passed: boolean; detail?: string }[] = [];
const users: { id: string; token: string; database: SupabaseClient }[] = [];
let workspaceId = "";
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log("PASS", name);
  } catch (error) {
    results.push({
      name,
      passed: false,
      detail: error instanceof Error ? error.message : "Failed",
    });
    console.log("FAIL", name, results.at(-1)?.detail);
  }
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function actor() {
  const database = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await database.auth.signInAnonymously();
  assert(!login.error && login.data.session, "Device sign-in failed");
  const user = {
    id: login.data.user!.id,
    token: login.data.session.access_token,
    database,
  };
  users.push(user);
  return user;
}
async function rpc(
  user: (typeof users)[number],
  name: string,
  args: Record<string, unknown>,
) {
  const result = await user.database.rpc(name, args);
  assert(!result.error, `${name}: ${result.error?.message}`);
  return result.data;
}
async function call(
  path: string,
  body?: unknown,
  user = users[0],
  status = 200,
) {
  const response = await fetch(`${base}/api/restaurant/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(65_000),
  });
  const data = await response.json();
  assert(
    response.status === status,
    `${path}: expected ${status}, got ${response.status}: ${data.error || ""}`,
  );
  return data;
}
const owner = await actor(),
  staff = await actor(),
  outside = await actor();
workspaceId = await rpc(owner, "fb_create_workspace", {
  p_name: `Workspace checks ${new Date().toISOString().slice(0, 16)}`,
});
const invite = await rpc(owner, "fb_create_invite", {
  p_workspace: workspaceId,
});
await rpc(staff, "fb_join_workspace", {
  p_token: typeof invite === "string" ? invite : invite.token,
});
let desk = await call(`desk?workspace=${workspaceId}`);
const refresh = async () =>
  (desk = await call(`desk?workspace=${workspaceId}`));
const mutate = async (
  operation: unknown,
  user = owner,
  expected = 200,
  version = desk.version,
) => {
  const result = await call(
    "desk",
    { workspaceId, version, operation },
    user,
    expected,
  );
  if (result.desk) desk = result;
  return result;
};
let brief = createEmptyBrief();
for (const [field, value] of [
  ["restaurantName", "Juniper House"],
  ["city", "Sydney"],
  ["date", "18 October 2027"],
  ["time", "8:30 pm"],
  ["partySize", "5"],
] as const)
  brief = applyManualEdit(brief, field, value);
brief = approveBrief(brief);
const session = {
  messages: [
    {
      id: "message_original",
      speaker: "customer",
      text: "Juniper House in Sydney, 18 October 2027 at 8:30 pm for five people. A quiet table please.",
    },
  ],
  brief,
  pendingAnalysis: false,
  analysisVersion: CURRENT_ANALYSIS_VERSION,
  guestCare: {
    name: "Alex Morgan",
    contact: "alex@example.test",
    dietary: "",
    seating: "quiet table",
    occasion: "birthday",
  },
};
async function saveCase(payload = session) {
  const id = randomUUID();
  await rpc(owner, "fb_save_case", {
    p_workspace: workspaceId,
    p_id: id,
    p_title: "Alex · birthday enquiry",
    p_payload: { session: payload, notes: "Private staff note: never expose" },
    p_archived: false,
    p_expected_version: 0,
  });
  return id;
}
const caseId = await saveCase();
await check("Anonymous visitors cannot read a private desk", async () => {
  const response = await fetch(
    `${base}/api/restaurant/desk?workspace=${workspaceId}`,
  );
  assert(response.status === 401, "Private desk exposed");
});
await check("Another device cannot read or mutate this workspace", async () => {
  await call(`desk?workspace=${workspaceId}`, undefined, outside, 403);
  await mutate(
    { type: "restaurant", restaurant: desk.desk.restaurant },
    outside,
    403,
  );
});
await check(
  "Staff cannot publish restaurant information or alter connections",
  async () => {
    await mutate(
      {
        type: "restaurant",
        restaurant: { ...desk.desk.restaurant, name: "Unauthorised" },
      },
      staff,
      403,
    );
    await mutate(
      { type: "connectors", connectors: desk.desk.connectors },
      staff,
      403,
    );
  },
);
await check("Staff cannot promote their own role", async () => {
  const result = await staff.database.rpc("fb_set_member", {
    p_workspace: workspaceId,
    p_user: staff.id,
    p_role: "manager",
    p_name: null,
  });
  assert(result.error, "Staff promoted themselves");
});
await check(
  "Staff cannot bypass the application to write an entire desk",
  async () => {
    for (const name of ["fb_save_desk", "fb_save_desk_secure"]) {
      const result = await staff.database.rpc(name, {
        p_workspace: workspaceId,
        p_payload: desk.desk,
        p_version: desk.version,
        ...(name.endsWith("secure") ? { p_actor: owner.id } : {}),
      });
      assert(result.error, `${name} allowed direct writes`);
    }
  },
);
await check(
  "Owner promotion gives manager rights and retains owner protection",
  async () => {
    await rpc(owner, "fb_set_member", {
      p_workspace: workspaceId,
      p_user: staff.id,
      p_role: "manager",
      p_name: null,
    });
    await mutate(
      { type: "connectors", connectors: desk.desk.connectors },
      staff,
    );
    const denied = await owner.database.rpc("fb_set_member", {
      p_workspace: workspaceId,
      p_user: owner.id,
      p_role: "staff",
      p_name: null,
    });
    assert(denied.error, "Owner role downgraded");
    await rpc(owner, "fb_set_member", {
      p_workspace: workspaceId,
      p_user: staff.id,
      p_role: "staff",
      p_name: null,
    });
    await refresh();
  },
);
await check(
  "Published page includes approved information and excludes drafts",
  async () => {
    await mutate({
      type: "restaurant",
      restaurant: {
        name: "Juniper House",
        city: "Sydney",
        welcome: "Come together over a good dinner.",
        published: true,
        facts: [
          {
            id: "hours",
            category: "hours",
            title: "Dinner hours",
            text: "Dinner is served from 5:30 pm to 10 pm.",
            approved: true,
          },
          {
            id: "secret",
            category: "policy",
            title: "Draft policy",
            text: "PRIVATE DRAFT DO NOT PUBLISH",
            approved: false,
          },
        ],
      },
    });
    const publicPage = await call(`guest?slug=${desk.slug}`);
    assert(
      publicPage.restaurant.facts.length === 1 &&
        !JSON.stringify(publicPage).includes("PRIVATE"),
      "Draft fact exposed",
    );
  },
);
await check("FAQ answers quote only approved restaurant facts", async () => {
  const result = await call("guest", {
    type: "chat",
    slug: desk.slug,
    messages: [
      { id: "faq", speaker: "customer", text: "What are your opening hours?" },
    ],
  });
  assert(
    result.facts.length === 1 && result.facts[0].id === "hours",
    "Unexpected FAQ source",
  );
});
await check(
  "Invalid contact details are rejected before analysis",
  async () => {
    await call(
      "guest",
      {
        type: "submit",
        slug: desk.slug,
        messages: session.messages,
        guestCare: { ...session.guestCare, contact: "invalid" },
        consent: true,
        id: randomUUID(),
      },
      owner,
      400,
    );
  },
);
await check("Stale desk edits cannot overwrite a teammate", async () => {
  const version = desk.version;
  await mutate({ type: "comment", caseId, text: "Kitchen to check seating." });
  await mutate(
    { type: "comment", caseId, text: "Stale edit" },
    owner,
    409,
    version,
  );
});
await check("Assignees must belong to the workspace", async () => {
  await mutate(
    {
      type: "workflow",
      caseId,
      workflow: { ...emptyWorkflow(), assigneeId: outside.id },
    },
    owner,
    400,
  );
});
await check(
  "Assignment, priority and precise reminder survive reload",
  async () => {
    await mutate({
      type: "workflow",
      caseId,
      workflow: {
        ...emptyWorkflow(),
        assigneeId: staff.id,
        priority: "high",
        dueAt: "2026-10-12T12:00:00.000Z",
        task: "Check quiet seating",
        escalationMinutes: 30,
      },
    });
    await refresh();
    assert(
      desk.desk.workflows[caseId].assigneeId === staff.id &&
        desk.desk.workflows[caseId].escalationMinutes === 30,
      "Workflow lost",
    );
  },
);
await check(
  "Guest records merge only with explicit consent and retain history",
  async () => {
    const first = {
        id: randomUUID(),
        name: "Alex Morgan",
        contact: "alex@example.test",
        notes: "Quiet table requested",
        caseIds: [caseId],
        updatedAt: new Date().toISOString(),
      },
      second = {
        ...first,
        id: randomUUID(),
        name: "Alex M",
        notes: "Birthday request",
        caseIds: [],
      };
    await mutate({ type: "guest", guest: first });
    await mutate({ type: "guest", guest: second });
    await mutate(
      {
        type: "merge",
        targetId: first.id,
        sourceId: second.id,
        confirmed: false,
      },
      owner,
      400,
    );
    await mutate({
      type: "merge",
      targetId: first.id,
      sourceId: second.id,
      confirmed: true,
    });
    assert(
      desk.desk.guests.length === 1 &&
        desk.desk.guests[0].notes.includes("Birthday"),
      "Merge lost data",
    );
  },
);
await check(
  "Guest reassignment and unlink remove the previous history",
  async () => {
    const original = desk.desk.guests[0];
    const other = {
      ...original,
      id: randomUUID(),
      name: "Different guest",
      caseIds: [],
    };
    await mutate({ type: "guest", guest: other });
    await mutate({
      type: "workflow",
      caseId,
      workflow: { ...desk.desk.workflows[caseId], guestId: other.id },
    });
    assert(
      !desk.desk.guests
        .find((guest: any) => guest.id === original.id)
        .caseIds.includes(caseId),
      "Previous guest retained the enquiry",
    );
    await mutate({ type: "guest", guest: { ...other, caseIds: [] } });
    assert(
      desk.desk.workflows[caseId].guestId === null,
      "Unlink retained the workflow association",
    );
  },
);
let review: any;
await check(
  "Private guest review omits staff notes, contact details and transcript",
  async () => {
    await mutate({
      type: "workflow",
      caseId,
      workflow: { ...desk.desk.workflows[caseId], stage: "handed_off" },
    });
    review = await call("review", {
      type: "create",
      workspaceId,
      caseId,
      caseVersion: 1,
    });
    const view = await call("review", { type: "view", token: review.token });
    assert(
      view.snapshot.partySize === "5" &&
        !JSON.stringify(view).includes("Private staff") &&
        !JSON.stringify(view).includes("alex@example.test") &&
        !("messages" in view),
      "Private data exposed",
    );
    assert(
      Date.parse(view.expiresAt) - Date.now() > 71 * 3600000,
      "Review expiry not 72h",
    );
  },
);
await check("Invalid guest token cannot reveal a review", async () => {
  await call("review", { type: "view", token: "0".repeat(64) }, owner, 400);
});
await check(
  "Guest corrections are queued and remove staff approval",
  async () => {
    const view = await call("review", { type: "view", token: review.token });
    const changes = {
      date: view.snapshot.date,
      time: view.snapshot.time,
      partySize: "6",
      dietary: "",
      seating: "quiet table",
      occasion: "birthday",
      message: "",
      consent: true,
    };
    await call("review", { type: "submit", token: review.token, changes });
    await call("review", { type: "submit", token: review.token, changes });
    const record = await owner.database
      .from("fb_cases")
      .select("payload,version")
      .eq("id", caseId)
      .single();
    assert(
      record.data?.version === 2 &&
        record.data.payload.session.pendingAnalysis &&
        record.data.payload.session.brief.approvedRevision === null,
      "Guest change was not safely queued",
    );
    assert(
      record.data.payload.session.messages.length === 2,
      "Retry duplicated guest change",
    );
    await refresh();
    assert(
      desk.desk.workflows[caseId].stage === "needs_reply",
      "Guest correction left the enquiry handed off",
    );
  },
);
await check("Revoked guest links cannot be reopened", async () => {
  await call("review", { type: "revoke", workspaceId, caseId });
  await call("review", { type: "view", token: review.token }, owner, 400);
});
const exactCase = await saveCase();
await check(
  "Guest review rejects a brief with missing field objects",
  async () => {
    const malformed = { ...session, brief: { ...session.brief, fields: {} } };
    const badCase = await saveCase(malformed as typeof session);
    const result = await owner.database.rpc("fb_create_guest_review", {
      p_workspace: workspaceId,
      p_case: badCase,
      p_version: 1,
    });
    assert(result.error, "Malformed brief shared");
  },
);
await refresh();
let channelCase = "";
const event = {
  id: randomUUID(),
  channel: "whatsapp",
  from: "+61 400 000 000",
  name: "Taylor Quinn",
  text: "Could we book a table for four on 19 October 2027 at 7 pm?",
};
await check(
  "Simulated incoming messages create private pending enquiries",
  async () => {
    const result = await mutate({ type: "mock_receive", event });
    channelCase = result.receivedCaseId;
    const row = await owner.database
      .from("fb_cases")
      .select("payload")
      .eq("id", channelCase)
      .single();
    assert(
      row.data?.payload.session.pendingAnalysis &&
        desk.desk.inbox[0].simulation,
      "Incoming event missing simulation or review",
    );
  },
);
await check("Redelivery does not create a duplicate enquiry", async () => {
  const count = desk.desk.inbox.length;
  const again = await mutate({ type: "mock_receive", event });
  assert(
    again.receivedCaseId === channelCase && desk.desk.inbox.length === count,
    "Duplicate received",
  );
});
await check(
  "A follow-up remains in the original enquiry and marks it for review",
  async () => {
    await mutate({
      type: "mock_receive",
      event: {
        ...event,
        id: randomUUID(),
        caseId: channelCase,
        text: "Actually, make that five guests.",
      },
    });
    const row = await owner.database
      .from("fb_cases")
      .select("payload,version")
      .eq("id", channelCase)
      .single();
    assert(
      row.data?.payload.session.messages.length === 2 && row.data.version === 2,
      "Follow-up lost",
    );
  },
);
await check(
  "Simulated staff replies join the conversation and retry once",
  async () => {
    const id = desk.desk.inbox.find(
        (item: any) => item.caseId === channelCase,
      ).id,
      key = randomUUID();
    await mutate({
      type: "reply",
      id,
      text: "We can review 7:30 pm. Would that suit?",
      key,
    });
    await mutate({
      type: "reply",
      id,
      text: "We can review 7:30 pm. Would that suit?",
      key,
    });
    const row = await owner.database
      .from("fb_cases")
      .select("payload")
      .eq("id", channelCase)
      .single();
    assert(
      row.data?.payload.session.messages.length === 3 &&
        row.data.payload.session.messages[2].speaker === "staff",
      "Reply duplicated or missing from context",
    );
  },
);
await check("Mock reservations require a reviewed exact brief", async () => {
  await mutate(
    { type: "reserve", caseId: channelCase, caseVersion: 3, key: randomUUID() },
    owner,
    400,
  );
});
await check(
  "Mock provider returns availability and an explicitly simulated reference",
  async () => {
    const available = await mutate({ type: "availability", caseId: exactCase });
    assert(
      available.availability.simulation && available.availability.slots.length,
      "Missing mock slots",
    );
    const key = randomUUID();
    await mutate({ type: "reserve", caseId: exactCase, caseVersion: 1, key });
    const count = desk.desk.reservations.length;
    await mutate({ type: "reserve", caseId: exactCase, caseVersion: 1, key });
    assert(
      desk.desk.reservations.length === count &&
        desk.desk.reservations[0].reference.startsWith("SIM-"),
      "Duplicate or real-looking reservation",
    );
  },
);
await check(
  "Simulated cancellation leaves the real enquiry unchanged",
  async () => {
    await mutate({
      type: "cancel_simulation",
      reservationId: desk.desk.reservations[0].id,
    });
    assert(
      desk.desk.reservations[0].status === "simulated_cancelled",
      "Missing cancellation",
    );
    const row = await owner.database
      .from("fb_cases")
      .select("version")
      .eq("id", exactCase)
      .single();
    assert(row.data?.version === 1, "Simulation altered real brief");
  },
);
await check("Provider failure preserves the approved enquiry", async () => {
  await mutate({
    type: "connectors",
    connectors: { ...desk.desk.connectors, scenario: "unavailable" },
  });
  await mutate({ type: "availability", caseId: exactCase }, owner, 400);
  await mutate({
    type: "connectors",
    connectors: { ...desk.desk.connectors, scenario: "normal" },
  });
});
await check("Guest links become stale after a new staff save", async () => {
  const link = await call("review", {
    type: "create",
    workspaceId,
    caseId: exactCase,
    caseVersion: 1,
  });
  await rpc(owner, "fb_save_case", {
    p_workspace: workspaceId,
    p_id: exactCase,
    p_title: "Changed title",
    p_payload: { session, notes: "" },
    p_archived: false,
    p_expected_version: 1,
  });
  await call("review", { type: "view", token: link.token }, owner, 409);
});
await check(
  "Atomic handoff rejects a case changed after preparation",
  async () => {
    await refresh();
    const before = desk.version;
    const result = await admin.rpc("fb_save_desk_for_case", {
      p_workspace: workspaceId,
      p_payload: desk.desk,
      p_version: before,
      p_actor: owner.id,
      p_case: exactCase,
      p_case_version: 1,
    });
    assert(
      !!result.error && result.error.code === "PT409",
      `Expected an immediate edit conflict; received ${result.error?.code || result.error?.message || "a success response"}`,
    );
    await refresh();
    assert(desk.version === before, "Rejected handoff changed the desk");
  },
);
await check("Disabled restaurant pages stop accepting enquiries", async () => {
  await mutate({
    type: "restaurant",
    restaurant: { ...desk.desk.restaurant, published: false },
  });
  await call(`guest?slug=${desk.slug}`, undefined, owner, 404);
});
await check(
  "Verified email credentials can recover the same workspace identity",
  async () => {
    const password = `${randomUUID()}Aa7!`,
      email = `formbridge-check-${randomUUID()}@example.test`;
    const update = await admin.auth.admin.updateUserById(owner.id, {
      email,
      email_confirm: true,
      password,
    });
    assert(!update.error, "Fixture email verification failed");
    const secondDevice = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await secondDevice.auth.signInWithPassword({
      email,
      password,
    });
    assert(
      !login.error && login.data.user?.id === owner.id,
      "Password sign-in changed identity",
    );
    const teams = await secondDevice
      .from("fb_workspaces")
      .select("id")
      .eq("id", workspaceId);
    assert(teams.data?.length === 1, "Recovered account lost team");
  },
);
mkdirSync("evaluation/results", { recursive: true });
const report = {
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  checkedAt: new Date().toISOString(),
  target: base,
  scope:
    "Isolated synthetic workspace; real Supabase auth, RLS and RPCs; channel and reservation providers are simulated. Email delivery is not exercised.",
  passed: results.filter((r) => r.passed).length,
  total: results.length,
  workspaceId,
  results,
};
writeFileSync(
  process.env.FORMBRIDGE_TEST_OUTPUT ||
    "evaluation/results/restaurant-workspace-checks.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({ passed: report.passed, total: report.total, workspaceId }),
);
if (results.some((r) => !r.passed)) process.exitCode = 1;
