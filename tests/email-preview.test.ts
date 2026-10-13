import { describe, expect, it } from "vitest";
import { applyEmailPreview, emptyEmailPreview, type EmailPreview } from "@/lib/email-preview";

const email = "sam@juniper.test", password = "Juniper-preview-2026", replacement = "Juniper-new-pass-2026";
const start = 1_000_000;
async function register() {
  return (await applyEmailPreview(emptyEmailPreview(), { type: "register", email, password }, start)).state;
}
async function verified() {
  const state = await register();
  return (await applyEmailPreview(state, { type: "verify", messageId: state.inbox[0].id }, start + 1)).state;
}

describe("email access simulation", () => {
  it("creates an unverified sample identity without retaining its plain password", async () => {
    const result = await applyEmailPreview(emptyEmailPreview(), { type: "register", email: " SAM@JUNIPER.TEST ", password }, start);
    expect(result.error).toBe("");
    expect(result.state.account?.email).toBe(email);
    expect(result.state.account?.verified).toBe(false);
    expect(result.state.signedIn).toBe(false);
    expect(result.state.inbox[0]?.kind).toBe("verification");
    expect(JSON.stringify(result.state)).not.toContain(password);
  });
  it("rejects real email addresses and weak sample passwords", async () => {
    for (const address of ["sam@gmail.com", "not-an-email", "sam@test", "sam@test.evil.com"]) {
      const result = await applyEmailPreview(emptyEmailPreview(), { type: "register", email: address, password }, start);
      expect(result.error).not.toBe("");
      expect(result.state.account).toBeNull();
    }
    const result = await applyEmailPreview(emptyEmailPreview(), { type: "register", email, password: "short" }, start);
    expect(result.error).not.toBe("");
    expect(result.state.account).toBeNull();
  });
  it("requires verification and the correct password before simulated sign-in", async () => {
    const unverified = await register();
    expect((await applyEmailPreview(unverified, { type: "signin", email, password }, start + 1)).state.signedIn).toBe(false);
    const ready = await verified();
    const wrong = await applyEmailPreview(ready, { type: "signin", email, password: "A-wrong-password" }, start + 2);
    expect(wrong.error).not.toBe("");
    expect(wrong.state.signedIn).toBe(false);
    const signedIn = await applyEmailPreview(ready, { type: "signin", email, password }, start + 3);
    expect(signedIn.state.signedIn).toBe(true);
    const signedOut = await applyEmailPreview(signedIn.state, { type: "signout" }, start + 4);
    expect(signedOut.state.signedIn).toBe(false);
    expect(signedOut.state.account?.verified).toBe(true);
  });
  it("does not replace an existing sample account through registration", async () => {
    const state = await verified();
    const result = await applyEmailPreview(state, { type: "register", email: "another@juniper.test", password }, start + 1);
    expect(result.error).not.toBe("");
    expect(result.state).toEqual(state);
  });
  it("resending replaces the old verification link and each link works only once", async () => {
    const state = await register(), oldId = state.inbox[0].id;
    const resent = (await applyEmailPreview(state, { type: "resend", email }, start + 1)).state;
    expect((await applyEmailPreview(resent, { type: "verify", messageId: oldId }, start + 2)).error).not.toBe("");
    const confirmed = await applyEmailPreview(resent, { type: "verify", messageId: resent.inbox[0].id }, start + 3);
    expect(confirmed.state.account?.verified).toBe(true);
    expect((await applyEmailPreview(confirmed.state, { type: "verify", messageId: resent.inbox[0].id }, start + 4)).error).not.toBe("");
  });
  it("rejects expired verification and recovery links", async () => {
    const state = await register();
    const expired = await applyEmailPreview(state, { type: "verify", messageId: state.inbox[0].id }, start + 900_000);
    expect(expired.error).not.toBe("");
    expect(expired.state.account?.verified).toBe(false);
    const recovered = (await applyEmailPreview(await verified(), { type: "recover", email }, start + 2)).state;
    const result = await applyEmailPreview(recovered, { type: "open_recovery", messageId: recovered.inbox[0].id }, start + 900_002);
    expect(result.error).not.toBe("");
    expect(result.state.recoveryId).toBeNull();
  });
  it("recovery gives a neutral response for absent and unverified accounts", async () => {
    const unknown = await applyEmailPreview(emptyEmailPreview(), { type: "recover", email }, start);
    const pending = await applyEmailPreview(await register(), { type: "recover", email }, start + 1);
    const known = await applyEmailPreview(await verified(), { type: "recover", email }, start + 2);
    expect(unknown.notice).toBe(known.notice);
    expect(pending.notice).toBe(known.notice);
    expect(unknown.state.inbox).toHaveLength(0);
    expect(pending.state.inbox.filter(mail => mail.kind === "recovery")).toHaveLength(0);
    expect(known.state.inbox[0].kind).toBe("recovery");
  });
  it("resetting needs a valid opened link and invalidates the old password", async () => {
    const state = await verified();
    expect((await applyEmailPreview(state, { type: "reset_password", password: replacement }, start + 2)).error).not.toBe("");
    const mailed = (await applyEmailPreview(state, { type: "recover", email }, start + 3)).state;
    const opened = (await applyEmailPreview(mailed, { type: "open_recovery", messageId: mailed.inbox[0].id }, start + 4)).state;
    const weak = await applyEmailPreview(opened, { type: "reset_password", password: "short" }, start + 5);
    expect(weak.error).not.toBe("");
    expect(weak.state).toEqual(opened);
    const reset = await applyEmailPreview(opened, { type: "reset_password", password: replacement }, start + 6);
    expect(reset.error).toBe("");
    expect(reset.state.recoveryId).toBeNull();
    expect((await applyEmailPreview(reset.state, { type: "open_recovery", messageId: mailed.inbox[0].id }, start + 7)).error).not.toBe("");
    expect((await applyEmailPreview(reset.state, { type: "signin", email, password }, start + 8)).state.signedIn).toBe(false);
    expect((await applyEmailPreview(reset.state, { type: "signin", email, password: replacement }, start + 9)).state.signedIn).toBe(true);
  });
  it("cannot reset after the open recovery link expires or is replaced", async () => {
    let state = (await applyEmailPreview(await verified(), { type: "recover", email }, start + 2)).state;
    state = (await applyEmailPreview(state, { type: "open_recovery", messageId: state.inbox[0].id }, start + 3)).state;
    expect((await applyEmailPreview(state, { type: "reset_password", password: replacement }, start + 900_002)).error).not.toBe("");
    const replaced = (await applyEmailPreview(state, { type: "recover", email }, start + 4)).state;
    expect((await applyEmailPreview(replaced, { type: "reset_password", password: replacement }, start + 5)).error).not.toBe("");
  });
  it("isolates preview instances and rejects a wrong-purpose or invented link", async () => {
    const left = await register(), right = await register();
    for (const action of [
      { type: "verify", messageId: left.inbox[0].id },
      { type: "verify", messageId: "unknown" },
      { type: "open_recovery", messageId: right.inbox[0].id },
    ] as const) {
      const result = await applyEmailPreview(right, action, start + 1);
      expect(result.error).not.toBe("");
      expect(result.state).toEqual(right);
    }
    expect(emptyEmailPreview()).toEqual({ account: null, inbox: [], signedIn: false, recoveryId: null });
  });
  it("bounds the sample inbox while retaining the newest working link", async () => {
    let state: EmailPreview = await register();
    for (let index = 0; index < 20; index++) state = (await applyEmailPreview(state, { type: "resend", email }, start + index + 1)).state;
    expect(state.inbox.length).toBeLessThanOrEqual(8);
    const result = await applyEmailPreview(state, { type: "verify", messageId: state.inbox[0].id }, start + 50);
    expect(result.state.account?.verified).toBe(true);
  });
});
