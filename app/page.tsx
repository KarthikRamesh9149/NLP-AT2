'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCheck, CircleHelp, Copy, Download, History, Link2, LoaderCircle, MessageSquareText, Plus, RotateCcw, Send, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';
import { demoBrief, demoMessages } from '@/lib/demo';
import { LEGACY_SESSION_KEY, restoreSession, SESSION_KEY } from '@/lib/session';
import { briefSchema } from '@/lib/contracts';
import { applyManualEdit, approveBrief, clarificationFor, createEmptyBrief, FIELD_KEYS, type Brief, type FieldKey, type Message, type Speaker } from '@/lib/state';
import { BookingCard, fieldLabels } from '@/components/workspace/booking-card';
import { TranscriptImport } from '@/components/workspace/transcript-import';
import { Dialog } from '@/components/workspace/dialog';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function exportBrief(brief: Brief, messages: Message[], format: 'text' | 'json') {
  const approved = brief.approvedRevision === brief.revision;
  const content = format === 'json' ? JSON.stringify({ title: 'FormBridge booking brief', status: approved ? 'approved_by_staff' : 'draft_not_a_reservation', fields: brief.fields, messages, changes: brief.history, exportedAt: new Date().toISOString() }, null, 2)
    : [`FORMBRIDGE · BOOKING BRIEF`, approved ? 'Reviewed by staff' : 'Draft · review required', '', ...FIELD_KEYS.map((k) => `${fieldLabels[k]}: ${brief.fields[k].value ?? brief.fields[k].constraint ?? 'Not provided'}${brief.fields[k].status !== 'resolved' ? ' (needs confirmation)' : ''}`), '', 'This brief does not reserve a table.', '', 'CONVERSATION', ...messages.map((m) => `${m.speaker === 'customer' ? 'Customer' : 'Staff'}: ${m.text}`)].join('\n');
  const url = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `formbridge-booking-brief.${format === 'json' ? 'json' : 'txt'}`; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Workspace() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [brief, setBrief] = useState<Brief>(createEmptyBrief);
  const [speaker, setSpeaker] = useState<Speaker>('customer');
  const [draft, setDraft] = useState('');
  const [referenceDate, setReferenceDate] = useState('');
  const [selectedField, setSelectedField] = useState<FieldKey | null>(null);
  const [editingField, setEditingField] = useState<FieldKey | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState(false);
  const [dialog, setDialog] = useState<'paste' | 'new' | 'example' | 'help' | null>(null);
  const [mobileView, setMobileView] = useState<'conversation' | 'brief'>('conversation');
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef<{ id: number; controller: AbortController | null }>({ id: 0, controller: null });
  const conversationRef = useRef<HTMLDivElement>(null);
  const resolvedCount = FIELD_KEYS.filter((field) => brief.fields[field].status === 'resolved' && !!brief.fields[field].value).length;
  const selectedEvidence = useMemo(() => new Set(selectedField ? brief.fields[selectedField].evidenceIds : []), [selectedField, brief]);
  const clarification = clarificationFor(brief);
  const isApproved = brief.approvedRevision !== null && brief.approvedRevision === brief.revision;

  useEffect(() => {
    setReferenceDate(today());
    try {
      const session = restoreSession(sessionStorage.getItem(SESSION_KEY), sessionStorage.getItem(LEGACY_SESSION_KEY));
      if (session) { setMessages(session.messages); setBrief(session.brief); setReferenceDate(session.referenceDate ?? today()); setPendingAnalysis(session.pendingAnalysis ?? false); if (session.pendingAnalysis) setError('This conversation has an unfinished update. Retry analysis to bring the brief up to date.'); }
    } catch { /* Storage may be unavailable; the workspace remains usable. */ }
    setHydrated(true);
    return () => requestRef.current.controller?.abort();
  }, []);
  useEffect(() => { if (hydrated) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ messages, brief, referenceDate, pendingAnalysis })); } catch { /* Private browsing may disable storage. */ } } }, [messages, brief, referenceDate, pendingAnalysis, hydrated]);
  useEffect(() => { if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight; }, [messages.length]);

  async function analyse(nextMessages: Message[], current: Brief, date = referenceDate) {
    requestRef.current.controller?.abort();
    const id = ++requestRef.current.id; const controller = new AbortController(); requestRef.current.controller = controller;
    setBusy(true); setPendingAnalysis(true); setError(null); setNotice(null);
    const timer = window.setTimeout(() => controller.abort(), 35_000);
    try {
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ messages: nextMessages, brief: current, mode: 'formbridge', referenceDate: date || null }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status === 429 ? 'Too many updates in a short time. Your draft is kept. Please retry in a minute.' : typeof result?.error === 'string' ? result.error : 'This update could not be completed. Your draft is kept. Retry in a moment.');
      if (!result) throw new Error('The update was incomplete. Your previous brief is kept. Please retry.');
      const parsed = briefSchema.safeParse(result.brief);
      if (!parsed.success) throw new Error('The update was incomplete. Your previous brief is kept. Please retry.');
      if (requestRef.current.id !== id) return;
      setBrief(parsed.data as Brief); setPendingAnalysis(false);
      setNotice(result.warning ?? (result.appliedUpdates ? `${result.appliedUpdates} ${result.appliedUpdates === 1 ? 'detail updated' : 'details updated'}. Your brief is ready to review.` : 'Brief checked. Your existing details are kept.'));
    } catch (cause) {
      if (requestRef.current.id !== id) return;
      setError(cause instanceof DOMException && cause.name === 'AbortError' ? 'The update took too long. Your previous brief is kept. Please retry.' : cause instanceof Error ? cause.message : 'This update could not be completed. Please retry.');
    } finally { window.clearTimeout(timer); if (requestRef.current.id === id) { setBusy(false); requestRef.current.controller = null; } }
  }
  async function addMessage() {
    const text = draft.trim(); if (!text || busy || pendingAnalysis) return;
    if (messages.length >= 30) { setError('This brief has reached 30 messages. Download it and start a new brief.'); return; }
    const nextMessages = [...messages, { id: `m_${crypto.randomUUID()}`, speaker, text }];
    setMessages(nextMessages); setDraft(''); setNotice(null); setBrief({ ...brief, approvedRevision: null });
    if (speaker === 'staff') setNotice('Staff message added. Add the customer’s answer to update the brief.');
    else await analyse(nextMessages, { ...brief, approvedRevision: null });
    composerRef.current?.focus();
  }
  function reset(example = false) {
    requestRef.current.id++; requestRef.current.controller?.abort(); requestRef.current.controller = null;
    setBusy(false); setMessages(example ? demoMessages : []); setBrief(example ? demoBrief : createEmptyBrief()); setSelectedField(null); setDraft(''); setSpeaker('customer'); setPendingAnalysis(false); setError(null); setNotice(example ? 'Example loaded. Continue the conversation to try it.' : null); setReferenceDate(today()); setDialog(null); setMobileView('conversation');
    composerRef.current?.focus();
  }
  function startNew(example = false) { if (messages.length || draft) setDialog(example ? 'example' : 'new'); else reset(example); }
  async function importMessages(raw: Omit<Message, 'id'>[]) {
    const date = referenceDate; reset(); setReferenceDate(date); const next = raw.map((m) => ({ ...m, id: `m_${crypto.randomUUID()}` })); setMessages(next); await analyse(next, createEmptyBrief(), date);
  }
  function saveEdit() {
    if (!editingField || busy) return;
    try { setBrief(applyManualEdit(brief, editingField, editValue)); setNotice(`${fieldLabels[editingField]} updated. Your edit is kept when the conversation changes.`); setEditingField(null); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Enter a valid detail.'); }
  }
  async function useConversation(field: FieldKey) {
    const next = { ...brief, fields: { ...brief.fields, [field]: createEmptyBrief().fields[field] }, approvedRevision: null };
    await analyse(messages, next);
  }
  function approve() {
    if (busy || pendingAnalysis) return;
    try { setBrief(approveBrief(brief)); setNotice('Brief approved. Download it for staff handoff.'); setError(null); } catch (e) { setError(e instanceof Error ? e.message : 'Review the remaining details.'); }
  }
  async function copyQuestion() {
    if (!clarification) return;
    try { await navigator.clipboard.writeText(clarification); setNotice('Question copied. Share it with the customer.'); } catch { setDraft(clarification); setSpeaker('staff'); setMobileView('conversation'); composerRef.current?.focus(); }
  }
  async function changeDate(value: string) {
    if (!value) { setNotice('Choose a conversation date to interpret relative dates.'); return; }
    setReferenceDate(value);
    if (messages.length && value && !busy && !pendingAnalysis) {
      const next = { ...brief, fields: { ...brief.fields, ...(brief.fields.date.source !== 'staff' ? { date: createEmptyBrief().fields.date } : {}) }, approvedRevision: null };
      await analyse(messages, next, value);
    }
  }

  return <div className="app-shell">
    <a href="#conversation-title" className="skip-link">Skip to workspace</a>
    <header className="topbar">
      <a className="brand" href="/" aria-label="FormBridge booking workspace"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>FormBridge</a>
      <span className="topbar-label">Booking workspace</span>
      <div className="topbar-right"><span className="session-badge"><span /> {busy ? 'Updating brief' : hydrated ? 'Saved in this tab' : 'Opening workspace'}</span><button type="button" className="icon-button" aria-label="How FormBridge works" onClick={() => setDialog('help')}><CircleHelp size={19} /></button></div>
    </header>
    <main className="content-wrap">
      <section className="page-heading">
        <div><p className="page-overline"><span /> A little clarity goes a long way</p><h1>Every detail, in its place.</h1><p>Turn the conversation into a booking brief you can trust and review.</p></div>
        <div className="heading-actions"><button className="button subtle" disabled={!hydrated} onClick={() => startNew(true)}><RotateCcw size={15} /> Try an example</button><button className="button dark" disabled={!hydrated} onClick={() => startNew()}><Plus size={16} /> New brief</button></div>
      </section>
      <div className={`workspace-status ${isApproved ? 'approved' : ''}`} aria-label="Booking completeness">
        <span className="status-icon"><ShieldCheck size={20} /></span><div><strong>{isApproved ? 'Reviewed and ready for handoff' : messages.length ? brief.fields.restaurantName.value ?? 'Your booking enquiry' : 'A fresh start for your next enquiry'}</strong><p>{busy ? 'Reading the conversation and checking each detail…' : pendingAnalysis ? 'An update needs to finish before you can approve this brief.' : `${resolvedCount} of 5 details ready${resolvedCount === 5 ? ' · Review before handoff' : ' · We’ll keep track of what still needs an answer'}`}</p></div>
        <div className="detail-steps" aria-label={`${resolvedCount} of 5 details ready`}>{FIELD_KEYS.map((k) => <span key={k} className={brief.fields[k].status === 'resolved' ? 'done' : ''} title={fieldLabels[k]} />)}</div>
      </div>
      {error && !editingField && <div className="alert error" role="alert"><CircleHelp size={18} /><span>{error}</span>{pendingAnalysis && <button className="text-button" onClick={() => analyse(messages, brief)} disabled={busy}>Retry update <RotateCcw size={14} /></button>}<button className="icon-button" aria-label="Dismiss error" onClick={() => setError(null)}><X size={16} /></button></div>}
      {notice && <div className="alert notice" role="status"><Check size={18} /><span>{notice}</span><button className="icon-button" aria-label="Dismiss notice" onClick={() => setNotice(null)}><X size={16} /></button></div>}
      <div className="mobile-tabs" aria-label="Workspace view"><button aria-pressed={mobileView === 'conversation'} onClick={() => setMobileView('conversation')}>Conversation <span>{messages.length}</span></button><button aria-pressed={mobileView === 'brief'} onClick={() => setMobileView('brief')}>Booking brief <span>{resolvedCount}/5</span></button></div>
      <div className="workspace-grid" data-mobile-view={mobileView}>
        <section className="panel conversation-panel" aria-labelledby="conversation-title">
          <div className="panel-heading"><div className="panel-title-group"><span className="section-icon"><MessageSquareText size={18} /></span><div><h2 id="conversation-title">Conversation</h2><p>{messages.length ? `${messages.length} ${messages.length === 1 ? 'message' : 'messages'} · Customer and staff` : 'Start with what the customer said'}</p></div></div><button className="button compact subtle" onClick={() => setDialog('paste')} disabled={!hydrated || busy || pendingAnalysis}><Upload size={15} /> Paste conversation</button></div>
          <div ref={conversationRef} className={`conversation-list ${!messages.length ? 'empty' : ''}`} aria-live="polite">
            {!messages.length ? <div className="conversation-empty"><div className="empty-illustration" aria-hidden="true"><span className="empty-bubble">A table for four, please.</span><span className="empty-detail"><Check size={14} /> 4 guests</span><span className="empty-link"><Link2 size={15} /></span></div><h3>It starts with a conversation.</h3><p>Add an enquiry below or paste a conversation.<br />We’ll gather the details as you go.</p><button className="text-button" onClick={() => setDialog('paste')}>Paste your conversation <ArrowRight size={15} /></button></div> : messages.map((m, index) => <article id={`message-${m.id}`} key={m.id} className={`message-row ${m.speaker} ${selectedEvidence.has(m.id) ? 'evidence-active' : ''}`}><div className={`message-avatar ${m.speaker}`}>{m.speaker === 'customer' ? 'C' : 'S'}</div><div className="message-main"><div className="message-meta"><strong>{m.speaker === 'customer' ? 'Customer' : 'Staff'}</strong><span>{String(index + 1).padStart(2, '0')}</span>{selectedEvidence.has(m.id) && <em><Link2 size={11} /> Source</em>}</div><p className="message-text">{m.text}</p></div></article>)}
          </div>
          <div className="composer"><div className="composer-head"><div className="speaker-switch" role="group" aria-label="Message speaker"><button aria-pressed={speaker === 'customer'} className={speaker === 'customer' ? 'selected' : ''} onClick={() => setSpeaker('customer')}>Customer</button><button aria-pressed={speaker === 'staff'} className={speaker === 'staff' ? 'selected' : ''} onClick={() => setSpeaker('staff')}>Staff</button></div><span className="composer-count">{draft.length}/1,000</span></div><label className="sr-only" htmlFor="message-input">New message</label><textarea id="message-input" ref={composerRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={speaker === 'customer' ? 'What did the customer say?' : 'Add your question or suggestion…'} rows={3} maxLength={1000} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addMessage(); } }} />
            <div className="composer-footer"><span>⌘ / Ctrl + Enter</span><button className="button primary" onClick={addMessage} disabled={!hydrated || !draft.trim() || busy || pendingAnalysis || messages.length >= 30}>{busy ? <LoaderCircle className="spin" size={16} /> : <Send size={15} />} {busy ? 'Updating brief…' : speaker === 'customer' ? 'Add to brief' : 'Add staff message'}</button></div>
            <div className="date-context"><label htmlFor="conversation-date">Conversation date</label><input id="conversation-date" type="date" value={referenceDate} onChange={(e) => changeDate(e.target.value)} disabled={!hydrated || busy || pendingAnalysis} aria-describedby="date-hint" /><span id="date-hint">For “today” and “tomorrow”</span></div>
          </div>
        </section>
        <section className={`panel brief-panel ${busy ? 'updating' : ''}`} aria-labelledby="brief-title" aria-busy={busy}>
          <div className="panel-heading"><div className="panel-title-group"><span className="section-icon brief-section-icon"><Sparkles size={18} /></span><div><h2 id="brief-title">Booking brief</h2><p>One clear place for the details</p></div></div><span className={`draft-status ${isApproved ? 'approved' : ''}`}>{isApproved ? <CheckCheck size={14} /> : <span />}{isApproved ? 'Approved' : 'Draft'}</span></div>
          <BookingCard brief={brief} messages={messages} selectedField={selectedField} onSelect={setSelectedField} onViewSource={(id) => { setMobileView('conversation'); requestAnimationFrame(() => document.getElementById(`message-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })); }} onEdit={(k) => { setSelectedField(k); setEditingField(k); setEditValue(brief.fields[k].value ?? ''); setError(null); }} onUseConversation={useConversation} busy={busy || pendingAnalysis} />
          <div className={`clarification-box ${resolvedCount === 5 ? 'complete' : ''}`}><div className="clarification-icon">{resolvedCount === 5 ? <Check size={18} /> : <CircleHelp size={18} />}</div><div><span>{resolvedCount === 5 ? 'Ready for your review' : 'Ask the customer'}</span><p>{clarification ?? 'All five details are ready. Check the sources, then approve the brief.'}</p></div>{clarification && <button className="icon-button" aria-label="Copy clarification question" onClick={copyQuestion}><Copy size={16} /></button>}</div>
          <div className="brief-actions"><button className="button approve" onClick={approve} disabled={resolvedCount !== 5 || busy || pendingAnalysis}>{isApproved ? <CheckCheck size={17} /> : <ShieldCheck size={17} />}{isApproved ? 'Brief approved' : 'Approve brief'}</button><div className="export-actions"><button className="button export" onClick={() => exportBrief(brief, messages, 'text')} disabled={!messages.length && resolvedCount === 0}><Download size={16} /> Download {isApproved ? 'brief' : 'draft'}</button><button className="button export json-export" onClick={() => exportBrief(brief, messages, 'json')} disabled={!messages.length && resolvedCount === 0} aria-label="Download brief as JSON">JSON</button></div></div>
          <p className="approval-disclaimer">A booking brief for staff review. No table is reserved.</p>
        </section>
      </div>
      {brief.history.length > 0 && <section className="change-card"><div className="section-heading"><History size={17} /><h2>What changed</h2><span>{brief.history.length} updates</span></div><div className="change-list">{[...brief.history].reverse().slice(0, 5).map((change) => <div className="change-item" key={change.revision}><span className="change-track" /><strong>{fieldLabels[change.field]}</strong><p>{change.previousValue && <><s>{change.previousValue}</s><ArrowRight size={13} /></>}{change.nextValue ?? (change.operation === 'constrain' ? 'Needs an exact answer' : 'Cleared')}</p><span className="change-revision">#{change.revision}</span></div>)}</div></section>}
      <footer className="page-footer"><span className="footer-brand"><ShieldCheck size={14} /> Clear details. Human decisions.</span><span>Your draft stays in this tab. Text is analysed with OpenAI. Avoid sensitive personal information.</span></footer>
    </main>
    {dialog === 'paste' && <TranscriptImport onClose={() => setDialog(null)} onImport={importMessages} hasDraft={messages.length > 0} />}
    {(dialog === 'new' || dialog === 'example') && <Dialog title={dialog === 'new' ? 'Start a fresh brief?' : 'Open the example?'} description="Your current conversation will be replaced. Download the draft if you want to keep it." onClose={() => setDialog(null)}><div className="dialog-actions"><button className="button subtle" onClick={() => exportBrief(brief, messages, 'text')}><Download size={15} /> Download draft</button><button className="button primary" onClick={() => reset(dialog === 'example')}>{dialog === 'example' ? 'Open example' : 'Start fresh'} <ArrowRight size={15} /></button></div></Dialog>}
    {dialog === 'help' && <Dialog title="A clearer handoff, in three steps." onClose={() => setDialog(null)}><ol className="help-steps"><li><strong>Add the conversation</strong><p>Enter customer and staff messages, or paste a whole conversation.</p></li><li><strong>Review the details</strong><p>Click a detail to see its source. Changes are tracked, and unanswered questions stay visible.</p></li><li><strong>Approve and share the brief</strong><p>Edit anything that needs a correction, then download the brief for your team. FormBridge never reserves a table.</p></li></ol><button className="button primary full-width" onClick={() => setDialog(null)}>Back to the workspace <ArrowRight size={16} /></button></Dialog>}
    {editingField && <Dialog title={`Edit ${fieldLabels[editingField].toLowerCase()}`} description="Your edit is kept when new messages arrive. You can return to the conversation’s value at any time." onClose={() => { setEditingField(null); setError(null); }}><label className="input-label" htmlFor="edit-input">{fieldLabels[editingField]}</label><input className="edit-input" id="edit-input" autoFocus value={editValue} type={editingField === 'partySize' ? 'number' : 'text'} min={editingField === 'partySize' ? 1 : undefined} max={editingField === 'partySize' ? 30 : undefined} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); }} />{error && <p className="dialog-error" role="alert">{error}</p>}<div className="dialog-actions"><button className="button subtle" onClick={() => setEditingField(null)}>Cancel</button><button className="button primary" onClick={saveEdit}>Save detail <Check size={16} /></button></div></Dialog>}
  </div>;
}
