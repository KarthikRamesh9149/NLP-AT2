"use client";
import { useEffect, useState } from "react";
import {
  Utensils,
  ShieldCheck,
  Check,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";
import type { ReviewSnapshot } from "@/lib/guest-portal";
export default function ReviewPage() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setToken(window.location.hash.slice(1));
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  // Each link owns its draft and request state, including when a guest opens
  // a replacement link in the same tab.
  return <ReviewContent key={token ?? "loading"} token={token} />;
}
function ReviewContent({ token }: { token: string | null }) {
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null),
    [values, setValues] = useState({
      date: "",
      time: "",
      partySize: "",
      dietary: "",
      seating: "",
      occasion: "",
      message: "",
      consent: false,
    }),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [received, setReceived] = useState(false);
  useEffect(() => {
    if (token === null) return;
    let alive = true;
    const secret = token;
    if (!/^[a-f0-9]{64}$/.test(secret)) {
      setError(
        "This review link is invalid. Ask the restaurant for a fresh link.",
      );
      setLoading(false);
      return;
    }
    fetch("/api/restaurant/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "view", token: secret }),
      signal: AbortSignal.timeout(20_000),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!alive) return;
        setSnapshot(result.snapshot);
        setReceived(!!result.submittedAt);
        setValues({
          date: result.snapshot.date,
          time: result.snapshot.time,
          partySize: result.snapshot.partySize,
          ...result.snapshot.guestCare,
          message: "",
          consent: false,
        });
      })
      .catch((cause) => {
        if (alive)
          setError(
            cause instanceof Error
              ? cause.message
              : "The link could not be opened. Please retry.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/restaurant/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "submit", token, changes: values }),
        signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setReceived(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your review could not be sent. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="guest-page review-page">
      <header className="guest-brand">
        <span className="guest-emblem">
          <Utensils size={23} />
        </span>
        <div>
          <strong>
            {snapshot?.restaurantName || "Your restaurant enquiry"}
          </strong>
          <small>{snapshot?.city || "Private guest review"}</small>
        </div>
        <span className="guest-host">
          <ShieldCheck size={14} /> Private review
        </span>
      </header>
      <section className="guest-sheet review-sheet">
        <p className="team-overline">BEFORE WE WELCOME YOU</p>
        <h1>
          {received ? "Thank you for checking." : "Does everything look right?"}
        </h1>
        {loading ? (
          <LoaderCircle className="spin" size={25} />
        ) : received ? (
          <>
            <div className="guest-emblem">
              <Check size={31} />
            </div>
            <p>
              Your review has reached the team. Any changes will be checked
              before a reservation is made.
            </p>
            <p className="guest-note">
              This page reviews a booking request. It does not confirm or
              reserve a table.
            </p>
          </>
        ) : snapshot ? (
          <>
            <p>
              Review the details below. Send a correction if your plans have
              changed, or confirm that this describes your request.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="team-field-grid">
                <label>
                  Date
                  <input
                    className="edit-input"
                    required
                    value={values.date}
                    maxLength={120}
                    onChange={(e) =>
                      setValues({ ...values, date: e.target.value })
                    }
                  />
                </label>
                <label>
                  Time
                  <input
                    className="edit-input"
                    required
                    value={values.time}
                    maxLength={120}
                    onChange={(e) =>
                      setValues({ ...values, time: e.target.value })
                    }
                  />
                </label>
                <label>
                  Guests
                  <input
                    className="edit-input"
                    required
                    type="number"
                    min={1}
                    max={30}
                    value={values.partySize}
                    onChange={(e) =>
                      setValues({ ...values, partySize: e.target.value })
                    }
                  />
                </label>
                {(
                  [
                    ["dietary", "Dietary requests", 300],
                    ["seating", "Seating preference", 200],
                    ["occasion", "Occasion", 120],
                  ] as const
                ).map(([key, label, max]) => (
                  <label key={key}>
                    {label}
                    <input
                      className="edit-input"
                      value={values[key]}
                      maxLength={max}
                      onChange={(e) =>
                        setValues({ ...values, [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <label className="team-wide">
                  Anything else the team should know?
                  <textarea
                    className="import-input"
                    rows={3}
                    value={values.message}
                    maxLength={300}
                    onChange={(e) =>
                      setValues({ ...values, message: e.target.value })
                    }
                  />
                </label>
              </div>
              <label className="team-check">
                <input
                  type="checkbox"
                  required
                  checked={values.consent}
                  onChange={(e) =>
                    setValues({ ...values, consent: e.target.checked })
                  }
                />
                <span>
                  These details describe my request. I understand that the
                  restaurant still needs to make or confirm my reservation.
                </span>
              </label>
              <button className="button primary full-width" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Check size={16} />
                )}{" "}
                {busy ? "Sending your review…" : "Send review to the team"}
              </button>
              <p className="guest-note">
                Preferences are requests for the team to check. Staff notes and
                conversations are private.
              </p>
            </form>
          </>
        ) : (
          <p>{error}</p>
        )}
        {error && snapshot && (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        )}
      </section>
      <footer className="guest-footer">
        <a href="/">
          Prepared with FormBridge <ArrowRight size={12} />
        </a>
        <span>A little care before you arrive.</span>
      </footer>
    </main>
  );
}
