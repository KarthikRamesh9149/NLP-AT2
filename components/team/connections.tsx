"use client";
import { useState } from "react";
import {
  Mail,
  MessageCircle,
  Utensils,
  Send,
  RotateCcw,
  Check,
  CalendarDays,
} from "lucide-react";
import { canManage } from "@/lib/restaurant-desk";
import { providerNames } from "@/lib/mock-connectors";
import type { TeamCase } from "@/hooks/use-team";
import type { useRestaurantDesk } from "@/hooks/use-restaurant-desk";

export function Connections({
  desk,
  cases,
}: {
  desk: ReturnType<typeof useRestaurantDesk>;
  cases: TeamCase[];
}) {
  const data = desk.data!,
    [settings, setSettings] = useState(data.desk.connectors),
    [version, setVersion] = useState(data.version),
    [savedBase, setSavedBase] = useState(JSON.stringify(data.desk.connectors)),
    [channel, setChannel] = useState<"email" | "whatsapp">("email"),
    [name, setName] = useState(""),
    [from, setFrom] = useState(""),
    [text, setText] = useState(""),
    [eventId, setEventId] = useState(() => crypto.randomUUID()),
    [lastEvent, setLastEvent] = useState<Record<string, string> | null>(null),
    [notice, setNotice] = useState(""),
    [caseId, setCaseId] = useState(""),
    [threadId, setThreadId] = useState(""),
    [availability, setAvailability] = useState<{
      slots: { time: string }[];
      date: string;
    } | null>(null),
    [key, setKey] = useState(() => crypto.randomUUID());
  const editable = canManage(data.role);
  const remoteChanged = JSON.stringify(data.desk.connectors) !== savedBase;
  const selected = cases.find((record) => record.id === caseId);
  async function run(
    operation: Record<string, unknown>,
    message: string,
    base = data.version,
  ) {
    setNotice("");
    try {
      const result = await desk.perform(operation, base);
      setNotice(message);
      if (result.version && base === version) setVersion(result.version);
      return result;
    } catch {
      return null;
    }
  }
  async function receive(event: Record<string, string>) {
    const result = await run(
      { type: "mock_receive", event },
      "Simulated message received. Open the inbox to review it.",
    );
    if (result) {
      setLastEvent(event);
      setEventId(crypto.randomUUID());
    }
  }
  return (
    <section>
      <div className="team-section-heading">
        <div>
          <p className="team-overline">CONNECTIONS</p>
          <h2>Bring the whole enquiry together.</h2>
          <p>
            Try email, WhatsApp and booking handoffs with simulated connections.
          </p>
        </div>
        <span className="simulation-pill">Simulation mode</span>
      </div>
      {remoteChanged && (
        <div className="alert notice" role="status">
          <span>Connection settings changed while this form was open.</span>
          <button
            className="text-button"
            onClick={() => {
              setSettings(data.desk.connectors);
              setSavedBase(JSON.stringify(data.desk.connectors));
              setVersion(data.version);
            }}
          >
            Reload saved connections
          </button>
        </div>
      )}
      <div className="team-soft-note">
        These connectors never contact guests or make real reservations. The
        website assistant and private guest review links use your actual team
        workspace.
      </div>
      <div className="connection-grid">
        {(
          [
            { id: "email", title: "Email inbox", icon: Mail },
            { id: "whatsapp", title: "WhatsApp inbox", icon: MessageCircle },
          ] as const
        ).map((item) => (
          <div className="team-card connection-card" key={item.id}>
            <item.icon size={25} />
            <h3>{item.title}</h3>
            <p>
              Incoming enquiries, a reviewable brief and simulated replies in
              one place.
            </p>
            <label className="team-check">
              <input
                type="checkbox"
                checked={settings[item.id]}
                disabled={!editable}
                onChange={(e) =>
                  setSettings({ ...settings, [item.id]: e.target.checked })
                }
              />
              <span>Enable mock connector</span>
            </label>
            <span className="simulation-pill">Simulated</span>
          </div>
        ))}
        <div className="team-card connection-card">
          <Utensils size={25} />
          <h3>Booking handoff</h3>
          <p>
            Availability, reservation references and cancellation responses for
            your team to test.
          </p>
          <label>
            Provider
            <select
              className="edit-input"
              value={settings.booking}
              disabled={!editable}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  booking: e.target.value as typeof settings.booking,
                })
              }
            >
              {Object.entries(providerNames).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <span className="simulation-pill">Simulated</span>
        </div>
      </div>
      {editable && (
        <div className="team-action-row">
          <label>
            Booking provider response
            <select
              className="edit-input"
              value={settings.scenario}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  scenario: e.target.value as typeof settings.scenario,
                })
              }
            >
              <option value="normal">Available tables</option>
              <option value="full">Fully booked</option>
              <option value="unavailable">Provider unavailable</option>
            </select>
          </label>
          <button
            className="button primary"
            disabled={desk.busy}
            onClick={async () => {
              const result = await run(
                { type: "connectors", connectors: settings },
                "Connection settings saved.",
                remoteChanged ? version : data.version,
              );
              if (result) {
                setVersion(result.version);
                setSettings(result.desk.connectors);
                setSavedBase(JSON.stringify(result.desk.connectors));
              }
            }}
          >
            <Check size={15} /> Save connections
          </button>
        </div>
      )}
      <div className="team-two-column">
        <div className="team-card">
          <h3>Send a message into the desk</h3>
          <p>Use your own enquiry to test either channel.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              receive({
                id: eventId,
                channel,
                name,
                from,
                text,
                ...(threadId ? { caseId: threadId } : {}),
              });
            }}
          >
            <div className="team-field-grid">
              <label>
                Channel
                <select
                  className="edit-input"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as typeof channel)}
                >
                  <option value="email">Email simulation</option>
                  <option value="whatsapp">WhatsApp simulation</option>
                </select>
              </label>
              <label>
                Guest name
                <input
                  className="edit-input"
                  required
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="team-wide">
                Guest email or phone
                <input
                  className="edit-input"
                  required
                  value={from}
                  maxLength={120}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="team-wide">
                Conversation
                <select
                  className="edit-input"
                  value={threadId}
                  onChange={(e) => setThreadId(e.target.value)}
                >
                  <option value="">Start a new enquiry</option>
                  {cases
                    .filter((record) => !record.archived)
                    .map((record) => (
                      <option key={record.id} value={record.id}>
                        {record.title}
                      </option>
                    ))}
                </select>
              </label>
              <label className="team-wide">
                Message
                <textarea
                  className="import-input"
                  rows={4}
                  required
                  maxLength={1000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="We’d love a table for five at 8:30 pm on 18 October 2027. It’s a birthday dinner…"
                />
              </label>
            </div>
            <button
              className="button primary"
              disabled={desk.busy || !text.trim()}
            >
              <Send size={15} /> Receive simulated message
            </button>
          </form>
          {lastEvent && (
            <button
              className="text-button"
              disabled={desk.busy}
              onClick={() => receive(lastEvent)}
            >
              <RotateCcw size={14} /> Deliver the same message again
            </button>
          )}
        </div>
        <div className="team-card">
          <h3>Try a booking handoff</h3>
          <p>
            Approve and save an exact booking brief first. Every response here
            is simulated.
          </p>
          <label>
            Enquiry
            <select
              className="edit-input"
              value={caseId}
              onChange={(e) => {
                setCaseId(e.target.value);
                setAvailability(null);
                setKey(crypto.randomUUID());
              }}
            >
              <option value="">Choose an enquiry</option>
              {cases
                .filter((record) => !record.archived)
                .map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.title}
                  </option>
                ))}
            </select>
          </label>
          <div className="team-action-row">
            <button
              className="button subtle"
              disabled={!selected || desk.busy}
              onClick={async () => {
                const result = await run(
                  { type: "availability", caseId },
                  "Simulated availability checked.",
                );
                if (result) setAvailability(result.availability);
              }}
            >
              <CalendarDays size={14} /> Check simulated availability
            </button>
            <button
              className="button primary"
              disabled={!selected || desk.busy}
              onClick={() =>
                run(
                  {
                    type: "reserve",
                    caseId,
                    caseVersion: selected!.version,
                    key,
                  },
                  "Simulated reservation created. No real table has been reserved.",
                )
              }
            >
              Simulate reservation <Utensils size={14} />
            </button>
          </div>
          {availability && (
            <div className="simulation-result">
              <span className="simulation-pill">
                Simulated availability · {availability.date}
              </span>
              {availability.slots.length ? (
                <div className="availability-slots">
                  {availability.slots.map((slot) => (
                    <span key={slot.time}>{slot.time}</span>
                  ))}
                </div>
              ) : (
                <p>
                  No simulated tables available. Keep the original request and
                  review another time with the guest.
                </p>
              )}
            </div>
          )}
          <div className="reservation-list">
            {data.desk.reservations
              .filter((reservation) => reservation.caseId === caseId)
              .map((reservation) => (
                <article key={reservation.id}>
                  <span className="simulation-pill">
                    {reservation.status === "simulated_confirmed"
                      ? "Simulated confirmation"
                      : "Simulated cancellation"}
                  </span>
                  <h4>{providerNames[reservation.provider]}</h4>
                  <p>{reservation.reference}</p>
                  {reservation.status === "simulated_confirmed" && (
                    <button
                      className="text-button"
                      disabled={desk.busy}
                      onClick={async () => {
                        const result = await run(
                          {
                            type: "cancel_simulation",
                            reservationId: reservation.id,
                          },
                          "Simulation cancelled. The real enquiry is unchanged.",
                        );
                        if (result) setKey(crypto.randomUUID());
                      }}
                    >
                      Cancel simulation
                    </button>
                  )}
                </article>
              ))}
          </div>
        </div>
      </div>
      {notice && (
        <p className="dialog-success" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
