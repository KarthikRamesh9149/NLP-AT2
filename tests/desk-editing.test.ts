import { describe, expect, it } from "vitest";
import { reconcileDraft } from "@/lib/desk-editing";
import { RequestScope } from "@/lib/request-scope";

describe("concurrent staff work", () => {
  it("retains local edits and incorporates unrelated teammate changes", () => {
    const original = {
      task: "Check time",
      priority: "normal",
      assigneeId: null as string | null,
    };
    const result = reconcileDraft(
      original,
      { ...original, task: "Call guest" },
      { ...original, assigneeId: "maya" },
    );
    expect(result.conflicts).toEqual([]);
    expect(result.merged).toEqual({
      ...original,
      task: "Call guest",
      assigneeId: "maya",
    });
  });
  it("requires a decision when both people change the same field", () => {
    const result = reconcileDraft(
      { task: "Check time", priority: "normal" },
      { task: "Call guest", priority: "high" },
      { task: "Email guest", priority: "normal" },
    );
    expect(result.conflicts).toEqual(["task"]);
    expect(result.merged).toEqual({ task: "Call guest", priority: "high" });
    expect(result.remoteWins).toEqual({
      task: "Email guest",
      priority: "high",
    });
  });
  it("does not treat identical concurrent changes as a conflict", () => {
    expect(
      reconcileDraft(
        { caseIds: ["one"] },
        { caseIds: ["one", "two"] },
        { caseIds: ["one", "two"] },
      ).conflicts,
    ).toEqual([]);
  });
  it("discards an old AI draft after switching conversations, even if returning to the first", async () => {
    const scope = new RequestScope();
    scope.select("workspace-one:alex");
    const alex = scope.begin();
    scope.select("workspace-one:maya");
    const maya = scope.begin();
    expect(scope.current(alex)).toBe(false);
    expect(scope.current(maya)).toBe(true);
    scope.select("workspace-one:alex");
    expect(scope.current(alex)).toBe(false);
    scope.select("workspace-two:alex");
    expect(scope.current(maya)).toBe(false);
  });
  it("does not let an older request replace a newer reply in the same conversation", () => {
    const scope = new RequestScope();
    scope.select("alex");
    const older = scope.begin(),
      newer = scope.begin();
    expect(scope.current(older)).toBe(false);
    expect(scope.current(newer)).toBe(true);
  });
});
