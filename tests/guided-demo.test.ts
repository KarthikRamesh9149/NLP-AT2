import { describe, expect, it } from "vitest";
import {
  DEMO_AUTH_KEY,
  DEMO_RUN_KEY,
  DEMO_STEPS,
  demoDates,
  demoChanges,
  demoSuggestion,
  newDemoRun,
  readDemoRun,
  shouldFillSuggestion,
} from "@/lib/guided-demo";
import { SESSION_KEY } from "@/lib/session";

const user = "a1111111-1111-4111-8111-111111111111";
const workspace = "b1111111-1111-4111-8111-111111111111";
const slug = "4256f5d4daee3dd7";
const tab = {
  key: "Tab",
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
};

describe("guided demo", () => {
  it("shows a resolved time in history after a flexible request", () => {
    const run = newDemoRun(user, workspace, slug);
    const messages = [
      { id: "first", speaker: "customer" as const, text: "7 pm" },
      { id: "accepted", speaker: "customer" as const, text: "Yes, 8:30 pm" },
    ];
    run.session.brief.history = [
      {
        field: "time",
        previousValue: null,
        nextValue: "7 pm",
        operation: "set",
        evidenceIds: ["first"],
        revision: 1,
      },
      {
        field: "time",
        previousValue: "7 pm",
        nextValue: null,
        operation: "constrain",
        evidenceIds: ["accepted"],
        revision: 2,
      },
      {
        field: "time",
        previousValue: null,
        nextValue: "8:30 pm",
        operation: "set",
        evidenceIds: ["accepted"],
        revision: 3,
      },
    ];
    const changes = demoChanges(run.session.brief, messages);
    expect(changes).toHaveLength(2);
    expect(changes[0].nextValue).toBe("8:30 pm");
    expect(run.session.brief.history).toHaveLength(3);
  });
  it("keeps demonstration storage separate from the normal draft and authentication", () => {
    expect(DEMO_RUN_KEY).not.toBe(SESSION_KEY);
    expect(DEMO_AUTH_KEY).toBe("formbridge-guided-demo-auth-v1");
    expect(DEMO_AUTH_KEY).not.toBe(DEMO_RUN_KEY);
  });
  it("uses a future Friday with an explicit year across a year boundary", () => {
    const dates = demoDates(new Date("2026-12-31T23:00:00Z"));
    expect(dates.referenceDate).toBe("2027-01-01");
    expect(dates.date).toBe("2027-01-22");
    expect(new Date(dates.date).getUTCDay()).toBe(5);
  });
  it("creates fresh run IDs and preserves all eight stages", () => {
    const a = newDemoRun(user, workspace, slug),
      b = newDemoRun(user, workspace, slug);
    expect(a.id).not.toBe(b.id);
    expect(DEMO_STEPS).toHaveLength(8);
    expect(a.session.messages).toEqual([]);
    expect(a.caseId).toBeNull();
  });
  it("round-trips a valid session and refuses broken or fabricated completion", () => {
    const run = newDemoRun(user, workspace, slug);
    expect(readDemoRun(JSON.stringify(run))).toEqual(run);
    expect(readDemoRun("{")).toBeNull();
    expect(readDemoRun(JSON.stringify({ ...run, step: 1 }))).toBeNull();
    expect(
      readDemoRun(
        JSON.stringify({
          ...run,
          caseId: workspace,
          step: 8,
          reviewConfirmed: true,
        }),
      ),
    ).toBeNull();
    expect(readDemoRun(JSON.stringify({ ...run, step: 100 }))).toBeNull();
    expect(
      readDemoRun(JSON.stringify({ ...run, session: { messages: "bad" } })),
    ).toBeNull();
  });
  it("fills an empty composer with Tab, then lets Tab move focus normally", () => {
    expect(shouldFillSuggestion(tab, "")).toBe(true);
    expect(shouldFillSuggestion(tab, "A custom enquiry")).toBe(false);
    expect(shouldFillSuggestion(tab, " ")).toBe(false);
  });
  it.each(["shiftKey", "ctrlKey", "altKey", "metaKey", "isComposing"])(
    "does not intercept Tab with %s",
    (modifier) => {
      expect(shouldFillSuggestion({ ...tab, [modifier]: true }, "")).toBe(
        false,
      );
    },
  );
  it("gives the opening suggestion a full future date and gives staff a distinct reply", () => {
    const run = newDemoRun(user, workspace, slug);
    expect(demoSuggestion({ ...run, date: "2027-01-22" })).toContain(
      "22 January 2027",
    );
    expect(demoSuggestion({ ...run, step: 1 })).toContain(
      "sometime after 8 pm",
    );
    expect(demoSuggestion({ ...run, step: 2 })).toBe(
      "Would 8:30 pm work for your request?",
    );
    expect(demoSuggestion({ ...run, step: 4 })).toBe("");
  });
});
