import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newDemoRun, DEMO_AUTH_KEY } from "@/lib/guided-demo";
import { emptyDesk } from "@/lib/restaurant-desk";

const mock = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mock.createClient }));
const user = "a1111111-1111-4111-8111-111111111111";
const workspace = "b1111111-1111-4111-8111-111111111111";
const slug = "4256f5d4daee3dd7";

describe("guided demo service boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("coalesces simultaneous opening and uses a separate auth namespace", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: workspace, error: null });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mock.createClient.mockReturnValue({
      auth: {
        getSession: vi
          .fn()
          .mockResolvedValue({
            data: {
              session: { user: { id: user }, access_token: "demo-token" },
            },
          }),
      },
      from: vi.fn().mockReturnValue(query),
      rpc,
    });
    const desk = emptyDesk();
    desk.restaurant.published = true;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ desk, slug, version: 1, role: "owner", members: [] }),
        ),
    );
    const { openDemoWorkspace } = await import("@/lib/demo-client");
    const first = openDemoWorkspace(),
      second = openDemoWorkspace();
    expect(first).toBe(second);
    expect((await first).workspaceId).toBe(workspace);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mock.createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "public-test-key",
      { auth: { storageKey: DEMO_AUTH_KEY } },
    );
    expect(query.eq).toHaveBeenCalledWith("owner_id", user);
  });

  it("keeps public guest requests unauthenticated and sends only the demo token to staff operations", async () => {
    mock.createClient.mockReturnValue({
      auth: {
        getSession: vi
          .fn()
          .mockResolvedValue({
            data: { session: { access_token: "demo-token" } },
          }),
      },
    });
    const fetcher = vi
      .fn()
      .mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
    vi.stubGlobal("fetch", fetcher);
    const { demoRequest } = await import("@/lib/demo-client");
    await demoRequest("/api/restaurant/guest", { type: "submit" });
    await demoRequest("/api/restaurant/desk", { operation: "test" }, true);
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer demo-token",
    );
  });

  it("surfaces rate limits and missing sign-in instead of returning a success", async () => {
    mock.createClient.mockReturnValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
    });
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: "Please wait before retrying." },
          { status: 429 },
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const { demoRequest } = await import("@/lib/demo-client");
    await expect(demoRequest("/api/analyze", {})).rejects.toThrow(
      "Please wait before retrying.",
    );
    await expect(demoRequest("/api/restaurant/desk", {}, true)).rejects.toThrow(
      "expired",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("saves against the exact case version and preserves conflict errors", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({
        error: { message: "The enquiry changed. Refresh and retry." },
      });
    mock.createClient.mockReturnValue({ rpc });
    const { saveDemoCase } = await import("@/lib/demo-client");
    const run = {
      ...newDemoRun(user, workspace, slug),
      caseId: "c1111111-1111-4111-8111-111111111111",
      caseVersion: 7,
    };
    await expect(saveDemoCase(run, run.session)).rejects.toThrow(
      "enquiry changed",
    );
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_workspace: workspace,
      p_id: run.caseId,
      p_expected_version: 7,
    });
  });
});
