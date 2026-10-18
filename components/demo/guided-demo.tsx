"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  Heart,
  Link2,
  LoaderCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Utensils,
} from "lucide-react";
import {
  DEMO_RUN_KEY,
  DEMO_STEPS,
  demoSuggestion,
  demoChanges,
  newDemoRun,
  readDemoRun,
  shouldFillSuggestion,
  type DemoRun,
} from "@/lib/guided-demo";
import {
  demoOperation,
  demoRequest,
  loadDemoCase,
  openDemoWorkspace,
  readDemoDesk,
  saveDemoCase,
} from "@/lib/demo-client";
import {
  FIELD_KEYS,
  approveBrief,
  applyManualEdit,
  clarificationFor,
  type FieldKey,
  type Message,
} from "@/lib/state";
import { briefSchema } from "@/lib/contracts";
import { analysisPayload, mergeAnalysisHistory } from "@/lib/draft-workflow";
import { CURRENT_ANALYSIS_VERSION } from "@/lib/session";
import { emptyGuestCare } from "@/lib/follow-up";
import {
  checkedCareSuggestions,
  emptyWorkflow,
  type CareSuggestion,
} from "@/lib/restaurant-desk";
import { reviewSnapshotSchema, type ReviewSnapshot } from "@/lib/guest-portal";
import { downloadFile, textExport } from "@/lib/exports";
import { fieldLabels } from "@/components/workspace/booking-card";
import { Dialog } from "@/components/workspace/dialog";
import styles from "./guided-demo.module.css";

const careLabels = {
  name: "Guest name",
  contact: "Contact",
  dietary: "Dietary request",
  seating: "Seating preference",
  occasion: "Occasion",
};

export function GuidedDemo() {
  const [run, setRun] = useState<DemoRun | null>(null);
  const [busy, setBusy] = useState("Opening your demo workspace");
  const [error, setError] = useState("");
  const [storageIssue, setStorageIssue] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<FieldKey | null>(null);
  const [care, setCare] = useState<CareSuggestion[] | null>(null);
  const [kept, setKept] = useState<number[]>([]);
  const [review, setReview] = useState<ReviewSnapshot | null>(null);
  const [consent, setConsent] = useState(false);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [restart, setRestart] = useState(false);
  const [editing, setEditing] = useState<{
    field: FieldKey;
    value: string;
  } | null>(null);
  const [editError, setEditError] = useState("");
  const [boot, setBoot] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const lock = useRef(false);
  const mounted = useRef(false);

  function keep(next: DemoRun) {
    if (!mounted.current) return;
    setRun(next);
    try {
      sessionStorage.setItem(DEMO_RUN_KEY, JSON.stringify(next));
      setStorageIssue(false);
    } catch {
      setStorageIssue(true);
    }
  }

  useEffect(() => {
    mounted.current = true;
    let active = true;
    setBusy("Opening your demo workspace");
    setError("");
    void (async () => {
      const opened = await openDemoWorkspace();
      if (!active) return;
      let saved: DemoRun | null = null;
      try {
        saved = readDemoRun(sessionStorage.getItem(DEMO_RUN_KEY));
      } catch {
        setStorageIssue(true);
      }
      let next =
        saved &&
        saved.userId === opened.userId &&
        saved.workspaceId === opened.workspaceId
          ? saved
          : newDemoRun(opened.userId, opened.workspaceId, opened.desk.slug);
      if (next.caseId) next = { ...next, ...(await loadDemoCase(next)) };
      if (!active) return;
      keep(next);
      if (next.step === 6 && next.reviewToken) {
        try {
          const result = await demoRequest<{ snapshot: unknown }>(
            "/api/restaurant/review",
            { type: "view", token: next.reviewToken },
          );
          if (active) setReview(reviewSnapshotSchema.parse(result.snapshot));
        } catch {
          if (active) keep({ ...next, reviewToken: null });
        }
      }
    })()
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "The demo could not open. Please retry.",
          );
      })
      .finally(() => {
        if (active) setBusy("");
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [boot]); // Reconnect explicitly after an opening error.

  useEffect(() => {
    if (run && !busy) {
      if ([0, 1, 2, 3, 5].includes(run.step))
        input.current?.focus({ preventScroll: true });
      else heading.current?.focus({ preventScroll: true });
    }
  }, [run?.step, Boolean(busy)]);

  const changes = run
    ? demoChanges(run.session.brief, run.session.messages)
    : [];
  const step = run ? DEMO_STEPS[run.step] : undefined;
  const suggestion = run ? demoSuggestion(run) : "";
  const complete = run?.step === DEMO_STEPS.length;
  const brief = run?.session.brief;
  const resolved = brief
    ? FIELD_KEYS.filter(
        (key) =>
          brief.fields[key].status === "resolved" && !brief.fields[key].review,
      ).length
    : 0;

  function fill() {
    if (!run || busy) return;
    keep({ ...run, draft: suggestion });
    input.current?.focus();
  }

  async function perform() {
    if (!run || lock.current || complete) return;
    lock.current = true;
    setError("");
    setNotice("");
    setBusy(
      run.step <= 3
        ? "Reading the conversation and checking the details"
        : "Saving this step",
    );
    try {
      let next = run;
      if (next.caseId) next = { ...next, ...(await loadDemoCase(next)) };
      if (next.step === 0) {
        if (!next.draft.trim())
          throw new Error(
            "Fill the suggested message or write your own first.",
          );
        const messages: Message[] = [
          {
            id: `demo_${next.id.slice(0, 8)}_0`,
            speaker: "customer",
            text: next.draft.trim(),
          },
        ];
        // Reuse the event ID on retries, including a response lost after submission.
        let desk = await readDemoDesk(next.workspaceId);
        let event = desk.desk.inbox.find(
          (item) => item.id === `website:${next.id}`,
        );
        if (!event) {
          await demoRequest("/api/restaurant/guest", {
            type: "submit",
            slug: next.slug,
            messages,
            guestCare: {
              ...emptyGuestCare(),
              name: "Alex Morgan",
              contact: "alex@example.test",
            },
            consent: true,
            id: next.id,
          });
          desk = await readDemoDesk(next.workspaceId);
          event = desk.desk.inbox.find(
            (item) => item.id === `website:${next.id}`,
          );
        }
        if (!event?.caseId)
          throw new Error(
            "The enquiry was sent, but the inbox has not returned it yet. Retry to reopen it.",
          );
        next = { ...next, caseId: event.caseId };
        next = { ...next, ...(await loadDemoCase(next)) };
        setNotice(
          "Alex’s enquiry has arrived in the team inbox. The brief below was extracted from the message.",
        );
      } else if (next.step <= 3) {
        if (!next.draft.trim())
          throw new Error(
            "Fill the suggested message or write your own first.",
          );
        const message: Message = {
          id: `demo_${next.id.slice(0, 8)}_${next.step}`,
          speaker: next.step === 2 ? "staff" : "customer",
          text: next.draft.trim(),
        };
        const messages = next.session.messages.some(
          (item) => item.id === message.id,
        )
          ? next.session.messages
          : [...next.session.messages, message];
        const result = await demoRequest<{ brief: unknown }>(
          "/api/analyze",
          analysisPayload(
            messages,
            next.session.brief,
            next.session.referenceDate || next.referenceDate,
          ),
        );
        const extracted = briefSchema.parse(result.brief);
        next = {
          ...next,
          ...(await saveDemoCase(next, {
            ...next.session,
            messages,
            brief: mergeAnalysisHistory(next.session.brief, extracted),
            pendingAnalysis: false,
            analysisVersion: CURRENT_ANALYSIS_VERSION,
          })),
        };
        setSelected("time");
        setNotice(
          next.step === 1
            ? "The correction is saved. Inspect Guests and Time to see what changed."
            : next.step === 2
              ? "The staff reply is saved. The guest still needs to accept the offer."
              : "Alex’s answer is saved. Open Time to show its supporting messages.",
        );
      } else if (next.step === 4) {
        if (care === null) {
          setBusy("Finding guest requests and their quotations");
          const result = await demoRequest<{ suggestions: unknown[] }>(
            "/api/restaurant/care",
            { messages: next.session.messages },
          );
          setCare(
            checkedCareSuggestions(result.suggestions, next.session.messages),
          );
          setKept([]);
          return;
        }
        const accepted = care.filter((_, index) => kept.includes(index));
        const guestCare = { ...emptyGuestCare(), ...next.session.guestCare };
        for (const item of accepted) guestCare[item.field] = item.value;
        next = {
          ...next,
          ...(await saveDemoCase(next, {
            ...next.session,
            guestCare,
            guestCareEvidence: accepted,
          })),
        };
        setNotice(
          `${accepted.length} reviewed guest request${accepted.length === 1 ? "" : "s"} saved with the enquiry.`,
        );
      } else if (next.step === 5) {
        if (!next.draft.trim()) throw new Error("Add the handoff note first.");
        const session = {
          ...next.session,
          notes: next.draft.trim(),
          brief: approveBrief(next.session.brief),
        };
        next = { ...next, ...(await saveDemoCase(next, session)) };
        const dueAt = new Date(Date.now() + 60 * 60_000).toISOString();
        await demoOperation(next.workspaceId, {
          type: "workflow",
          caseId: next.caseId,
          workflow: {
            ...emptyWorkflow(),
            stage: "under_review",
            priority: "high",
            assigneeId: next.userId,
            dueAt,
            task: "Check the guest review and prepare the reservation handoff.",
          },
        });
        setNotice(
          "Brief approved and saved. You own the enquiry, with high priority and a follow-up due in one hour.",
        );
      } else if (next.step === 6) {
        if (!next.reviewToken || !review) {
          const created = await demoRequest<{ token: string }>(
            "/api/restaurant/review",
            {
              type: "create",
              workspaceId: next.workspaceId,
              caseId: next.caseId,
              caseVersion: next.caseVersion,
            },
            true,
          );
          next = { ...next, reviewToken: created.token };
          keep(next);
          const viewed = await demoRequest<{ snapshot: unknown }>(
            "/api/restaurant/review",
            { type: "view", token: created.token },
          );
          setReview(reviewSnapshotSchema.parse(viewed.snapshot));
          return;
        }
        if (!consent)
          throw new Error("Check the review confirmation before sending.");
        await demoRequest("/api/restaurant/review", {
          type: "submit",
          token: next.reviewToken,
          changes: {
            date: review.date,
            time: review.time,
            partySize: review.partySize,
            dietary: review.guestCare.dietary,
            seating: review.guestCare.seating,
            occasion: review.guestCare.occasion,
            message: "",
            consent: true,
          },
        });
        next = { ...next, reviewConfirmed: true };
        setNotice(
          "Alex’s review has returned to the team inbox. The request is ready for a reservation handoff.",
        );
      } else if (next.step === 7) {
        if (slots === null) {
          const result = await demoOperation<{
            availability: { slots: { time: string; available: boolean }[] };
          }>(next.workspaceId, { type: "availability", caseId: next.caseId });
          setSlots(
            result.availability.slots
              .filter((slot) => slot.available)
              .map((slot) => slot.time),
          );
          return;
        }
        const result = await demoOperation(next.workspaceId, {
          type: "reserve",
          caseId: next.caseId,
          caseVersion: next.caseVersion,
          key: next.id,
        });
        const reservation = result.desk.reservations.find(
          (item) =>
            item.caseId === next.caseId && item.idempotencyKey === next.id,
        );
        if (!reservation)
          throw new Error(
            "The simulated handoff did not return a reference. Please retry.",
          );
        const workflow = result.desk.workflows[next.caseId!];
        await demoOperation(next.workspaceId, {
          type: "workflow",
          caseId: next.caseId,
          workflow: { ...workflow, stage: "handed_off", dueAt: null, task: "" },
        });
        next = { ...next, reservation: reservation.reference };
        setNotice(
          "The simulated provider reference is saved and the enquiry is marked Handed off.",
        );
      }
      keep({ ...next, step: next.step + 1, draft: "" });
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "This step could not finish. Please retry.",
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy("");
    }
  }

  async function saveEdit() {
    if (!run || !editing || lock.current) return;
    lock.current = true;
    setBusy("Saving your reviewed detail");
    setEditError("");
    try {
      const current = { ...run, ...(await loadDemoCase(run)) };
      const session = {
        ...current.session,
        brief: applyManualEdit(
          current.session.brief,
          editing.field,
          editing.value,
        ),
      };
      keep({ ...current, ...(await saveDemoCase(current, session)) });
      setEditing(null);
      setError("");
      setNotice(
        "Your staff correction has been saved. Approval will use these reviewed details.",
      );
    } catch (cause) {
      setEditError(
        cause instanceof Error
          ? cause.message
          : "The correction could not be saved. Please retry.",
      );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy("");
    }
  }

  function startAgain() {
    if (!run || busy) return;
    keep(newDemoRun(run.userId, run.workspaceId, run.slug));
    setCare(null);
    setKept([]);
    setReview(null);
    setConsent(false);
    setSlots(null);
    setSelected(null);
    setError("");
    setNotice("");
    setRestart(false);
  }

  const actionLabel =
    run?.step === 4 && care !== null
      ? `Save ${kept.length ? `${kept.length} selected request${kept.length > 1 ? "s" : ""}` : "without extra requests"}`
      : run?.step === 6 && review && run.reviewToken
        ? "Confirm as Alex"
        : run?.step === 7 && slots !== null
          ? "Complete simulated handoff"
          : step?.action;
  const actionDisabled =
    Boolean(busy) ||
    Boolean(suggestion && !run?.draft.trim()) ||
    (run?.step === 6 && Boolean(review) && !consent) ||
    (run?.step === 7 && slots?.length === 0);

  return (
    <div className={styles.page}>
      <a href="#demo-heading" className="skip-link">
        Skip to guided demo
      </a>
      <header className={styles.header}>
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          FormBridge
        </a>
        <span className={styles.tourLabel}>
          <Play size={12} fill="currentColor" /> Guided demo
        </span>
        <a className={styles.exit} href="/">
          Exit to booking desk <ArrowUpRight size={15} />
        </a>
      </header>
      <main className={styles.main}>
        <div className={styles.intro}>
          <div>
            <p className={styles.eyebrow}>JUNIPER HOUSE · SYDNEY</p>
            <h1>
              A birthday, <em>beautifully handled.</em>
            </h1>
            <p>One guest. A few changed plans. A thoughtful handoff.</p>
          </div>
          <div className={styles.tourMeta}>
            <span>
              <span className={styles.liveDot} /> Live analysis
            </span>
            <span>Fictional guest · about 5 minutes</span>
          </div>
        </div>
        <nav aria-label="Demo progress" className={styles.progress}>
          <ol>
            {DEMO_STEPS.map((item, i) => (
              <li
                key={item.short}
                className={`${run && run.step > i ? styles.done : ""} ${run?.step === i ? styles.current : ""}`}
                aria-current={run?.step === i ? "step" : undefined}
              >
                <span>
                  {run && run.step > i ? (
                    <Check size={14} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <strong>{item.short}</strong>
              </li>
            ))}
          </ol>
        </nav>
        {storageIssue && (
          <p className={styles.warning} role="status">
            Your browser cannot keep progress after a refresh. Keep this tab
            open while presenting.
          </p>
        )}
        {error && (
          <div className={styles.error} role="alert">
            <strong>This step needs another try.</strong>
            <p>{error}</p>
            <button
              className="button compact subtle"
              onClick={() =>
                run ? void perform() : setBoot((value) => value + 1)
              }
              disabled={Boolean(busy)}
            >
              <RotateCcw size={14} /> Retry
            </button>
          </div>
        )}
        {!run ? (
          <section className={styles.loading} aria-live="polite">
            <Utensils size={30} />
            <h2>Your table is almost ready.</h2>
            <p>{busy || "Reconnect to open the guided demo."}</p>
            {busy && <LoaderCircle className="spin" size={20} />}
            <p className={styles.small}>
              A separate demo workspace keeps your existing enquiries untouched.
            </p>
          </section>
        ) : (
          <>
            {notice && (
              <div className={styles.notice} role="status">
                <Check size={17} />
                <span>{notice}</span>
              </div>
            )}
            <div className={styles.grid}>
              <div className={styles.story}>
                {complete ? (
                  <section className={`${styles.card} ${styles.finish}`}>
                    <span className={styles.finishIcon}>
                      <Check size={30} />
                    </span>
                    <p className={styles.eyebrow}>
                      FROM FIRST HELLO TO HANDOFF
                    </p>
                    <h2 ref={heading} tabIndex={-1} id="demo-heading">
                      Every detail has a place.
                    </h2>
                    <p>
                      You’ve followed a guest enquiry through changing plans,
                      staff review and a simulated reservation handoff.
                    </p>
                    <dl className={styles.receipt}>
                      <div>
                        <dt>Guest</dt>
                        <dd>Alex Morgan</dd>
                      </div>
                      <div>
                        <dt>Team status</dt>
                        <dd>Handed off</dd>
                      </div>
                      <div>
                        <dt>Guest review</dt>
                        <dd>Received</dd>
                      </div>
                      <div>
                        <dt>Simulation reference</dt>
                        <dd>{run.reservation}</dd>
                      </div>
                    </dl>
                    <p className={styles.small}>
                      The enquiry and review were saved. The reservation
                      connector is simulated; no table was reserved.
                    </p>
                    <div className={styles.finishActions}>
                      <button
                        className="button primary"
                        onClick={() =>
                          downloadFile(
                            textExport(
                              run.session,
                              "Alex Morgan · Birthday dinner",
                              run.session.notes,
                            ),
                            "FormBridge-birthday-brief.txt",
                            "text/plain",
                          )
                        }
                      >
                        <Download size={16} /> Download the brief
                      </button>
                      <button
                        className="button subtle"
                        onClick={() => setRestart(true)}
                      >
                        <RotateCcw size={15} /> Run the tour again
                      </button>
                    </div>
                    <a href="/" className={styles.textLink}>
                      Try your own enquiry <ArrowRight size={15} />
                    </a>
                  </section>
                ) : (
                  <section className={styles.card} aria-busy={Boolean(busy)}>
                    <div className={styles.stepMeta}>
                      <span>
                        CHAPTER {String(run.step + 1).padStart(2, "0")} / 08
                      </span>
                      <span className={styles.role}>
                        {step!.role === "Guest"
                          ? "You’re Alex · Guest"
                          : "You’re the host · Staff"}
                      </span>
                    </div>
                    <h2 ref={heading} tabIndex={-1} id="demo-heading">
                      {step!.title}
                    </h2>
                    <p className={styles.description}>{step!.detail}</p>
                    {suggestion && (
                      <div className={styles.composer}>
                        <label htmlFor="demo-message">
                          {run.step === 5 ? "Handoff note" : "Your message"}
                        </label>
                        <textarea
                          ref={input}
                          id="demo-message"
                          rows={run.step === 0 ? 5 : 3}
                          maxLength={1000}
                          value={run.draft}
                          disabled={Boolean(busy)}
                          placeholder={suggestion}
                          aria-describedby="demo-fill-hint"
                          onChange={(event) =>
                            keep({ ...run, draft: event.target.value })
                          }
                          onKeyDown={(event) => {
                            if (
                              shouldFillSuggestion(
                                {
                                  ...event,
                                  isComposing: event.nativeEvent.isComposing,
                                },
                                run.draft,
                              )
                            ) {
                              event.preventDefault();
                              fill();
                            } else if (
                              event.key === "Enter" &&
                              (event.metaKey || event.ctrlKey) &&
                              !event.nativeEvent.isComposing
                            ) {
                              event.preventDefault();
                              void perform();
                            }
                          }}
                        />
                        <div className={styles.fillBar}>
                          <span id="demo-fill-hint">
                            {!run.draft ? (
                              <>
                                <kbd>Tab</kbd> to fill this suggestion
                              </>
                            ) : (
                              <>
                                <kbd>⌘ / Ctrl</kbd> + <kbd>Enter</kbd> to send
                              </>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={fill}
                            disabled={Boolean(busy)}
                          >
                            {run.draft
                              ? "Restore suggestion"
                              : "Fill suggestion"}{" "}
                            <ArrowDownIcon />
                          </button>
                        </div>
                      </div>
                    )}
                    {run.step === 0 && (
                      <p className={styles.small}>
                        This fictional enquiry uses Alex Morgan and
                        alex@example.test. Sending it saves it to your separate
                        demo inbox.
                      </p>
                    )}
                    {run.step === 4 && care !== null && (
                      <div className={styles.careList}>
                        {care.length ? (
                          care.map((item, i) => (
                            <label
                              key={`${item.field}-${i}`}
                              className={styles.careItem}
                            >
                              <input
                                type="checkbox"
                                checked={kept.includes(i)}
                                disabled={Boolean(busy)}
                                onChange={() =>
                                  setKept((old) =>
                                    old.includes(i)
                                      ? old.filter((n) => n !== i)
                                      : [...old, i],
                                  )
                                }
                              />
                              <span>
                                <small>{careLabels[item.field]}</small>
                                <strong>{item.value}</strong>
                                <q>{item.quote}</q>
                              </span>
                            </label>
                          ))
                        ) : (
                          <p>
                            No supported requests were found. You can continue
                            without adding any.
                          </p>
                        )}
                      </div>
                    )}
                    {run.step === 5 && (
                      <div className={styles.assignment}>
                        <span className={styles.avatar}>JH</span>
                        <div>
                          <strong>Demo host · You</strong>
                          <small>High priority · Follow-up in one hour</small>
                        </div>
                        <ShieldCheck size={20} />
                      </div>
                    )}
                    {run.step === 6 && review && run.reviewToken && (
                      <div className={styles.review}>
                        <p className={styles.eyebrow}>ALEX’S PRIVATE REVIEW</p>
                        <h3>{review.restaurantName}</h3>
                        <p>
                          {review.date} · {review.time} · {review.partySize}{" "}
                          guests
                        </p>
                        {Object.entries(review.guestCare)
                          .filter(([key, value]) => key !== "name" && value)
                          .map(([key, value]) => (
                            <div key={key} className={styles.preference}>
                              <span>
                                {careLabels[key as keyof typeof careLabels]}
                              </span>
                              <strong>{value}</strong>
                            </div>
                          ))}
                        <a
                          className={styles.textLink}
                          href={`/review#${run.reviewToken}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open the actual guest page <ArrowUpRight size={14} />
                        </a>
                        <label className={styles.consent}>
                          <input
                            type="checkbox"
                            checked={consent}
                            onChange={(event) =>
                              setConsent(event.target.checked)
                            }
                            disabled={Boolean(busy)}
                          />
                          <span>
                            As Alex, I’ve checked these details. I understand
                            this is a request, not a confirmed restaurant
                            reservation.
                          </span>
                        </label>
                      </div>
                    )}
                    {run.step === 7 && (
                      <div className={styles.provider}>
                        <div>
                          <strong>OpenTable</strong>
                          <span>Simulated connector</span>
                        </div>
                        {slots !== null && (
                          <>
                            <p>Available demonstration times</p>
                            <div className={styles.slots}>
                              {slots.map((slot) => (
                                <span key={slot}>{slot}</span>
                              ))}
                            </div>
                            {!slots.length && (
                              <p>
                                No times were returned. Your reviewed enquiry is
                                kept.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    <div className={styles.actionRow}>
                      <button
                        className="button primary"
                        disabled={actionDisabled}
                        onClick={() => void perform()}
                      >
                        {busy ? (
                          <LoaderCircle className="spin" size={16} />
                        ) : (
                          <ArrowRight size={16} />
                        )}
                        {busy ? "Working on it…" : actionLabel}
                      </button>
                      <span>
                        {run.step === 7
                          ? "No real reservation is made"
                          : "Your progress is saved"}
                      </span>
                    </div>
                    <div className={styles.presenter}>
                      <span>WHAT TO SHOW</span>
                      <p>{step!.point}</p>
                    </div>
                    {busy && (
                      <p className={styles.busy} role="status">
                        {busy}…
                      </p>
                    )}
                  </section>
                )}
                <section
                  className={`${styles.card} ${styles.transcript}`}
                  aria-label="Enquiry conversation"
                >
                  <div className={styles.sectionHeading}>
                    <h3>The conversation</h3>
                    <span>{run.session.messages.length} messages</span>
                  </div>
                  {!run.session.messages.length ? (
                    <div className={styles.emptyConversation}>
                      <span>“A table for four, please.”</span>
                      <p>The story starts with your first message.</p>
                    </div>
                  ) : (
                    run.session.messages.map((message, i) => (
                      <article
                        key={message.id}
                        id={`demo-${message.id}`}
                        className={`${styles.message} ${message.speaker === "staff" ? styles.staff : ""}`}
                        tabIndex={-1}
                      >
                        <span className={styles.avatar}>
                          {message.speaker === "staff" ? "JH" : "AM"}
                        </span>
                        <div>
                          <div className={styles.messageMeta}>
                            <strong>
                              {message.speaker === "staff"
                                ? "Juniper House"
                                : "Alex Morgan"}
                            </strong>
                            <small>{String(i + 1).padStart(2, "0")}</small>
                          </div>
                          <p>{message.text}</p>
                        </div>
                      </article>
                    ))
                  )}
                </section>
              </div>
              <aside className={styles.summary}>
                <section className={`${styles.card} ${styles.brief}`}>
                  <div className={styles.briefHead}>
                    <span>
                      <Utensils size={20} />
                    </span>
                    <div>
                      <p>THE BOOKING BRIEF</p>
                      <h3>
                        {brief?.fields.restaurantName.value ||
                          "A place at Juniper House"}
                      </h3>
                    </div>
                  </div>
                  <div className={styles.completeness}>
                    <strong>
                      {brief?.approvedRevision === brief?.revision
                        ? "Reviewed by staff"
                        : `${resolved} of 5 details ready`}
                    </strong>
                    <span>
                      {FIELD_KEYS.map((key) => (
                        <i
                          key={key}
                          className={
                            brief?.fields[key].status === "resolved" &&
                            !brief?.fields[key].review
                              ? styles.readyDot
                              : ""
                          }
                        />
                      ))}
                    </span>
                  </div>
                  {FIELD_KEYS.map((key) => {
                    const field = run.session.brief.fields[key];
                    return (
                      <div className={styles.field} key={key}>
                        <button
                          onClick={() =>
                            setSelected(selected === key ? null : key)
                          }
                          aria-expanded={selected === key}
                          aria-controls={`demo-source-${key}`}
                        >
                          <span>
                            <small>{fieldLabels[key]}</small>
                            <strong>
                              {field.value ||
                                field.constraint ||
                                "Waiting for a detail"}
                            </strong>
                            {field.constraint && field.value && (
                              <small>{field.constraint}</small>
                            )}
                          </span>
                          <span
                            className={
                              field.status === "resolved" && !field.review
                                ? styles.fieldReady
                                : styles.fieldPending
                            }
                          >
                            {field.review ? (
                              "Review"
                            ) : field.status === "resolved" ? (
                              <Check size={14} />
                            ) : field.status === "missing" ? (
                              "Needed"
                            ) : (
                              "Ask guest"
                            )}
                            <ChevronDown size={13} />
                          </span>
                        </button>
                        {selected === key && (
                          <div
                            id={`demo-source-${key}`}
                            className={styles.sources}
                          >
                            {field.evidenceIds.length ? (
                              field.evidenceIds.map((id) => {
                                const message = run.session.messages.find(
                                  (item) => item.id === id,
                                );
                                return (
                                  <button
                                    key={id}
                                    onClick={() => {
                                      document
                                        .getElementById(`demo-${id}`)
                                        ?.scrollIntoView({
                                          behavior: matchMedia(
                                            "(prefers-reduced-motion: reduce)",
                                          ).matches
                                            ? "instant"
                                            : "smooth",
                                          block: "center",
                                        });
                                      document
                                        .getElementById(`demo-${id}`)
                                        ?.focus({ preventScroll: true });
                                    }}
                                  >
                                    <Link2 size={12} />
                                    <q>
                                      {message?.text || "Source unavailable"}
                                    </q>
                                  </button>
                                );
                              })
                            ) : (
                              <p>
                                {field.source === "staff"
                                  ? field.note || "Reviewed by staff."
                                  : "A supporting message will appear here."}
                              </p>
                            )}
                            {run.step > 0 && run.step < 6 && (
                              <button
                                className={styles.editDetail}
                                disabled={Boolean(busy)}
                                onClick={() => {
                                  setEditError("");
                                  setEditing({
                                    field: key,
                                    value: field.value || "",
                                  });
                                }}
                              >
                                Correct this detail
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <p className={styles.briefHint}>
                    <Link2 size={12} /> Open any detail to see where it came
                    from.
                  </p>
                  {clarificationFor(run.session.brief) &&
                    run.session.messages.length > 0 && (
                      <div className={styles.question}>
                        <strong>One detail to clarify</strong>
                        <p>{clarificationFor(run.session.brief)}</p>
                      </div>
                    )}
                  {run.session.guestCare &&
                    Object.values(run.session.guestCare).some(Boolean) && (
                      <div className={styles.keptCare}>
                        <h4>
                          <Heart size={14} /> Guest care
                        </h4>
                        {Object.entries(run.session.guestCare)
                          .filter(([key, value]) => value && key !== "contact")
                          .map(([key, value]) => (
                            <p key={key}>
                              <span>
                                {careLabels[key as keyof typeof careLabels]}
                              </span>
                              <strong>{value}</strong>
                            </p>
                          ))}
                      </div>
                    )}
                  <div className={styles.briefFooter}>
                    <ShieldCheck size={15} />
                    <span>
                      A reviewed brief. A human decides what happens next.
                    </span>
                  </div>
                </section>
                {changes.length > 0 && (
                  <section className={`${styles.card} ${styles.history}`}>
                    <h3>What changed</h3>
                    {changes.map((change, i) => (
                      <div key={`${change.revision}-${change.field}-${i}`}>
                        <span>{fieldLabels[change.field]}</span>
                        <p>
                          {change.previousValue && (
                            <del>{change.previousValue}</del>
                          )}{" "}
                          <ArrowRight size={12} />{" "}
                          <strong>
                            {change.nextValue || "Needs clarification"}
                          </strong>
                        </p>
                      </div>
                    ))}
                  </section>
                )}
              </aside>
            </div>
            <footer className={styles.footer}>
              <span>
                Sample guest · Separate demo workspace · Real analysis and saved
                updates
              </span>
              <button onClick={() => setRestart(true)} disabled={Boolean(busy)}>
                <RotateCcw size={13} /> Restart tour
              </button>
            </footer>
          </>
        )}
      </main>
      {editing && (
        <Dialog
          title={`Review ${fieldLabels[editing.field].toLowerCase()}`}
          description="Check this detail against the conversation. A staff correction replaces the extracted value and is labelled as reviewed by staff."
          onClose={() => {
            if (!busy) setEditing(null);
          }}
        >
          <label className={styles.editLabel} htmlFor="demo-edit">
            {fieldLabels[editing.field]}
          </label>
          <input
            className={styles.editInput}
            id="demo-edit"
            value={editing.value}
            maxLength={120}
            disabled={Boolean(busy)}
            onChange={(event) =>
              setEditing({ ...editing, value: event.target.value })
            }
          />
          {editError && (
            <p role="alert" className={styles.error}>
              {editError}
            </p>
          )}
          <div className={styles.finishActions}>
            <button
              className="button primary"
              onClick={() => void saveEdit()}
              disabled={Boolean(busy) || !editing.value.trim()}
            >
              Save correction
            </button>
            <button
              className="button subtle"
              onClick={() => setEditing(null)}
              disabled={Boolean(busy)}
            >
              Cancel
            </button>
          </div>
        </Dialog>
      )}
      {restart && (
        <Dialog
          title="Start a fresh birthday story?"
          description="This starts a new demo enquiry. Your existing work stays untouched."
          onClose={() => setRestart(false)}
        >
          <div className={styles.finishActions}>
            <button className="button primary" onClick={startAgain}>
              Start fresh
            </button>
            <button className="button subtle" onClick={() => setRestart(false)}>
              Keep this tour
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function ArrowDownIcon() {
  return <span aria-hidden="true">↵</span>;
}
