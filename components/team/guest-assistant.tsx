"use client";
import { useEffect, useState } from "react";
import {
  Send,
  Utensils,
  Check,
  ArrowRight,
  LoaderCircle,
  RotateCcw,
  Heart,
} from "lucide-react";
import type { Restaurant } from "@/lib/restaurant-desk";
import type { Message, Brief } from "@/lib/state";
import { readGuestDraft } from "@/lib/guest-draft";
import { emptyGuestCare } from "@/lib/follow-up";
export function GuestAssistant({ slug }: { slug: string }) {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null),
    [loading, setLoading] = useState(true),
    [messages, setMessages] = useState<Message[]>([]),
    [facts, setFacts] = useState<Record<string, Restaurant["facts"]>>({}),
    [draft, setDraft] = useState(""),
    [fields, setFields] = useState<Brief["fields"] | null>(null),
    [care, setCare] = useState(emptyGuestCare),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [received, setReceived] = useState(false),
    [restored, setRestored] = useState(false),
    [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    try {
      const saved = readGuestDraft(
        sessionStorage.getItem(`formbridge-guest-${slug}`),
      );
      if (saved) {
        setMessages(saved.messages);
        setFacts(saved.facts);
        setDraft(saved.draft);
        setCare(saved.care);
        setFields(saved.fields);
        setSubmissionId(saved.submissionId);
        setReceived(saved.received);
      }
    } catch {}
    setRestored(true);
  }, [slug]);
  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(
        `formbridge-guest-${slug}`,
        JSON.stringify({
          messages,
          facts,
          draft,
          care,
          fields,
          submissionId,
          received,
          savedAt: Date.now(),
        }),
      );
    } catch {}
  }, [
    slug,
    restored,
    messages,
    facts,
    draft,
    care,
    fields,
    submissionId,
    received,
  ]);
  useEffect(() => {
    let alive = true;
    fetch(`/api/restaurant/guest?slug=${slug}`, {
      signal: AbortSignal.timeout(15_000),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (alive) setRestaurant(result.restaurant);
      })
      .catch((cause) => {
        if (alive)
          setError(
            cause instanceof Error
              ? cause.message
              : "The restaurant page could not be opened.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug]);
  async function chat(next: Message[]) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/restaurant/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "chat", slug, messages: next }),
        signal: AbortSignal.timeout(60_000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Please retry.");
      const id = `s_${crypto.randomUUID()}`;
      setMessages([...next, { id, speaker: "staff", text: result.answer }]);
      if (result.facts?.length)
        setFacts((previous) => ({ ...previous, [id]: result.facts }));
      if (result.fields) setFields(result.fields);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We could not check that message. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function add() {
    if (!draft.trim() || busy || messages.length >= 28) return;
    const next = [
      ...messages,
      {
        id: `g_${crypto.randomUUID()}`,
        speaker: "customer" as const,
        text: draft.trim(),
      },
    ];
    setMessages(next);
    setDraft("");
    await chat(next);
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/restaurant/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "submit",
          slug,
          messages,
          guestCare: care,
          consent,
          id: submissionId,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "Your request could not be sent. Please retry.",
        );
      setReceived(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your request could not be sent. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className="guest-page guest-loading">
        <LoaderCircle className="spin" size={27} />
        <p>Getting your welcome ready…</p>
      </main>
    );
  if (!restaurant)
    return (
      <main className="guest-page">
        <section className="guest-sheet">
          <Utensils size={32} />
          <h1>A little pause at the door.</h1>
          <p>{error || "This restaurant page is unavailable."}</p>
          <a className="button subtle" href="/">
            Open FormBridge <ArrowRight size={15} />
          </a>
        </section>
      </main>
    );
  return (
    <main className="guest-page">
      <header className="guest-brand">
        <span className="guest-emblem">
          <Utensils size={23} />
        </span>
        <div>
          <strong>{restaurant.name}</strong>
          <small>{restaurant.city}</small>
        </div>
        <span className="guest-host">Guest enquiries</span>
      </header>
      <section className="guest-heading">
        <p className="team-overline">A SEAT AT OUR TABLE</p>
        <h1>
          Tell us about <em>your plans.</em>
        </h1>
        <p>{restaurant.welcome}</p>
      </section>
      {received ? (
        <section className="guest-sheet guest-thanks">
          <div className="guest-emblem">
            <Check size={33} />
          </div>
          <h2>Your request is with our team.</h2>
          <p>
            We’ll review the details and contact you at{" "}
            <strong>{care.contact}</strong>. No table has been reserved yet.
          </p>
          <button
            className="button subtle"
            onClick={() => {
              setMessages([]);
              setFacts({});
              setFields(null);
              setCare(emptyGuestCare());
              setConsent(false);
              setReceived(false);
              setSubmissionId(crypto.randomUUID());
            }}
          >
            Start another enquiry <ArrowRight size={15} />
          </button>
        </section>
      ) : (
        <div className="guest-assistant-layout">
          <section className="guest-chat guest-sheet">
            <div className="guest-chat-heading">
              <span>
                <MessageSymbol /> A warm welcome, one detail at a time.
              </span>
              <small>
                Ask about the restaurant or tell us what you have in mind.
              </small>
            </div>
            <div className="guest-chat-thread" aria-live="polite">
              {!messages.length ? (
                <div className="guest-chat-empty">
                  <Heart size={26} />
                  <h3>Something worth gathering for.</h3>
                  <p>
                    A birthday dinner, a long-overdue catch-up or a quiet
                    evening for two. Tell us the date, time and number of
                    guests.
                  </p>
                </div>
              ) : (
                messages.map((message) => (
                  <article
                    className={`guest-chat-message ${message.speaker}`}
                    key={message.id}
                  >
                    <span>
                      {message.speaker === "customer" ? "You" : restaurant.name}
                    </span>
                    <p>{message.text}</p>
                    {facts[message.id]?.map((fact) => (
                      <blockquote key={fact.id}>
                        <strong>{fact.title}</strong>
                        <p>{fact.text}</p>
                        <small>Restaurant information</small>
                      </blockquote>
                    ))}
                  </article>
                ))
              )}
              {busy && (
                <p className="guest-chat-working">
                  <LoaderCircle className="spin" size={16} /> Checking your
                  request…
                </p>
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <label className="sr-only" htmlFor="guest-message">
                Message to restaurant
              </label>
              <textarea
                id="guest-message"
                rows={3}
                maxLength={1000}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Tell us your preferred date, time and number of guests…"
                disabled={busy || messages.length >= 28}
              />
              <button
                className="button primary"
                disabled={busy || !draft.trim() || messages.length >= 28}
              >
                <Send size={16} /> Add message
              </button>
            </form>
            {messages.length >= 28 && (
              <p className="dialog-hint">
                Send this enquiry below; the team can continue the conversation
                with you.
              </p>
            )}
          </section>
          <aside>
            <section className="guest-sheet guest-request">
              <span className="team-overline">YOUR REQUEST</span>
              <h2>A few useful details.</h2>
              <div className="guest-request-fields">
                {(
                  [
                    ["date", "Date"],
                    ["time", "Time"],
                    ["partySize", "Guests"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <span>{label}</span>
                    <strong>
                      {fields?.[key].status === "resolved"
                        ? fields[key].value
                        : fields?.[key].constraint || "To confirm"}
                    </strong>
                  </div>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <label>
                  Your name
                  <input
                    className="edit-input"
                    required
                    value={care.name}
                    maxLength={100}
                    onChange={(e) => setCare({ ...care, name: e.target.value })}
                  />
                </label>
                <label>
                  Email or phone
                  <input
                    className="edit-input"
                    required
                    value={care.contact}
                    maxLength={120}
                    onChange={(e) =>
                      setCare({ ...care, contact: e.target.value })
                    }
                  />
                </label>
                <details>
                  <summary>A little extra care</summary>
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
                        value={care[key]}
                        maxLength={max}
                        onChange={(e) =>
                          setCare({ ...care, [key]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                </details>
                <label className="team-check">
                  <input
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    I agree to share this enquiry and my contact details with{" "}
                    {restaurant.name} so the team can respond.
                  </span>
                </label>
                <button
                  className="button primary full-width"
                  disabled={
                    busy ||
                    !messages.some((message) => message.speaker === "customer")
                  }
                >
                  <Send size={15} />{" "}
                  {busy ? "Please wait…" : "Send request to the team"}
                </button>
                <p className="guest-note">
                  Sending a request does not reserve a table. Dietary and
                  seating requests need the team’s confirmation.
                </p>
              </form>
            </section>
          </aside>
        </div>
      )}
      {error && (
        <div className="alert error" role="alert">
          <span>{error}</span>
          {messages.at(-1)?.speaker === "customer" && !busy && (
            <button className="text-button" onClick={() => chat(messages)}>
              <RotateCcw size={14} /> Retry message
            </button>
          )}
        </div>
      )}
      <footer className="guest-footer">
        <a href="/">Prepared with FormBridge</a>
        <span>A little care before you arrive.</span>
      </footer>
    </main>
  );
}
function MessageSymbol() {
  return (
    <span className="guest-message-symbol" aria-hidden="true">
      ✦
    </span>
  );
}
