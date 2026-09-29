'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Check, CheckCheck, ChevronRight, CircleHelp, Clock3, Download, FileCheck2,
  History, Link2, LoaderCircle, MessageSquareText, Plus, RotateCcw, Send, ShieldCheck,
  Sparkles, X,
} from 'lucide-react';
import { demoBrief, demoMessages } from '@/lib/demo';
import { applyManualEdit, approveBrief, clarificationFor, createEmptyBrief, FIELD_KEYS, type Brief, type FieldKey, type Message, type Speaker } from '@/lib/state';

const fieldLabels: Record<FieldKey, string> = {
  restaurantName: 'Restaurant', city: 'City', date: 'Date', time: 'Time', partySize: 'Party size',
};
const fieldHints: Record<FieldKey, string> = {
  restaurantName: 'Name of the venue', city: 'Where the venue is located', date: 'Requested booking date',
  time: 'Exact requested time', partySize: 'Number of guests',
};
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function IconMark() {
  return <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>;
}

function downloadBrief(brief: Brief, messages: Message[]) {
  const payload = {
    title: 'FormBridge booking brief',
    status: brief.approvedRevision === brief.revision ? 'approved_by_staff' : 'draft_not_a_reservation',
    fields: brief.fields,
    messages,
    changes: brief.history,
    exportedAt: new Date().toISOString(),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'formbridge-booking-brief.json';
  link.click();
  URL.revokeObjectURL(url);
}

export default function Workspace() {
  const [messages, setMessages] = useState<Message[]>(demoMessages);
  const [brief, setBrief] = useState<Brief>(demoBrief);
  const [speaker, setSpeaker] = useState<Speaker>('customer');
  const [draft, setDraft] = useState('');
  const [referenceDate, setReferenceDate] = useState('');
  const [selectedField, setSelectedField] = useState<FieldKey | null>('time');
  const [editingField, setEditingField] = useState<FieldKey | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setReferenceDate(today());
    try {
      const saved = sessionStorage.getItem('formbridge-session');
      if (saved) {
        const session = JSON.parse(saved) as { messages: Message[]; brief: Brief };
        if (Array.isArray(session.messages) && session.brief?.fields?.time) {
          setMessages(session.messages);
          setBrief(session.brief);
        }
      }
    } catch { /* A damaged browser session starts from the example. */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) sessionStorage.setItem('formbridge-session', JSON.stringify({ messages, brief }));
  }, [messages, brief, hydrated]);

  const resolvedCount = FIELD_KEYS.filter((field) => brief.fields[field].status === 'resolved' && !!brief.fields[field].value).length;
  const selectedEvidence = useMemo(() => new Set(selectedField ? brief.fields[selectedField].evidenceIds : []), [selectedField, brief]);
  const clarification = clarificationFor(brief);
  const isApproved = brief.approvedRevision === brief.revision;

  async function analyse(nextMessages: Message[], currentBrief: Brief) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages, brief: currentBrief, mode: 'formbridge', referenceDate: referenceDate || null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Analysis failed.');
      setBrief(result.brief as Brief);
      setPendingAnalysis(false);
      setNotice(result.appliedUpdates ? `${result.appliedUpdates} booking detail${result.appliedUpdates === 1 ? '' : 's'} updated.` : 'No new booking detail was confirmed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not analyse this turn.');
      setPendingAnalysis(true);
    } finally {
      setBusy(false);
    }
  }

  async function addMessage() {
    const text = draft.trim();
    if (!text || busy || pendingAnalysis) return;
    const message: Message = { id: `m_${Date.now()}`, speaker, text };
    const nextMessages = [...messages, message];
    setMessages(nextMessages);
    setDraft('');
    setNotice(null);
    if (brief.approvedRevision !== null) setBrief({ ...brief, approvedRevision: null });
    if (speaker === 'staff') {
      setNotice('Staff message added. Awaiting the customer’s response.');
    } else {
      await analyse(nextMessages, { ...brief, approvedRevision: null });
    }
    composerRef.current?.focus();
  }

  function loadDemo() {
    setMessages(demoMessages);
    setBrief(demoBrief);
    setSelectedField('time');
    setPendingAnalysis(false);
    setError(null);
    setNotice('Example loaded. Add a message to continue it.');
  }

  function newBrief() {
    setMessages([]);
    setBrief(createEmptyBrief());
    setSelectedField(null);
    setPendingAnalysis(false);
    setError(null);
    setNotice('New draft ready. Start with a customer message.');
    composerRef.current?.focus();
  }

  function startEdit(field: FieldKey) {
    setSelectedField(field);
    setEditingField(field);
    setEditValue(brief.fields[field].value ?? '');
    setError(null);
  }

  function saveEdit() {
    if (!editingField) return;
    try {
      setBrief(applyManualEdit(brief, editingField, editValue));
      setNotice(`${fieldLabels[editingField]} saved as a staff edit.`);
      setEditingField(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that value.');
    }
  }

  function approve() {
    try {
      setBrief(approveBrief(brief));
      setNotice('Booking brief approved for handoff. No reservation has been made.');
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The brief is incomplete.');
    }
  }

  function focusMessage(id: string) {
    document.getElementById(`message-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand"><IconMark /><span>FormBridge</span></div>
        <div className="side-divider" />
        <div className="nav-section-label">WORKSPACE</div>
        <a className="nav-item active" href="/"><MessageSquareText size={18} strokeWidth={1.8} /> Booking desk <span className="nav-dot" /></a>
        <a className="nav-item" href="/evaluation"><History size={18} strokeWidth={1.8} /> Evaluation <ChevronRight size={15} className="nav-chevron" /></a>
        <div className="sidebar-spacer" />
        <div className="sidebar-note">
          <span className="sidebar-note-icon"><ShieldCheck size={18} /></span>
          <strong>Human confirmed</strong>
          <p>FormBridge prepares a brief for review. It never books a table.</p>
        </div>
        <div className="sidebar-footer"><span className="online-dot" /> Demo workspace <span>v1.0</span></div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>Booking desk</strong></div>
          <div className="topbar-right"><a className="topbar-eval" href="/evaluation">Evaluation <ArrowRight size={13} /></a><span className="demo-badge"><span /> DEMO ENVIRONMENT</span><span className="topbar-avatar" aria-label="Staff workspace">FB</span></div>
        </header>

        <div className="content-wrap">
          <section className="page-heading">
            <div>
              <div className="page-overline"><span className="overline-line" /> RESTAURANT ENQUIRY</div>
              <h1>Every detail, accounted for.</h1>
              <p>Turn a changing conversation into a booking brief you can actually trust.</p>
            </div>
            <div className="heading-actions">
              <button className="button subtle" onClick={loadDemo} type="button"><RotateCcw size={15} /> Load example</button>
              <button className="button dark" onClick={newBrief} type="button"><Plus size={16} /> New brief</button>
            </div>
          </section>

          <section className="progress-strip" aria-label="Booking completeness">
            <div className="progress-icon"><FileCheck2 size={20} strokeWidth={1.8} /></div>
            <div className="progress-copy"><strong>{isApproved ? 'Brief approved' : `${resolvedCount} of 5 details resolved`}</strong><span>{isApproved ? 'Ready for staff handoff' : clarification ? 'One more answer brings this brief closer to handoff.' : 'All details ready for review.'}</span></div>
            <div className="progress-visual" aria-hidden="true">{FIELD_KEYS.map((key) => <span key={key} className={brief.fields[key].status === 'resolved' ? 'done' : ''} />)}</div>
            <span className="progress-fraction">{resolvedCount}/5</span>
          </section>

          {error && <div className="alert error" role="alert"><CircleHelp size={18} /><span>{error}</span>{pendingAnalysis && <button type="button" onClick={() => analyse(messages, brief)} disabled={busy}>Retry analysis</button>}<button className="icon-button" aria-label="Dismiss error" onClick={() => setError(null)}><X size={16} /></button></div>}
          {notice && <div className="alert notice" role="status"><Check size={18} /><span>{notice}</span><button className="icon-button" aria-label="Dismiss notice" onClick={() => setNotice(null)}><X size={16} /></button></div>}

          <div className="workspace-grid">
            <section className="panel conversation-panel" aria-labelledby="conversation-title">
              <div className="panel-heading">
                <div className="panel-title-group"><div className="panel-kicker">SOURCE</div><h2 id="conversation-title">Conversation</h2><p>What the customer and staff actually said.</p></div>
                <span className="count-pill">{messages.length} MESSAGES</span>
              </div>
              <div className="conversation-list" aria-live="polite">
                {messages.length === 0 ? <div className="conversation-empty"><MessageSquareText size={30} /><strong>No messages yet</strong><p>Add a customer message below to start the brief.</p></div> : messages.map((message, index) => (
                  <article id={`message-${message.id}`} key={message.id} className={`message-row ${message.speaker} ${selectedEvidence.has(message.id) ? 'evidence-active' : ''}`}>
                    <div className={`message-avatar ${message.speaker}`}>{message.speaker === 'customer' ? 'C' : 'S'}</div>
                    <div className="message-main">
                      <div className="message-meta"><strong>{message.speaker === 'customer' ? 'Customer' : 'Staff'}</strong><span>MESSAGE {String(index + 1).padStart(2, '0')}</span>{selectedEvidence.has(message.id) && <em><Link2 size={11} /> EVIDENCE</em>}</div>
                      <p className="message-text">{message.text}</p>
                    </div>
                  </article>
                ))}
              </div>
              <div className="composer">
                <div className="composer-head"><span>Add to conversation</span><span className="composer-hint">Text only · No live reservation</span></div>
                <div className="speaker-switch" role="group" aria-label="Message speaker"><button type="button" className={speaker === 'customer' ? 'selected' : ''} onClick={() => setSpeaker('customer')}>Customer</button><button type="button" className={speaker === 'staff' ? 'selected' : ''} onClick={() => setSpeaker('staff')}>Staff</button></div>
                <label className="sr-only" htmlFor="message-input">New message</label>
                <textarea id="message-input" ref={composerRef} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={speaker === 'customer' ? 'e.g. Yes, 8:30 pm works for us.' : 'e.g. Would 8:30 pm suit you?'} rows={3} maxLength={1000} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); addMessage(); } }} />
                <div className="composer-footer"><span>⌘ / Ctrl + Enter to add</span><button className="button primary" type="button" onClick={addMessage} disabled={!draft.trim() || busy || pendingAnalysis}>{busy ? <LoaderCircle className="spin" size={16} /> : <Send size={15} />} {busy ? 'Analysing…' : speaker === 'customer' ? 'Add & analyse' : 'Add message'}</button></div>
              </div>
            </section>

            <section className="panel brief-panel" aria-labelledby="brief-title">
              <div className="panel-heading brief-heading"><div className="panel-title-group"><div className="panel-kicker">CURRENT UNDERSTANDING</div><h2 id="brief-title">Booking brief</h2><p>Each detail stays linked to its source.</p></div><span className="brief-icon"><Sparkles size={20} strokeWidth={1.7} /></span></div>
              <div className="brief-fields">
                {FIELD_KEYS.map((field) => {
                  const item = brief.fields[field];
                  const selected = selectedField === field;
                  return <div key={field} className={`field-row ${selected ? 'selected' : ''} ${item.status}`}>
                    <button type="button" className="field-main" onClick={() => setSelectedField(selected ? null : field)} aria-expanded={selected}>
                      <span className="field-topline"><span className="field-label">{fieldLabels[field]}</span><span className={`field-status ${item.status}`}>{item.status === 'resolved' ? <Check size={12} /> : item.status === 'needs_clarification' ? <Clock3 size={12} /> : <CircleHelp size={12} />}{item.status === 'resolved' ? 'Resolved' : item.status === 'needs_clarification' ? 'Needs clarification' : 'Missing'}</span></span>
                      <span className={`field-value ${!item.value ? 'placeholder' : ''}`}>{item.value ?? (item.constraint ? 'Exact value not confirmed' : 'Not provided yet')}</span>
                      {item.constraint && <span className="field-constraint">Customer preference: <strong>{item.constraint}</strong></span>}
                      <span className="field-footline">{item.source === 'staff' ? 'Reviewed by staff' : item.evidenceIds.length ? <><Link2 size={12} /> Linked to {item.evidenceIds.map((id) => `message ${messages.findIndex((m) => m.id === id) + 1}`).join(' + ')}</> : fieldHints[field]}<ChevronRight size={14} className={selected ? 'rotate' : ''} /></span>
                    </button>
                    <button type="button" className="edit-button" onClick={() => startEdit(field)} aria-label={`Edit ${fieldLabels[field]}`}>Edit</button>
                    {selected && <div className="field-evidence"><div className="evidence-title">SOURCE OF THIS DETAIL</div>{item.source === 'staff' ? <p>Manually set by staff. Review against the conversation before handoff.</p> : item.evidenceIds.length ? item.evidenceIds.map((id) => { const message = messages.find((m) => m.id === id); return <button className="evidence-link" type="button" key={id} onClick={() => focusMessage(id)}><span>{message?.speaker === 'staff' ? 'STAFF' : 'CUSTOMER'}</span><q>{message?.text ?? 'Message unavailable'}</q><ArrowRight size={14} /></button>; }) : <p>No source message has been linked yet.</p>}</div>}
                  </div>;
                })}
              </div>
              <div className="clarification-box"><div className="clarification-icon"><CircleHelp size={19} /></div><div><div className="clarification-title">NEXT USEFUL QUESTION</div><p>{clarification ?? 'All five details are present. Review the brief before handoff.'}</p></div></div>
              <div className="brief-actions"><button className="button approve" type="button" onClick={approve} disabled={resolvedCount !== 5 || busy}>{isApproved ? <CheckCheck size={17} /> : <ShieldCheck size={17} />}{isApproved ? 'Brief approved' : 'Approve booking brief'}</button><button className="button export" type="button" onClick={() => downloadBrief(brief, messages)}><Download size={16} /> Download {isApproved ? 'brief' : 'draft'}</button></div>
              <p className="approval-disclaimer">Approval confirms the information in this brief. It does not reserve a table.</p>
            </section>
          </div>

          <section className="below-grid">
            <div className="change-card"><div className="section-heading"><div><div className="panel-kicker">AUDIT TRAIL</div><h2>What changed</h2></div><History size={19} /></div><div className="change-list">{brief.history.length === 0 ? <p className="empty-note">Changes will appear here as the conversation develops.</p> : [...brief.history].reverse().slice(0, 4).map((change) => <div className="change-item" key={change.revision}><span className="change-track" /><div><strong>{fieldLabels[change.field]}</strong><p>{change.previousValue ? <><s>{change.previousValue}</s><ArrowRight size={13} /></> : null}{change.nextValue ?? (change.operation === 'constrain' ? 'Exact value cleared; preference retained' : 'Cleared')}</p></div><span className="change-revision">#{String(change.revision).padStart(2, '0')}</span></div>)}</div></div>
            <div className="practice-card"><div className="practice-top"><span className="practice-icon"><Link2 size={20} /></span><span>WHY FORMBridge</span></div><h2>Clarity travels with the answer.</h2><p>Corrections supersede old values. Uncertainty remains visible. Every extracted detail can be traced back to the conversation.</p><div className="practice-footer"><span>Built for review, not automatic booking</span><ArrowRight size={17} /></div></div>
          </section>

          <footer className="page-footer"><span>FormBridge · NLP AT2 project</span><span>Use synthetic examples only. Do not enter real customer details.</span></footer>
        </div>
      </main>

      {editingField && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingField(null); }}><div className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-title"><div className="modal-head"><span className="modal-icon"><FileCheck2 size={21} /></span><button type="button" className="icon-button" aria-label="Close editor" onClick={() => setEditingField(null)}><X size={19} /></button></div><h2 id="edit-title">Edit {fieldLabels[editingField].toLowerCase()}</h2><p>Manual changes are marked as staff reviewed and stay separate from model suggestions.</p><label htmlFor="field-edit">{fieldLabels[editingField]}</label><input id="field-edit" autoFocus value={editValue} onChange={(event) => setEditValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveEdit(); }} maxLength={120} /><div className="modal-actions"><button type="button" className="button subtle" onClick={() => setEditingField(null)}>Cancel</button><button type="button" className="button primary" onClick={saveEdit}>Save staff edit <ArrowRight size={15} /></button></div></div></div>}
    </div>
  );
}
