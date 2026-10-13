"use client";
import { useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import type { useTeam } from "@/hooks/use-team";

export function AccountAccess({ team }: { team: ReturnType<typeof useTeam> }) {
  const emailDelivery =
    process.env.NEXT_PUBLIC_EMAIL_DELIVERY_ENABLED === "true";
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  if (!team.database) return null;
  if (team.user?.is_anonymous && !emailDelivery)
    return (
      <section className="account-access">
        <h3>
          <ShieldCheck size={17} /> Keep access to your team.
        </h3>
        <p>
          This device account stays in this browser. Keep a private team
          invitation code or download important enquiries before clearing
          browser data.
        </p>
      </section>
    );
  async function submit() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const redirectTo = `${window.location.origin}/auth`;
      if (team.user?.is_anonymous) {
        const result = await team.database!.auth.updateUser(
          { email },
          { emailRedirectTo: redirectTo },
        );
        if (result.error) throw result.error;
        setNotice(
          "Check your email to verify this account. Use this browser to open the link, then set a password. Your workspace stays with this identity.",
        );
      } else if (mode === "signin") {
        const result = await team.database!.auth.signInWithPassword({
          email,
          password,
        });
        if (result.error) throw result.error;
        setNotice("Signed in. Your account’s teams are loading.");
      } else if (mode === "signup") {
        const result = await team.database!.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (result.error) throw result.error;
        setNotice(
          "If registration is available for this address, a verification email will arrive. Verify your email before signing in.",
        );
      } else {
        const result = await team.database!.auth.resetPasswordForEmail(email, {
          redirectTo,
        });
        if (result.error) throw result.error;
        setNotice(
          "If this email belongs to an account, a recovery link will arrive. Open it to choose a new password.",
        );
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(
        /rate|too many|seconds/i.test(message)
          ? "Too many email requests. Wait a few minutes and retry."
          : mode === "signin" && !team.user
            ? "Check your email and password, and verify your email if you have just registered."
            : "Email verification is unavailable right now. You can continue on this device and try again later.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-access">
      <h3>
        <ShieldCheck size={17} />{" "}
        {team.user?.is_anonymous
          ? "Keep access beyond this device."
          : "Sign in with your email."}
      </h3>
      <p>
        {team.user?.is_anonymous
          ? "Verify an email address to protect this device account and recover your team on another browser."
          : "Your private team workspace follows your verified account."}
      </p>
      {!team.user && (
        <div className="account-tabs">
          {(emailDelivery
            ? (["signin", "signup", "reset"] as const)
            : (["signin"] as const)
          ).map((value) => (
            <button
              className={mode === value ? "selected" : ""}
              onClick={() => {
                setMode(value);
                setError("");
                setNotice("");
              }}
              key={value}
            >
              {value === "signin"
                ? "Sign in"
                : value === "signup"
                  ? "Create account"
                  : "Recover access"}
            </button>
          ))}
        </div>
      )}
      {!emailDelivery && !team.user && (
        <p className="dialog-hint">
          Sign in here if you already have an account. New email accounts and
          email recovery are not available yet; device sign-in remains available
          above.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label>
          Email
          <input
            className="edit-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        {!team.user && mode !== "reset" && (
          <label>
            Password
            <input
              className="edit-input"
              type="password"
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              minLength={mode === "signup" ? 12 : 1}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {mode === "signup" && !team.user && (
          <p className="dialog-hint">
            Use a password of at least 12 characters. Verify your email before
            opening a team.
          </p>
        )}
        <button className="button primary" disabled={busy}>
          <Mail size={15} />
          {busy
            ? "Please wait…"
            : team.user?.is_anonymous
              ? "Verify my email"
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Send recovery link"}
        </button>
      </form>
      {error && (
        <p className="dialog-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="dialog-success" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
