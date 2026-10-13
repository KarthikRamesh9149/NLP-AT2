"use client";
import { useState } from "react";
import { Heart, Plus, Search, GitMerge, ArrowUpRight } from "lucide-react";
import { Dialog } from "@/components/workspace/dialog";
import type { Guest } from "@/lib/restaurant-desk";
import type { TeamCase } from "@/hooks/use-team";
import type { useRestaurantDesk } from "@/hooks/use-restaurant-desk";

export function GuestBook({
  desk,
  cases,
  workspaceId,
}: {
  desk: ReturnType<typeof useRestaurantDesk>;
  cases: TeamCase[];
  workspaceId: string;
}) {
  const data = desk.data!,
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Guest | null>(null),
    [editing, setEditing] = useState<Guest | null>(null),
    [source, setSource] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [merging, setMerging] = useState(false),
    [baseVersion, setBaseVersion] = useState(data.version),
    [error, setError] = useState("");
  const guests = data.desk.guests.filter((guest) =>
    `${guest.name} ${guest.contact}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const current = selected
    ? data.desk.guests.find((guest) => guest.id === selected.id)
    : null;
  function edit(guest?: Guest) {
    setError("");
    setBaseVersion(data.version);
    setEditing(
      guest || {
        id: crypto.randomUUID(),
        name: "",
        contact: "",
        notes: "",
        caseIds: [],
        updatedAt: new Date().toISOString(),
      },
    );
  }
  async function save() {
    try {
      await desk.perform({ type: "guest", guest: editing }, baseVersion);
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please retry.");
    }
  }
  return (
    <section>
      <div className="team-section-heading">
        <div>
          <p className="team-overline">GUEST BOOK</p>
          <h2>Remember the little things.</h2>
          <p>Keep reviewed guest records and enquiry history together.</p>
        </div>
        <button className="button primary" onClick={() => edit()}>
          <Plus size={15} /> Add a guest
        </button>
      </div>
      <div className="team-search">
        <Search size={17} />
        <input
          aria-label="Search guests"
          placeholder="Find a guest by name or contact…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {!guests.length ? (
        <div className="team-empty">
          <Heart size={30} />
          <h3>A welcome worth remembering.</h3>
          <p>
            Add a guest or keep a reviewed enquiry in their record. Records stay
            private to your team.
          </p>
        </div>
      ) : (
        <div className="guest-book-grid">
          {guests.map((guest) => (
            <button
              className={`team-card guest-record ${selected?.id === guest.id ? "selected" : ""}`}
              onClick={() => setSelected(guest)}
              key={guest.id}
            >
              <span className="guest-monogram">
                {guest.name
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
              <h3>{guest.name}</h3>
              <p>{guest.contact || "No contact recorded"}</p>
              <small>
                {guest.caseIds.length}{" "}
                {guest.caseIds.length === 1 ? "enquiry" : "enquiries"}
              </small>
            </button>
          ))}
        </div>
      )}
      {current && (
        <div className="team-card guest-history">
          <div className="team-inline-heading">
            <h3>{current.name}</h3>
            <div className="team-action-row">
              <button className="button subtle" onClick={() => edit(current)}>
                Edit record
              </button>
              <button
                className="button subtle"
                disabled={data.desk.guests.length < 2}
                onClick={() => {
                  setSource("");
                  setConfirmed(false);
                  setMerging(true);
                  setBaseVersion(data.version);
                  setError("");
                }}
              >
                <GitMerge size={14} /> Merge records
              </button>
            </div>
          </div>
          {current.notes && <p className="preserve-lines">{current.notes}</p>}
          <h4>Enquiry history</h4>
          {cases
            .filter(
              (record) =>
                current.caseIds.includes(record.id) ||
                data.desk.workflows[record.id]?.guestId === current.id,
            )
            .map((record) => (
              <a
                className="guest-history-row"
                href={`/?case=${record.id}&workspace=${workspaceId}`}
                key={record.id}
              >
                <div>
                  <strong>{record.title}</strong>
                  <p>
                    {[
                      record.session.guestCare?.dietary,
                      record.session.guestCare?.seating,
                      record.session.guestCare?.occasion,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Open the reviewed conversation."}
                  </p>
                </div>
                <ArrowUpRight size={17} />
              </a>
            ))}
          <p className="dialog-hint">
            Recorded requests describe previous enquiries. Check preferences
            with the guest before using them again.
          </p>
        </div>
      )}
      {editing && (
        <Dialog
          title={
            data.desk.guests.some((guest) => guest.id === editing.id)
              ? "Edit guest record"
              : "A guest to remember."
          }
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label>
              Guest name
              <input
                className="edit-input"
                required
                maxLength={100}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </label>
            <label>
              Contact details
              <input
                className="edit-input"
                maxLength={120}
                value={editing.contact}
                onChange={(e) =>
                  setEditing({ ...editing, contact: e.target.value })
                }
              />
            </label>
            <label>
              Notes
              <textarea
                className="import-input"
                maxLength={2000}
                rows={3}
                value={editing.notes}
                onChange={(e) =>
                  setEditing({ ...editing, notes: e.target.value })
                }
              />
            </label>
            <label>
              Link reviewed enquiries
              <select
                className="edit-input"
                multiple
                value={editing.caseIds}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    caseIds: [...e.target.selectedOptions].map(
                      (option) => option.value,
                    ),
                  })
                }
              >
                {cases.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.title}
                  </option>
                ))}
              </select>
            </label>
            <p className="dialog-hint">
              Choose only enquiries you know belong to this guest.
            </p>
            {error && (
              <p className="dialog-error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <button className="button primary" disabled={desk.busy}>
                Save guest
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {merging && current && (
        <Dialog
          title="Bring two guest records together."
          description="Check the contact details and history. This change combines the records in your private workspace."
          onClose={() => setMerging(false)}
        >
          <label>
            Keep this record
            <input
              className="edit-input"
              readOnly
              value={`${current.name} · ${current.contact}`}
            />
          </label>
          <label>
            Combine with
            <select
              className="edit-input"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">Choose a record</option>
              {data.desk.guests
                .filter((guest) => guest.id !== current.id)
                .map((guest) => (
                  <option key={guest.id} value={guest.id}>
                    {guest.name} · {guest.contact || "No contact"}
                  </option>
                ))}
            </select>
          </label>
          <label className="team-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            I have checked that these records belong to the same guest.
          </label>
          {error && (
            <p className="dialog-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="button primary"
              disabled={!confirmed || !source || desk.busy}
              onClick={async () => {
                try {
                  await desk.perform(
                    {
                      type: "merge",
                      targetId: current.id,
                      sourceId: source,
                      confirmed,
                    },
                    baseVersion,
                  );
                  setMerging(false);
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : "Please retry.",
                  );
                }
              }}
            >
              Merge records
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
