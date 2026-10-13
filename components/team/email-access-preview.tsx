"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Inbox, KeyRound, Mail, RotateCcw, ShieldCheck } from "lucide-react";
import { applyEmailPreview, emptyEmailPreview, type EmailPreviewAction } from "@/lib/email-preview";
import styles from "./email-access-preview.module.css";

const sampleEmail = "sam@juniper.test", samplePassword = "Juniper-preview-2026";
type Mode = "register" | "signin" | "recover";

export function EmailAccessPreview() {
  const [state, setState] = useState(emptyEmailPreview);
  const [mode, setMode] = useState<Mode>("register");
  const [email, setEmail] = useState(sampleEmail), [password, setPassword] = useState(samplePassword);
  const [newPassword, setNewPassword] = useState("Juniper-new-pass-2026");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), [now, setNow] = useState(0);
  const lock = useRef(false), feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const mail = state.inbox.find(item => item.id === selected) || state.inbox[0];
  async function run(action: EmailPreviewAction) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await applyEmailPreview(state, action);
      setState(result.state);
      setError(result.error);
      setNotice(result.notice);
      setNow(Date.now());
      if (result.state.inbox[0]?.id !== state.inbox[0]?.id) setSelected(result.state.inbox[0]?.id || "");
      if (!result.error && action.type === "verify") setMode("signin");
      if (!result.error && action.type === "reset_password") { setMode("signin"); setPassword(action.password); }
      requestAnimationFrame(() => feedback.current?.focus());
    } catch {
      setError("The preview could not complete this step. Please retry.");
      setNotice("");
    } finally { lock.current = false; setBusy(false); }
  }
  function restart() {
    setState(emptyEmailPreview()); setMode("register"); setEmail(sampleEmail); setPassword(samplePassword);
    setNewPassword("Juniper-new-pass-2026"); setSelected(""); setError(""); setNotice("The sample account and inbox have been cleared.");
  }
  const accountStatus = state.signedIn ? "Signed in to preview" : state.account?.verified ? "Sample email verified" : state.account ? "Awaiting verification" : "No sample account yet";
  return <main className={`guest-page ${styles.page}`}>
    <header className={styles.header}>
      <a className="brand" href="/"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>FormBridge</a>
      <a className={styles.back} href="/team"><ArrowLeft size={15} /> Back to your team</a>
    </header>
    <section className={styles.heading}>
      <span className="simulation-pill">Simulated email</span>
      <h1>A familiar way<br />back to your desk.</h1>
      <p>Try creating an account, verifying an address and recovering access. Your sample messages arrive right here.</p>
      <div className={styles.boundary}><ShieldCheck size={18} /><span>This preview stays on this page. It sends no email, creates no real account and leaves your team sign-in unchanged. Reloading clears it.</span></div>
    </section>
    <div className={styles.layout}>
      <section className={`guest-sheet ${styles.access}`} aria-label="Sample account">
        <div className={styles.sectionHeading}><div><p className="team-overline">01 / ACCOUNT ACCESS</p><h2>Come on in.</h2></div><KeyRound size={25} /></div>
        <div className={styles.accountStatus}><span className={state.account?.verified ? styles.verifiedDot : styles.pendingDot} />{accountStatus}</div>
        <div ref={feedback} tabIndex={-1} className={styles.feedback}>
          {error && <p className="dialog-error" role="alert">{error}</p>}
          {notice && <p className="dialog-success" role="status">{notice}</p>}
        </div>
        {state.signedIn ? <div className={styles.signedIn}>
          <div className="guest-emblem"><Check size={26} /></div><h3>Welcome back.</h3>
          <p>{state.account?.email}</p><p>Your sample sign-in worked. Your real workspace still uses its existing account.</p>
          <button className="button subtle" disabled={busy} onClick={() => run({ type: "signout" })}>Sign out of preview</button>
        </div> : state.recoveryId ? <form onSubmit={event => { event.preventDefault(); run({ type: "reset_password", password: newPassword }); }}>
          <h3>Choose a new sample password.</h3>
          <p className="dialog-hint">Use the supplied sample password. Keep real passwords out of this preview.</p>
          <label>New sample password<input className="edit-input" value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={12} maxLength={128} autoComplete="off" required /></label>
          <button className="button primary" disabled={busy}>Save sample password <ArrowRight size={15} /></button>
        </form> : <>
          <nav className="account-tabs" aria-label="Email preview steps">{(["register", "signin", "recover"] as const).map(value => <button type="button" disabled={busy} key={value} aria-pressed={mode === value} className={mode === value ? "selected" : ""} onClick={() => { setMode(value); setError(""); setNotice(""); }}>{value === "register" ? "Create account" : value === "signin" ? "Sign in" : "Recover access"}</button>)}</nav>
          <form onSubmit={event => { event.preventDefault(); run(mode === "recover" ? { type: mode, email } : { type: mode, email, password }); }}>
            <label>Sample email<input className="edit-input" type="email" autoComplete="off" value={email} maxLength={254} onChange={event => setEmail(event.target.value)} required aria-describedby="sample-email-help" /></label>
            <p className="dialog-hint" id="sample-email-help">Use an address ending in .test. Nothing is sent to a real inbox.</p>
            {mode !== "recover" && <label>Sample password<input className="edit-input" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} minLength={mode === "register" ? 12 : 1} maxLength={128} required aria-describedby="sample-password-help" /></label>}
            {mode !== "recover" && <p className="dialog-hint" id="sample-password-help">Use the supplied sample password, never a real account password.</p>}
            <button className="button primary" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create sample account" : mode === "signin" ? "Sign in to preview" : "Send sample recovery email"}<ArrowRight size={15} /></button>
          </form>
          {state.account && !state.account.verified && <button className={`text-button ${styles.resend}`} disabled={busy} onClick={() => run({ type: "resend", email: state.account!.email })}>Resend verification message <Mail size={14} /></button>}
        </>}
        <button className={`text-button ${styles.restart}`} disabled={busy} onClick={restart}><RotateCcw size={14} /> Start again</button>
      </section>
      <section className={`guest-sheet ${styles.mailbox}`} aria-label="Preview inbox">
        <div className={styles.sectionHeading}><div><p className="team-overline">02 / YOUR PREVIEW INBOX</p><h2>A little peace of mind.</h2></div><Inbox size={26} /></div>
        <p className={styles.inboxHint}>Sample messages appear here. Links last 15 minutes and can be used once.</p>
        {!mail ? <div className={styles.empty}><Mail size={32} /><h3>Your inbox is ready.</h3><p>Create a sample account to receive your first verification message.</p></div> : <>
          <div className={styles.mailList} aria-label="Sample messages">{state.inbox.map(item => <button key={item.id} disabled={busy} aria-pressed={mail.id === item.id} className={mail.id === item.id ? styles.selectedMail : ""} onClick={() => setSelected(item.id)}><Mail size={16} /><span><strong>{item.kind === "verification" ? "Verify your sample email" : "Reset your sample password"}</strong><small>{item.to} · {item.status === "ready" ? item.expiresAt <= now ? "Expired" : "Ready to open" : item.status === "used" ? "Used" : "Replaced"}</small></span></button>)}</div>
          <article className={styles.letter}>
            <span className={styles.letterBrand}>FormBridge <span>SIMULATED MESSAGE</span></span>
            <p className={styles.to}>To: {mail.to}</p>
            <h3>{mail.kind === "verification" ? "One last step. You’re nearly in." : "Let’s get you back to your desk."}</h3>
            <p>{mail.kind === "verification" ? "Verify your sample address to finish creating your preview account." : "Choose a new sample password to try the recovery experience."}</p>
            <button className="button primary" disabled={busy || mail.status !== "ready" || mail.expiresAt <= now} onClick={() => run({ type: mail.kind === "verification" ? "verify" : "open_recovery", messageId: mail.id })}>{mail.kind === "verification" ? "Verify sample email" : "Open sample recovery link"}<ArrowRight size={15} /></button>
            <small>{mail.status === "used" ? "This sample link has already been used." : mail.status === "replaced" ? "A newer message has replaced this link." : mail.expiresAt <= now ? "This sample link has expired. Request a new message." : "This link only changes the sample account on this page."}</small>
          </article>
        </>}
      </section>
    </div>
    <footer className={styles.footer}><span>FormBridge · Thoughtful details. Clear next steps.</span><a href="/team">Open your real team desk <ArrowRight size={14} /></a></footer>
  </main>;
}
