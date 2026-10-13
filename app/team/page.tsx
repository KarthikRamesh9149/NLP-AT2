"use client";
import { useEffect, useRef, useState } from "react";
import { RequestScope } from "@/lib/request-scope";
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  ChevronRight,
  Heart,
  Inbox,
  LayoutDashboard,
  LoaderCircle,
  Mail,
  MessageCircle,
  MessageSquare,
  Plug,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Users,
  Utensils,
  Globe,
  CalendarClock,
} from "lucide-react";
import { useTeam, type TeamCase } from "@/hooks/use-team";
import { useRestaurantDesk } from "@/hooks/use-restaurant-desk";
import {
  reminderAlerts,
  emptyWorkflow,
  canManage,
  type StaffRole,
} from "@/lib/restaurant-desk";
import { reviewedSession } from "@/lib/exports";
import { FIELD_KEYS } from "@/lib/state";
import { fieldLabels } from "@/components/workspace/booking-card";
import { TeamDialog } from "@/components/workspace/team-dialog";
import { WorkflowDialog } from "@/components/team/workflow-dialog";
import { RestaurantLibrary } from "@/components/team/restaurant-library";
import { GuestBook } from "@/components/team/guest-book";
import { Connections } from "@/components/team/connections";

type Tab =
  | "overview"
  | "inbox"
  | "guests"
  | "restaurant"
  | "people"
  | "connections";
const tabs = [
  { id: "overview", label: "Today at the desk", icon: LayoutDashboard },
  { id: "inbox", label: "Enquiry inbox", icon: Inbox },
  { id: "guests", label: "Guest book", icon: Heart },
  { id: "restaurant", label: "Restaurant library", icon: BookOpen },
  { id: "people", label: "Your team", icon: Users },
  { id: "connections", label: "Connections", icon: Plug },
] as const;
const stageLabels = {
  needs_reply: "Needs reply",
  under_review: "Under review",
  handed_off: "Handed off",
};
const channelIcons = {
  email: Mail,
  whatsapp: MessageCircle,
  website: Globe,
  guest_review: Check,
};
export default function TeamDesk() {
  const team = useTeam(),
    desk = useRestaurantDesk(team),
    [tab, setTab] = useState<Tab>("overview"),
    [account, setAccount] = useState(false),
    [selectedId, setSelectedId] = useState(""),
    [workflowCase, setWorkflowCase] = useState<TeamCase | null>(null),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [reply, setReply] = useState(""),
    [notice, setNotice] = useState(""),
    [displayName, setDisplayName] = useState(""),
    [clock, setClock] = useState(() => new Date().toISOString()),
    [replyBusy, setReplyBusy] = useState(false),
    [replyKey, setReplyKey] = useState(() => crypto.randomUUID());
  const replyScope = useRef(new RequestScope()),
    draftAbort = useRef<AbortController | null>(null);
  const replyContext = `${team.user?.id || ""}:${team.workspaceId}:${selectedId}`;
  replyScope.current.select(replyContext);
  useEffect(() => {
    setReplyBusy(false);
    setNotice("");
    return () => {
      draftAbort.current?.abort();
    };
  }, [replyContext]);
  const data = desk.data,
    selected = team.cases.find((record) => record.id === selectedId),
    memberName = (id: string | null) =>
      !id
        ? "Unassigned"
        : data?.members.find((member) => member.user_id === id)?.display_name ||
          `Teammate ${(data?.members.findIndex((member) => member.user_id === id) ?? 0) + 1}`;
  const alerts =
    data && team.user
      ? reminderAlerts(data.desk, team.user.id, data.role, clock).filter(
          (alert) =>
            team.cases.some(
              (record) => record.id === alert.caseId && !record.archived,
            ),
        )
      : [];
  const active = team.cases.filter((record) => !record.archived),
    unread = data?.desk.inbox.filter((item) => !item.read).length || 0;
  useEffect(() => {
    const interval = setInterval(
      () => setClock(new Date().toISOString()),
      15_000,
    );
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && !desk.busy)
        team.refreshCases().catch(() => {});
    }, 20_000);
    return () => clearInterval(interval);
  }, [team.refreshCases, desk.busy]);
  async function run(action: () => Promise<unknown>, message: string) {
    setNotice("");
    try {
      await action();
      setNotice(message);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Please retry.");
    }
  }
  function open(record: TeamCase) {
    replyScope.current.begin();
    draftAbort.current?.abort();
    setReplyBusy(false);
    setSelectedId(record.id);
    setReply("");
    setReplyKey(crypto.randomUUID());
    setTab("inbox");
  }
  useEffect(() => {
    setWorkflowCase(null);
    setSelectedId("");
    setReply("");
  }, [team.workspaceId, team.user?.id]);
  const filtered = active.filter(
    (record) =>
      (filter === "all" ||
        (data?.desk.workflows[record.id]?.stage || "needs_reply") === filter) &&
      `${record.title} ${record.session.guestCare?.name || ""} ${record.session.guestCare?.contact || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const selectedInbox =
    data?.desk.inbox.filter((item) => item.caseId === selectedId) || [];
  async function draftReply() {
    if (!selected) return;
    draftAbort.current?.abort();
    const controller = new AbortController();
    draftAbort.current = controller;
    const ticket = replyScope.current.begin();
    setReplyBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(65_000),
        ]),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question:
            "Draft a short reply to this guest that asks for any missing booking information and acknowledges their requests. Do not claim a reservation has been made.",
          history: [],
          messages: selected.session.messages,
          brief: selected.session.brief,
          pendingAnalysis: !!selected.session.pendingAnalysis,
          referenceDate: selected.session.referenceDate || null,
          guestCare: selected.session.guestCare,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The reply could not be drafted.");
      if (!replyScope.current.current(ticket)) return;
      setReply((result.replyDraft || result.answer || "").slice(0, 1000));
      setNotice("Reply drafted. Review it before sending a simulated reply.");
    } catch (cause) {
      if (replyScope.current.current(ticket) && !controller.signal.aborted)
        setNotice(cause instanceof Error ? cause.message : "Please retry.");
    } finally {
      if (replyScope.current.current(ticket)) setReplyBusy(false);
    }
  }
  async function sendReply() {
    const item = selectedInbox.find(
      (item) => item.simulation && ["email", "whatsapp"].includes(item.channel),
    );
    if (!item) return;
    const ticket = replyScope.current.begin();
    setNotice("");
    try {
      await desk.perform({
        type: "reply",
        id: item.id,
        text: reply,
        key: replyKey,
      });
      if (!replyScope.current.current(ticket)) return;
      setReply("");
      setReplyKey(crypto.randomUUID());
      setNotice("Simulated reply sent. No guest has been contacted.");
    } catch (cause) {
      if (replyScope.current.current(ticket))
        setNotice(cause instanceof Error ? cause.message : "Please retry.");
    }
  }
  return (
    <div className="team-shell">
      <a className="skip-link" href="#team-content">
        Skip to team desk
      </a>
      <header className="topbar">
        <a className="brand" href="/" aria-label="FormBridge booking desk">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          FormBridge
        </a>
        <a className="team-back" href="/">
          <ArrowLeft size={15} /> Booking desk
        </a>
        <div className="topbar-right">
          <button
            className="icon-button team-notifications"
            aria-label={`${alerts.length} reminders needing attention`}
            onClick={() => setTab("overview")}
          >
            <Bell size={19} />
            {alerts.length > 0 && <span>{alerts.length}</span>}
          </button>
          <button className="button subtle" onClick={() => setAccount(true)}>
            <Users size={15} />
            <span>
              {team.user?.is_anonymous
                ? "Device account"
                : team.user
                  ? "Your account"
                  : "Sign in"}
            </span>
          </button>
        </div>
      </header>
      <main className="team-content">
        <div className="team-page-heading">
          <div>
            <p className="page-overline">
              <span /> GOOD SERVICE STARTS HERE
            </p>
            <h1>
              A welcome, <em>well looked after.</em>
            </h1>
            <p>
              {data?.desk.restaurant.name
                ? `${data.desk.restaurant.name} · ${data.desk.restaurant.city}`
                : "The people, requests and details behind your next service."}
            </p>
          </div>
          {team.user && (
            <div className="team-picker">
              <label htmlFor="team-workspace-select">Your workspace</label>
              <select
                id="team-workspace-select"
                className="edit-input"
                value={team.workspaceId}
                onChange={(e) => {
                  team.chooseWorkspace(e.target.value);
                  setSelectedId("");
                  setNotice("");
                }}
              >
                <option value="">Choose a team</option>
                {team.workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {!team.user || !team.workspaceId ? (
          <div className="team-start team-card">
            <div className="team-start-emblem">
              <Utensils size={32} />
            </div>
            <p className="team-overline">YOUR RESTAURANT DESK</p>
            <h2>One team. Every little detail.</h2>
            <p>
              Bring enquiries into one private place. Give each request an
              owner, remember your guests and make the next shift feel prepared.
            </p>
            <button className="button primary" onClick={() => setAccount(true)}>
              Open your team workspace <ChevronRight size={16} />
            </button>
            <span>
              Start on this device or sign in with your email account.
            </span>
          </div>
        ) : (
          <div className="team-layout">
            <nav className="team-sidebar" aria-label="Team desk sections">
              {tabs.map((item) => (
                <button
                  className={tab === item.id ? "selected" : ""}
                  aria-current={tab === item.id ? "page" : undefined}
                  onClick={() => {
                    setTab(item.id);
                    setNotice("");
                    desk.clearError();
                  }}
                  key={item.id}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                  {item.id === "inbox" && unread > 0 && <small>{unread}</small>}
                </button>
              ))}
              <div className="team-sidebar-foot">
                <span className="connected-dot" /> Private team desk
                <br />
                <small>
                  {team.memberCount}{" "}
                  {team.memberCount === 1 ? "teammate" : "teammates"}
                </small>
              </div>
            </nav>
            <div id="team-content" className="team-main">
              {(desk.error || team.error) && (
                <div className="alert error" role="alert">
                  <span>{desk.error || team.error}</span>
                  <button
                    className="text-button"
                    onClick={() =>
                      run(async () => {
                        await desk.refresh();
                        await team.refreshCases();
                      }, "Workspace refreshed.")
                    }
                  >
                    <RefreshCw size={14} /> Refresh
                  </button>
                </div>
              )}
              {notice && (
                <div className="alert notice" role="status">
                  <span>{notice}</span>
                  <button
                    className="icon-button"
                    aria-label="Dismiss notice"
                    onClick={() => setNotice("")}
                  >
                    <Check size={15} />
                  </button>
                </div>
              )}
              {desk.loading ? (
                <div className="team-loading">
                  <LoaderCircle className="spin" size={25} /> Opening your team
                  desk…
                </div>
              ) : (
                data && (
                  <>
                    {tab === "overview" && (
                      <section>
                        <div className="team-section-heading">
                          <div>
                            <p className="team-overline">TODAY AT THE DESK</p>
                            <h2>Care for the next arrival.</h2>
                            <p>
                              See what needs a reply, a decision or a little
                              follow-through.
                            </p>
                          </div>
                          <button
                            className="button subtle"
                            onClick={() =>
                              run(async () => {
                                await desk.refresh();
                                await team.refreshCases();
                              }, "Desk refreshed.")
                            }
                          >
                            <RefreshCw size={14} /> Refresh
                          </button>
                        </div>
                        <div className="desk-stats">
                          <button
                            onClick={() => {
                              setTab("inbox");
                              setFilter("needs_reply");
                            }}
                          >
                            <span>Waiting for a reply</span>
                            <strong>
                              {
                                active.filter(
                                  (record) =>
                                    (data.desk.workflows[record.id]?.stage ||
                                      "needs_reply") === "needs_reply",
                                ).length
                              }
                            </strong>
                            <small>
                              Make their next step clear{" "}
                              <ChevronRight size={13} />
                            </small>
                          </button>
                          <button
                            onClick={() => {
                              setTab("inbox");
                              setFilter("under_review");
                            }}
                          >
                            <span>Under review</span>
                            <strong>
                              {
                                active.filter(
                                  (record) =>
                                    data.desk.workflows[record.id]?.stage ===
                                    "under_review",
                                ).length
                              }
                            </strong>
                            <small>
                              Details worth checking <ChevronRight size={13} />
                            </small>
                          </button>
                          <button onClick={() => setTab("inbox")}>
                            <span>New messages</span>
                            <strong>{unread}</strong>
                            <small>
                              In your team inbox <ChevronRight size={13} />
                            </small>
                          </button>
                          <button onClick={() => setTab("guests")}>
                            <span>Guests remembered</span>
                            <strong>{data.desk.guests.length}</strong>
                            <small>
                              A warmer return <ChevronRight size={13} />
                            </small>
                          </button>
                        </div>
                        <div className="team-two-column">
                          <section className="team-card reminder-panel">
                            <div className="team-inline-heading">
                              <h3>
                                <Bell size={17} /> Needs your attention
                              </h3>
                              <span className="team-count">
                                {alerts.length}
                              </span>
                            </div>
                            {!alerts.length ? (
                              <div className="team-small-empty">
                                <Check size={25} />
                                <p>You’re caught up with due reminders.</p>
                                <small>
                                  Set an exact due time in an enquiry’s
                                  workflow.
                                </small>
                              </div>
                            ) : (
                              alerts.map((alert) => {
                                const record = team.cases.find(
                                  (item) => item.id === alert.caseId,
                                )!;
                                return (
                                  <article
                                    className={`reminder-row ${alert.escalated ? "escalated" : ""}`}
                                    key={alert.caseId}
                                  >
                                    <span>
                                      <CalendarClock size={17} />
                                    </span>
                                    <div>
                                      <strong>{alert.task}</strong>
                                      <button
                                        className="text-button"
                                        onClick={() => open(record)}
                                      >
                                        {record.title}{" "}
                                        <ArrowUpRight size={13} />
                                      </button>
                                      <small>
                                        {alert.escalated ? "Escalated · " : ""}
                                        {new Date(alert.dueAt).toLocaleString(
                                          "en-AU",
                                        )}{" "}
                                        ·{" "}
                                        {memberName(
                                          data.desk.workflows[record.id]
                                            .assigneeId,
                                        )}
                                      </small>
                                      <div className="team-action-row">
                                        <button
                                          className="text-button"
                                          disabled={desk.busy}
                                          onClick={() =>
                                            run(
                                              () =>
                                                desk.perform({
                                                  type: "workflow",
                                                  caseId: record.id,
                                                  workflow: {
                                                    ...data.desk.workflows[
                                                      record.id
                                                    ],
                                                    dueAt: new Date(
                                                      Date.now() + 30 * 60_000,
                                                    ).toISOString(),
                                                  },
                                                }),
                                              "Reminder moved forward by 30 minutes.",
                                            )
                                          }
                                        >
                                          Snooze 30 min
                                        </button>
                                        <button
                                          className="text-button"
                                          disabled={desk.busy}
                                          onClick={() =>
                                            run(
                                              () =>
                                                desk.perform({
                                                  type: "workflow",
                                                  caseId: record.id,
                                                  workflow: {
                                                    ...data.desk.workflows[
                                                      record.id
                                                    ],
                                                    dueAt: null,
                                                    task: "",
                                                  },
                                                }),
                                              "Reminder completed.",
                                            )
                                          }
                                        >
                                          Complete reminder
                                        </button>
                                      </div>
                                    </div>
                                  </article>
                                );
                              })
                            )}
                            <p className="dialog-hint">
                              Alerts update while this desk is open. Escalated
                              tasks also appear for owners and managers.
                            </p>
                          </section>
                          <section className="team-card">
                            <div className="team-inline-heading">
                              <h3>Recently at the desk</h3>
                              <button
                                className="text-button"
                                onClick={() => setTab("inbox")}
                              >
                                See all <ArrowUpRight size={14} />
                              </button>
                            </div>
                            {!active.length ? (
                              <div className="team-small-empty">
                                <Inbox size={26} />
                                <p>Your first enquiry belongs here.</p>
                                <a className="text-button" href="/">
                                  Prepare a booking brief{" "}
                                  <ArrowUpRight size={13} />
                                </a>
                              </div>
                            ) : (
                              active.slice(0, 5).map((record) => (
                                <button
                                  className="recent-enquiry"
                                  key={record.id}
                                  onClick={() => open(record)}
                                >
                                  <span className="guest-monogram">
                                    {(record.session.guestCare?.name ||
                                      record.title)[0].toUpperCase()}
                                  </span>
                                  <div>
                                    <strong>
                                      {record.session.guestCare?.name ||
                                        record.title}
                                    </strong>
                                    <small>
                                      {record.session.brief.fields.date.value ||
                                        "Date to confirm"}{" "}
                                      ·{" "}
                                      {record.session.brief.fields.partySize
                                        .value
                                        ? `${record.session.brief.fields.partySize.value} guests`
                                        : "Guests to confirm"}
                                    </small>
                                  </div>
                                  <ChevronRight size={15} />
                                </button>
                              ))
                            )}
                          </section>
                        </div>
                        <div className="team-welcome-card">
                          <Utensils size={28} />
                          <div>
                            <h3>Let the conversation come to you.</h3>
                            <p>
                              Open a branded guest assistant, add approved
                              restaurant information and review requests as a
                              team.
                            </p>
                          </div>
                          <button
                            className="button subtle"
                            onClick={() => setTab("restaurant")}
                          >
                            Restaurant library <ChevronRight size={15} />
                          </button>
                        </div>
                      </section>
                    )}
                    {tab === "inbox" && (
                      <section>
                        <div className="team-section-heading">
                          <div>
                            <p className="team-overline">ENQUIRY INBOX</p>
                            <h2>Every request, looked after.</h2>
                            <p>
                              Website requests and channel simulations, with the
                              team’s next step close by.
                            </p>
                          </div>
                          <a className="button primary" href="/">
                            New booking brief <ChevronRight size={15} />
                          </a>
                        </div>
                        <div className="inbox-controls">
                          <div className="team-search">
                            <Search size={16} />
                            <input
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                              placeholder="Find a guest or enquiry…"
                              aria-label="Search enquiries"
                            />
                          </div>
                          <select
                            className="edit-input"
                            value={filter}
                            aria-label="Filter enquiry stage"
                            onChange={(e) => setFilter(e.target.value)}
                          >
                            <option value="all">All active enquiries</option>
                            {Object.entries(stageLabels).map(([id, label]) => (
                              <option key={id} value={id}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="inbox-layout">
                          <div className="inbox-list">
                            {!filtered.length ? (
                              <div className="team-empty">
                                <Inbox size={28} />
                                <h3>A little room for your next enquiry.</h3>
                                <p>
                                  Create a brief, open your website assistant or
                                  try a channel simulation.
                                </p>
                                <button
                                  className="text-button"
                                  onClick={() => setTab("connections")}
                                >
                                  Try the connections <ChevronRight size={14} />
                                </button>
                              </div>
                            ) : (
                              filtered.map((record) => {
                                const flow =
                                    data.desk.workflows[record.id] ||
                                    emptyWorkflow(),
                                  events = data.desk.inbox.filter(
                                    (item) => item.caseId === record.id,
                                  ),
                                  Channel = events.length
                                    ? channelIcons[events[0].channel]
                                    : MessageSquare;
                                return (
                                  <button
                                    className={`inbox-ticket ${selectedId === record.id ? "selected" : ""}`}
                                    key={record.id}
                                    onClick={() => open(record)}
                                  >
                                    <div>
                                      <Channel size={15} />
                                      <span>
                                        {events[0]?.channel.replace("_", " ") ||
                                          "Booking desk"}
                                      </span>
                                      {events[0]?.simulation && (
                                        <small className="simulation-pill">
                                          Simulated
                                        </small>
                                      )}
                                      {events.some((item) => !item.read) && (
                                        <span
                                          className="unread-dot"
                                          aria-label="Unread message"
                                        />
                                      )}
                                    </div>
                                    <h3>
                                      {record.session.guestCare?.name ||
                                        record.title}
                                    </h3>
                                    <p>
                                      {events[0]?.text ||
                                        record.session.messages.at(-1)?.text ||
                                        record.title}
                                    </p>
                                    <footer>
                                      <span
                                        className={`stage-label ${flow.priority === "urgent" ? "urgent" : ""}`}
                                      >
                                        {stageLabels[flow.stage]}
                                      </span>
                                      <small>
                                        {memberName(flow.assigneeId)}
                                      </small>
                                    </footer>
                                  </button>
                                );
                              })
                            )}
                          </div>
                          <div className="inbox-detail">
                            {!selected ? (
                              <div className="team-card team-detail-empty">
                                <Utensils size={32} />
                                <h3>A thoughtful next step.</h3>
                                <p>
                                  Select an enquiry to review the details, bring
                                  in your team and leave a clear handoff.
                                </p>
                              </div>
                            ) : (
                              <div className="team-card">
                                <div className="team-inline-heading">
                                  <div>
                                    <p className="team-overline">THE ENQUIRY</p>
                                    <h3>
                                      {selected.session.guestCare?.name ||
                                        selected.title}
                                    </h3>
                                  </div>
                                  <span className="team-reviewed">
                                    {reviewedSession(selected.session)
                                      ? "Staff reviewed"
                                      : selected.session.pendingAnalysis
                                        ? "Update needs review"
                                        : "Draft for review"}
                                  </span>
                                </div>
                                <div className="inbox-brief">
                                  {FIELD_KEYS.map((key) => (
                                    <div key={key}>
                                      <span>{fieldLabels[key]}</span>
                                      <strong>
                                        {selected.session.pendingAnalysis
                                          ? "Needs another check"
                                          : selected.session.brief.fields[key]
                                              .value ||
                                            selected.session.brief.fields[key]
                                              .constraint ||
                                            "To confirm"}
                                      </strong>
                                    </div>
                                  ))}
                                </div>
                                <div className="team-action-row">
                                  <a
                                    className="button primary"
                                    href={`/?case=${selected.id}&workspace=${team.workspaceId}`}
                                  >
                                    Open booking desk <ArrowUpRight size={15} />
                                  </a>
                                  <button
                                    className="button subtle"
                                    onClick={() => setWorkflowCase(selected)}
                                  >
                                    <Settings2 size={15} /> Workflow & review
                                  </button>
                                </div>
                                {selected.session.guestCare && (
                                  <div className="inbox-care">
                                    <Heart size={16} />
                                    <p>
                                      {[
                                        selected.session.guestCare.dietary,
                                        selected.session.guestCare.seating,
                                        selected.session.guestCare.occasion,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ") ||
                                        "No guest preferences recorded."}
                                    </p>
                                  </div>
                                )}
                                {selectedInbox.map((item) => {
                                  const Channel = channelIcons[item.channel];
                                  return (
                                    <article
                                      className="inbox-message"
                                      key={item.id}
                                    >
                                      <header>
                                        <Channel size={15} />
                                        <strong>
                                          {item.channel === "guest_review"
                                            ? "Guest review"
                                            : item.name || "Guest"}
                                        </strong>
                                        {item.simulation && (
                                          <span className="simulation-pill">
                                            Simulated
                                          </span>
                                        )}
                                        <time>
                                          {new Date(
                                            item.receivedAt,
                                          ).toLocaleString("en-AU")}
                                        </time>
                                      </header>
                                      <p>{item.text}</p>
                                      {!item.read && (
                                        <button
                                          className="text-button"
                                          disabled={desk.busy}
                                          onClick={() =>
                                            run(
                                              () =>
                                                desk.perform({
                                                  type: "read",
                                                  id: item.id,
                                                }),
                                              "Message marked as read.",
                                            )
                                          }
                                        >
                                          Mark as read <Check size={13} />
                                        </button>
                                      )}
                                      {item.replies.map((response) => (
                                        <div
                                          className="inbox-reply"
                                          key={response.id}
                                        >
                                          <span>Staff reply · Simulated</span>
                                          <p>{response.text}</p>
                                        </div>
                                      ))}
                                    </article>
                                  );
                                })}
                                {selectedInbox.some(
                                  (item) =>
                                    item.simulation &&
                                    ["email", "whatsapp"].includes(
                                      item.channel,
                                    ),
                                ) && (
                                  <form
                                    className="inbox-reply-form"
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      void sendReply();
                                    }}
                                  >
                                    <div className="team-inline-heading">
                                      <h4>Reply for review</h4>
                                      <button
                                        type="button"
                                        className="text-button"
                                        disabled={replyBusy || desk.busy}
                                        onClick={draftReply}
                                      >
                                        {replyBusy
                                          ? "Drafting…"
                                          : "Help draft a reply"}{" "}
                                        <MessageSquare size={13} />
                                      </button>
                                    </div>
                                    <label
                                      className="sr-only"
                                      htmlFor="mock-reply"
                                    >
                                      Simulated staff reply
                                    </label>
                                    <textarea
                                      id="mock-reply"
                                      className="import-input"
                                      rows={3}
                                      value={reply}
                                      maxLength={1000}
                                      onChange={(e) => {
                                        replyScope.current.begin();
                                        draftAbort.current?.abort();
                                        setReplyBusy(false);
                                        setReply(e.target.value);
                                      }}
                                      placeholder="Review your reply before testing the send…"
                                    />
                                    <button
                                      className="button primary"
                                      disabled={
                                        !reply.trim() || desk.busy || replyBusy
                                      }
                                    >
                                      <Send size={14} /> Send simulated reply
                                    </button>
                                  </form>
                                )}
                                {!selectedInbox.length && (
                                  <p className="dialog-hint">
                                    This enquiry was prepared at the booking
                                    desk. Its conversation and sources are
                                    available there.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </section>
                    )}
                    {tab === "guests" && (
                      <GuestBook
                        key={team.workspaceId}
                        desk={desk}
                        cases={team.cases}
                        workspaceId={team.workspaceId}
                      />
                    )}
                    {tab === "restaurant" && (
                      <RestaurantLibrary key={team.workspaceId} desk={desk} />
                    )}
                    {tab === "connections" && (
                      <Connections
                        key={team.workspaceId}
                        desk={desk}
                        cases={team.cases}
                      />
                    )}
                    {tab === "people" && (
                      <section>
                        <div className="team-section-heading">
                          <div>
                            <p className="team-overline">YOUR TEAM</p>
                            <h2>Good service is a shared effort.</h2>
                            <p>
                              Give names to your teammates and keep
                              responsibilities clear.
                            </p>
                          </div>
                          <button
                            className="button primary"
                            onClick={() => setAccount(true)}
                          >
                            Workspace & account <Users size={15} />
                          </button>
                        </div>
                        <div className="team-card">
                          <form
                            className="team-name-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              run(async () => {
                                const result = await team.database!.rpc(
                                  "fb_set_member",
                                  {
                                    p_workspace: team.workspaceId,
                                    p_user: team.user!.id,
                                    p_role: null,
                                    p_name: displayName,
                                  },
                                );
                                if (result.error)
                                  throw new Error(result.error.message);
                                await desk.refresh();
                              }, "Your display name is saved.");
                            }}
                          >
                            <label>
                              Your display name
                              <input
                                className="edit-input"
                                value={displayName}
                                maxLength={80}
                                required
                                placeholder={
                                  data.members.find(
                                    (member) =>
                                      member.user_id === team.user?.id,
                                  )?.display_name ||
                                  "How should the team know you?"
                                }
                                onChange={(e) => setDisplayName(e.target.value)}
                              />
                            </label>
                            <button className="button primary">
                              Save name <Check size={14} />
                            </button>
                          </form>
                          <div className="people-list">
                            {data.members.map((member, index) => (
                              <article key={member.user_id}>
                                <span className="guest-monogram">
                                  {(member.display_name || `T${index + 1}`)
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </span>
                                <div>
                                  <strong>
                                    {member.display_name ||
                                      `Teammate ${index + 1}`}
                                    {member.user_id === team.user?.id
                                      ? " (you)"
                                      : ""}
                                  </strong>
                                  <p>
                                    {member.role === "owner"
                                      ? "Owns the workspace"
                                      : member.role === "manager"
                                        ? "Manages restaurant information and connections"
                                        : "Reviews enquiries and cares for guests"}
                                  </p>
                                </div>
                                {data.role === "owner" &&
                                member.role !== "owner" ? (
                                  <label>
                                    <span className="sr-only">
                                      Role for{" "}
                                      {member.display_name ||
                                        `Teammate ${index + 1}`}
                                    </span>
                                    <select
                                      className="edit-input"
                                      value={
                                        member.role === "member"
                                          ? "staff"
                                          : member.role
                                      }
                                      onChange={(e) =>
                                        run(async () => {
                                          const result =
                                            await team.database!.rpc(
                                              "fb_set_member",
                                              {
                                                p_workspace: team.workspaceId,
                                                p_user: member.user_id,
                                                p_role: e.target
                                                  .value as StaffRole,
                                                p_name: null,
                                              },
                                            );
                                          if (result.error)
                                            throw new Error(
                                              result.error.message,
                                            );
                                          await desk.refresh();
                                        }, "Teammate role updated.")
                                      }
                                    >
                                      <option value="staff">Staff</option>
                                      <option value="manager">Manager</option>
                                    </select>
                                  </label>
                                ) : (
                                  <span className="stage-label">
                                    {member.role === "member"
                                      ? "staff"
                                      : member.role}
                                  </span>
                                )}
                              </article>
                            ))}
                          </div>
                          <p className="dialog-hint">
                            Owners manage roles and invitations. Managers
                            publish restaurant information and configure
                            connections. Staff can work on the team’s enquiries.
                          </p>
                        </div>
                        {!canManage(data.role) && (
                          <p className="team-soft-note">
                            Ask an owner or manager to update restaurant
                            information or connections.
                          </p>
                        )}
                      </section>
                    )}
                  </>
                )
              )}
            </div>
          </div>
        )}
      </main>
      <footer className="team-footer">
        <span>FormBridge · A little care before they arrive.</span>
        <a href="/">
          Back to the booking desk <ArrowUpRight size={13} />
        </a>
      </footer>
      {account && (
        <TeamDialog
          team={team}
          onClose={() => setAccount(false)}
          onSignedOut={() => {
            setAccount(false);
            setSelectedId("");
            setNotice(
              "Signed out. Your team records are kept in the workspace.",
            );
          }}
        />
      )}
      {workflowCase && desk.data && (
        <WorkflowDialog
          key={workflowCase.id}
          record={
            team.cases.find((record) => record.id === workflowCase.id) ||
            workflowCase
          }
          desk={desk}
          workspaceId={team.workspaceId}
          onClose={() => setWorkflowCase(null)}
        />
      )}
    </div>
  );
}
