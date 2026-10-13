"use client";
import { useState } from "react";
import {
  Check,
  CalendarClock,
  MessageSquare,
  Link2,
  Copy,
  ShieldCheck,
} from "lucide-react";
import { Dialog } from "@/components/workspace/dialog";
import { emptyWorkflow } from "@/lib/restaurant-desk";
import type { TeamCase } from "@/hooks/use-team";
import type { useRestaurantDesk } from "@/hooks/use-restaurant-desk";
import { reviewedSession } from "@/lib/exports";

export function WorkflowDialog({
  record,
  desk,
  workspaceId,
  onClose,
}: {
  record: TeamCase;
  desk: ReturnType<typeof useRestaurantDesk>;
  workspaceId: string;
  onClose: () => void;
}) {
  const data = desk.data!;
  const [baseVersion, setBaseVersion] = useState(data.version),
    [flow, setFlow] = useState(
      data.desk.workflows[record.id] || emptyWorkflow(),
    ),
    [comment, setComment] = useState(""),
    [link, setLink] = useState(""),
    [expires, setExpires] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [working, setWorking] = useState(false);
  const localTime = (iso: string | null) => {
    if (!iso) return "";
    const date = new Date(iso);
    return new Date(date.valueOf() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  };
  const memberName = (id: string) =>
    data.members.find((member) => member.user_id === id)?.display_name ||
    `Teammate ${data.members.findIndex((member) => member.user_id === id) + 1}`;
  async function run(action: () => Promise<unknown>, message: string) {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please retry.");
    } finally {
      setWorking(false);
    }
  }
  return (
    <Dialog
      wide
      title={record.title}
      description="Give this enquiry an owner, a next step and a clear handoff."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            await desk.perform(
              { type: "workflow", caseId: record.id, workflow: flow },
              baseVersion,
            );
            onClose();
          }, "Workflow saved.");
        }}
      >
        <div className="team-field-grid">
          <label>
            Stage
            <select
              className="edit-input"
              value={flow.stage}
              onChange={(e) =>
                setFlow({ ...flow, stage: e.target.value as typeof flow.stage })
              }
            >
              <option value="needs_reply">Needs reply</option>
              <option value="under_review">Under review</option>
              <option value="handed_off">Handed off</option>
            </select>
          </label>
          <label>
            Priority
            <select
              className="edit-input"
              value={flow.priority}
              onChange={(e) =>
                setFlow({
                  ...flow,
                  priority: e.target.value as typeof flow.priority,
                })
              }
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <label>
            Owner
            <select
              className="edit-input"
              value={flow.assigneeId || ""}
              onChange={(e) =>
                setFlow({ ...flow, assigneeId: e.target.value || null })
              }
            >
              <option value="">Unassigned</option>
              {data.members.map((member, index) => (
                <option value={member.user_id} key={member.user_id}>
                  {member.display_name || `Teammate ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Guest record
            <select
              className="edit-input"
              value={flow.guestId || ""}
              onChange={(e) =>
                setFlow({ ...flow, guestId: e.target.value || null })
              }
            >
              <option value="">Keep separate</option>
              {data.desk.guests.map((guest) => (
                <option value={guest.id} key={guest.id}>
                  {guest.name}
                </option>
              ))}
            </select>
          </label>
          <label className="team-wide">
            Next step
            <input
              className="edit-input"
              value={flow.task}
              maxLength={200}
              placeholder="Confirm the seating request with the guest"
              onChange={(e) => setFlow({ ...flow, task: e.target.value })}
            />
          </label>
          <label>
            Due date and time
            <input
              className="edit-input"
              type="datetime-local"
              value={localTime(flow.dueAt)}
              onChange={(e) =>
                setFlow({
                  ...flow,
                  dueAt: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : null,
                })
              }
            />
          </label>
          <label>
            Escalate after
            <select
              className="edit-input"
              value={flow.escalationMinutes}
              onChange={(e) =>
                setFlow({ ...flow, escalationMinutes: Number(e.target.value) })
              }
            >
              {[15, 30, 60, 120, 240, 1440].map((value) => (
                <option key={value} value={value}>
                  {value < 60 ? `${value} minutes` : `${value / 60} hours`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="dialog-hint">
          <CalendarClock size={13} /> Times use your device’s time zone. Overdue
          tasks alert the assigned teammate; escalated tasks also reach owners
          and managers in the open desk.
        </p>
        <div className="dialog-actions">
          <button
            type="submit"
            className="button primary"
            disabled={working || desk.busy}
          >
            <Check size={15} /> Save workflow
          </button>
        </div>
      </form>
      <section className="team-dialog-section">
        <h3>
          <MessageSquare size={16} /> Team comments
        </h3>
        <div className="team-comment-list">
          {data.desk.comments
            .filter((item) => item.caseId === record.id)
            .map((item) => (
              <article key={item.id}>
                <strong>{memberName(item.authorId)}</strong>
                <time>{new Date(item.createdAt).toLocaleString("en-AU")}</time>
                <p>{item.text}</p>
              </article>
            ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const result = await desk.perform(
                { type: "comment", caseId: record.id, text: comment },
                baseVersion,
              );
              setBaseVersion(result.version);
              setComment("");
            }, "Comment added.");
          }}
        >
          <label className="sr-only" htmlFor="team-comment">
            Comment for the team
          </label>
          <textarea
            id="team-comment"
            className="import-input"
            value={comment}
            maxLength={1000}
            rows={2}
            placeholder="Leave a useful note for the next shift…"
            onChange={(e) => setComment(e.target.value)}
          />
          <button
            className="button subtle"
            disabled={!comment.trim() || working}
          >
            Add comment
          </button>
        </form>
      </section>
      <section className="team-dialog-section">
        <h3>
          <Link2 size={16} /> Guest review link
        </h3>
        <p>
          The guest can review the request and return changes to your desk. The
          link expires after 72 hours and becomes outdated when the saved
          enquiry changes.
        </p>
        {!reviewedSession(record.session) ? (
          <p className="dialog-hint">
            Open, approve and save the complete brief before creating a link.
          </p>
        ) : (
          <button
            className="button subtle"
            disabled={working}
            onClick={() =>
              run(async () => {
                const result = await desk.request("/api/restaurant/review", {
                  method: "POST",
                  body: JSON.stringify({
                    type: "create",
                    workspaceId,
                    caseId: record.id,
                    caseVersion: record.version,
                  }),
                });
                setLink(`${window.location.origin}/review#${result.token}`);
                setExpires(new Date(result.expiresAt).toLocaleString("en-AU"));
              }, "Private review link created. Share it with this guest.")
            }
          >
            Create private review link <ShieldCheck size={15} />
          </button>
        )}
        {link && (
          <div className="review-link-box">
            <input
              className="edit-input"
              readOnly
              aria-label="Private guest review link"
              value={link}
            />
            <div>
              <button
                className="button compact subtle"
                onClick={() =>
                  run(() => navigator.clipboard.writeText(link), "Link copied.")
                }
              >
                <Copy size={13} /> Copy link
              </button>
              <a
                className="button compact subtle"
                href={link}
                target="_blank"
                rel="noreferrer"
              >
                Open review
              </a>
            </div>
            <small>Expires {expires}</small>
          </div>
        )}
        <button
          className="text-button"
          disabled={working}
          onClick={() =>
            run(async () => {
              await desk.request("/api/restaurant/review", {
                method: "POST",
                body: JSON.stringify({
                  type: "revoke",
                  workspaceId,
                  caseId: record.id,
                }),
              });
              setLink("");
            }, "Review links revoked.")
          }
        >
          Revoke this enquiry’s review links
        </button>
      </section>
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
    </Dialog>
  );
}
