"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, ArrowRight, Check, LoaderCircle } from "lucide-react";
import { browserDatabase } from "@/lib/supabase-browser";
export default function AuthPage() {
  const [status, setStatus] = useState<"loading" | "verified" | "error">(
      "loading",
    ),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  useEffect(() => {
    const db = browserDatabase();
    let alive = true;
    if (!db) {
      setStatus("error");
      return;
    }
    const check = () =>
      db.auth.getUser().then((result) => {
        if (alive)
          setStatus(
            !result.error &&
              !!result.data.user?.email_confirmed_at &&
              !result.data.user.is_anonymous
              ? "verified"
              : "error",
          );
      });
    const { data } = db.auth.onAuthStateChange(() => {
      window.setTimeout(check, 0);
    });
    check();
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await browserDatabase()!.auth.updateUser({ password });
      if (result.error) throw result.error;
      setDone(true);
    } catch {
      setError(
        "The password could not be saved. Open a fresh verification or recovery link and retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="guest-page auth-page">
      <a className="brand" href="/">
        <span className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        FormBridge
      </a>
      <section className="guest-sheet">
        <div className="guest-emblem">
          <ShieldCheck size={30} />
        </div>
        <p className="team-overline">YOUR PRIVATE TEAM DESK</p>
        <h1>
          {status === "loading"
            ? "Opening your account…"
            : status === "error"
              ? "This link needs another check."
              : done
                ? "Your account is ready."
                : "Your email is verified."}
        </h1>
        {status === "loading" ? (
          <LoaderCircle className="spin" size={24} />
        ) : status === "error" ? (
          <>
            <p>
              The link may have expired, or it may need to be opened in the
              browser where you requested it. Ask for a fresh account recovery
              link from the team workspace.
            </p>
            <a className="button primary" href="/team">
              Return to your team <ArrowRight size={15} />
            </a>
          </>
        ) : done ? (
          <>
            <p>
              Your verified email and password can now recover this account on
              another device.
            </p>
            <a className="button primary" href="/team">
              Open your team desk <ArrowRight size={15} />
            </a>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <p>
              Choose a password to keep access to your restaurant workspace.
            </p>
            <label>
              New password
              <input
                className="edit-input"
                type="password"
                minLength={12}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <p className="dialog-hint">At least 12 characters.</p>
            <button className="button primary" disabled={busy}>
              <Check size={15} /> {busy ? "Saving…" : "Save password"}
            </button>
            {error && (
              <p className="dialog-error" role="alert">
                {error}
              </p>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
