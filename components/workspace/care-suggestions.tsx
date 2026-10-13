"use client";
import { useState } from "react";
import { Heart, Check, LoaderCircle, Link2 } from "lucide-react";
import type { Message } from "@/lib/state";
import type { CareSuggestion } from "@/lib/restaurant-desk";
export function CareSuggestions({
  messages,
  onAccept,
  onSource,
}: {
  messages: Message[];
  onAccept: (suggestion: CareSuggestion) => void;
  onSource?: (id: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<CareSuggestion[]>([]),
    [accepted, setAccepted] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [checked, setChecked] = useState(false);
  async function find() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/restaurant/care", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
        signal: AbortSignal.timeout(23_000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSuggestions(result.suggestions);
      setAccepted([]);
      setChecked(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The guest requests could not be checked. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="care-suggestions">
      <div className="team-inline-heading">
        <h3>
          <Heart size={16} /> From the conversation
        </h3>
        <button
          type="button"
          className="button compact subtle"
          disabled={
            busy || !messages.some((message) => message.speaker === "customer")
          }
          onClick={find}
        >
          {busy ? (
            <LoaderCircle className="spin" size={14} />
          ) : (
            <Heart size={14} />
          )}{" "}
          {busy ? "Checking…" : "Find guest requests"}
        </button>
      </div>
      <p className="dialog-hint">
        Review the guest’s words before keeping a suggestion. Existing details
        change only when you accept one.
      </p>
      {suggestions.map((suggestion, index) => (
        <article className="care-proposal" key={`${suggestion.field}-${index}`}>
          <span>
            {suggestion.field === "dietary"
              ? "Dietary request"
              : suggestion.field === "seating"
                ? "Seating preference"
                : suggestion.field === "contact"
                  ? "Contact details"
                  : suggestion.field === "name"
                    ? "Guest name"
                    : "Occasion"}
          </span>
          <strong>{suggestion.value}</strong>
          <blockquote>“{suggestion.quote}”</blockquote>
          <div>
            {onSource && (
              <button
                type="button"
                className="text-button"
                onClick={() => onSource(suggestion.messageId)}
              >
                <Link2 size={12} /> Read source message
              </button>
            )}
            <button
              type="button"
              className="button compact subtle"
              disabled={accepted.includes(String(index))}
              onClick={() => {
                onAccept(suggestion);
                setAccepted([...accepted, String(index)]);
              }}
            >
              <Check size={13} />{" "}
              {accepted.includes(String(index))
                ? "Kept for review"
                : "Keep this request"}
            </button>
          </div>
        </article>
      ))}
      {checked && !suggestions.length && (
        <p className="dialog-hint">
          No supported guest-care details were found. You can record reviewed
          information below.
        </p>
      )}
      {error && (
        <p className="dialog-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
