import { z } from "zod";

export type PreviewMail = {
  id: string;
  kind: "verification" | "recovery";
  to: string;
  createdAt: number;
  expiresAt: number;
  status: "ready" | "used" | "replaced";
};

export type EmailPreview = {
  account: { email: string; passwordDigest: string; verified: boolean } | null;
  inbox: PreviewMail[];
  signedIn: boolean;
  recoveryId: string | null;
};

export type EmailPreviewAction =
  | { type: "register" | "signin"; email: string; password: string }
  | { type: "resend" | "recover"; email: string }
  | { type: "verify" | "open_recovery"; messageId: string }
  | { type: "reset_password"; password: string }
  | { type: "signout" };

export type EmailPreviewResult = {
  state: EmailPreview;
  error: string;
  notice: string;
};

export function emptyEmailPreview(): EmailPreview {
  return { account: null, inbox: [], signedIn: false, recoveryId: null };
}

export async function applyEmailPreview(
  state: EmailPreview,
  action: EmailPreviewAction,
  now = Date.now(),
): Promise<EmailPreviewResult> {
  const fail = (error: string): EmailPreviewResult => ({ state, error, notice: "" });
  const done = (next: EmailPreview, notice: string): EmailPreviewResult => ({ state: next, error: "", notice });
  const email = "email" in action ? action.email.trim().toLowerCase() : "";
  if ("email" in action && (!z.email().safeParse(email).success || !email.endsWith(".test")))
    return fail("Use a sample address ending in .test, such as sam@juniper.test.");
  if ((action.type === "register" || action.type === "reset_password") && (action.password.length < 12 || action.password.length > 128))
    return fail("Choose a sample password of 12–128 characters.");
  const digest = async (password: string) => {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
  };
  const send = (current: EmailPreview, kind: PreviewMail["kind"]): EmailPreview => ({
    ...current,
    recoveryId: kind === "recovery" ? null : current.recoveryId,
    inbox: [{ id: crypto.randomUUID(), kind, to: email, createdAt: now, expiresAt: now + 15 * 60_000, status: "ready" },
      ...current.inbox.map(mail => mail.kind === kind && mail.status === "ready" ? { ...mail, status: "replaced" as const } : mail),
    ].slice(0, 8) as PreviewMail[],
  });
  const activeMail = (id: string | null, kind: PreviewMail["kind"]) => state.inbox.find(mail =>
    mail.id === id && mail.kind === kind && mail.status === "ready" && mail.expiresAt > now && mail.to === state.account?.email,
  );
  const useMail = (id: string) => state.inbox.map(mail => mail.id === id ? { ...mail, status: "used" as const } : mail);
  switch (action.type) {
    case "register":
      if (state.account) return fail("This preview already has a sample account. Sign in or start again.");
      return done(send({ ...state, account: { email, passwordDigest: await digest(action.password), verified: false } }, "verification"),
        "Your sample account is ready to verify. Open the message in the preview inbox.");
    case "signin":
      if (!state.account || state.account.email !== email || state.account.passwordDigest !== await digest(action.password))
        return fail("The sample email and password do not match. Try again or recover access.");
      if (!state.account.verified) return fail("Verify your sample address using the preview inbox first.");
      return done({ ...state, signedIn: true, recoveryId: null }, "You are signed in to the simulation. Your real team account has not changed.");
    case "resend":
      if (!state.account || state.account.email !== email || state.account.verified)
        return fail("Create an unverified sample account before requesting another verification message.");
      return done(send(state, "verification"), "A new verification message is in the preview inbox. The previous link has been replaced.");
    case "recover":
      return done(state.account?.verified && state.account.email === email ? send(state, "recovery") : state,
        "If this address has a verified sample account, a recovery message is in the preview inbox.");
    case "verify":
      if (!activeMail(action.messageId, "verification") || !state.account)
        return fail("This sample verification link has expired, was replaced or was already used. Request a new message.");
      return done({ ...state, account: { ...state.account, verified: true }, inbox: useMail(action.messageId) },
        "Sample address verified. You can now sign in to the preview.");
    case "open_recovery":
      if (!state.account?.verified || !activeMail(action.messageId, "recovery"))
        return fail("This sample recovery link is unavailable. Request a fresh recovery message.");
      return done({ ...state, signedIn: false, recoveryId: action.messageId }, "Choose a new sample password to finish the recovery.");
    case "reset_password":
      if (!state.account?.verified || !state.recoveryId || !activeMail(state.recoveryId, "recovery"))
        return fail("Open a current recovery message in the preview inbox before changing the sample password.");
      return done({ ...state, account: { ...state.account, passwordDigest: await digest(action.password) }, signedIn: false,
        inbox: useMail(state.recoveryId), recoveryId: null }, "Sample password changed. Sign in with your new password.");
    case "signout":
      return done({ ...state, signedIn: false, recoveryId: null }, "Signed out of the simulation.");
  }
}
