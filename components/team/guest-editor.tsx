"use client";
import { useState } from "react";
import { Dialog } from "@/components/workspace/dialog";
import { useConcurrentDraft } from "@/hooks/use-concurrent-draft";
import { EditConflict } from "./edit-conflict";
import type { Guest } from "@/lib/restaurant-desk";
import type { TeamCase } from "@/hooks/use-team";
import type { useRestaurantDesk } from "@/hooks/use-restaurant-desk";

export function GuestEditor({
  initial,
  cases,
  desk,
  onClose,
}: {
  initial: Guest;
  cases: TeamCase[];
  desk: ReturnType<typeof useRestaurantDesk>;
  onClose: () => void;
}) {
  const data = desk.data!;
  const existing = data.desk.guests.find((guest) => guest.id === initial.id);
  const [wasSaved] = useState(!!existing),
    [error, setError] = useState("");
  const {
    draft: guest,
    setDraft: setGuest,
    conflicts,
    resolve,
  } = useConcurrentDraft(existing || initial);
  const removed = wasSaved && !existing;
  const labels = {
    id: "Guest",
    name: "Name",
    contact: "Contact details",
    notes: "Notes",
    caseIds: "Linked enquiries",
    updatedAt: "Record date",
  };
  return (
    <Dialog
      title={wasSaved ? "Edit guest record" : "A guest to remember."}
      onClose={onClose}
    >
      <EditConflict
        fields={conflicts.map((key) => labels[key])}
        resolve={resolve}
      />
      {removed && (
        <p className="dialog-error" role="alert">
          This record was merged or removed by a teammate. Your details remain
          below so you can copy them before closing.
        </p>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (removed || conflicts.length) return;
          try {
            await desk.perform({ type: "guest", guest }, data.version);
            onClose();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Please retry.");
          }
        }}
      >
        <label>
          Guest name
          <input
            className="edit-input"
            required
            maxLength={100}
            value={guest.name}
            onChange={(event) =>
              setGuest({ ...guest, name: event.target.value })
            }
          />
        </label>
        <label>
          Contact details
          <input
            className="edit-input"
            maxLength={120}
            value={guest.contact}
            onChange={(event) =>
              setGuest({ ...guest, contact: event.target.value })
            }
          />
        </label>
        <label>
          Notes
          <textarea
            className="import-input"
            rows={3}
            maxLength={2000}
            value={guest.notes}
            onChange={(event) =>
              setGuest({ ...guest, notes: event.target.value })
            }
          />
        </label>
        <label>
          Link reviewed enquiries
          <select
            className="edit-input"
            multiple
            value={guest.caseIds}
            onChange={(event) =>
              setGuest({
                ...guest,
                caseIds: [...event.target.selectedOptions].map(
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
          Choose only enquiries you know belong to this guest. Linking an
          enquiry here removes it from any previous guest record.
        </p>
        {error && (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            className="button primary"
            disabled={desk.busy || removed || !!conflicts.length}
          >
            Save guest
          </button>
        </div>
      </form>
    </Dialog>
  );
}
