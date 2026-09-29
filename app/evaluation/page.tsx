'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, BarChart3, Check, ChevronRight, CircleHelp, FlaskConical, Link2, LoaderCircle, ShieldCheck } from 'lucide-react';
import { demoMessages } from '@/lib/demo';
import { createEmptyBrief, FIELD_KEYS, type Brief, type FieldKey, type Message } from '@/lib/state';
import type { Mode } from '@/lib/engine';

const names: Record<FieldKey, string> = { restaurantName: 'Restaurant', city: 'City', date: 'Date', time: 'Time', partySize: 'Party size' };
const modes: { key: Mode; label: string; short: string; description: string }[] = [
  { key: 'rules', label: 'Rule baseline', short: 'A', description: 'Patterns extract explicit details and simple corrections.' },
  { key: 'model', label: 'Contextual model', short: 'B', description: 'OpenAI reads the visible conversation and predicts the current form.' },
  { key: 'formbridge', label: 'FormBridge', short: 'C', description: 'OpenAI proposes turn updates. Code checks the proposal before changing the brief.' },
];
type Comparison = Partial<Record<Mode, Brief>>;

async function analyse(mode: Mode, messages: Message[], brief: Brief): Promise<Brief> {
  const response = await fetch('/api/analyze', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, messages, brief, referenceDate: null }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `${mode} comparison failed.`);
  return body.brief as Brief;
}

export default function EvaluationPage() {
  const [comparison, setComparison] = useState<Comparison>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runComparison() {
    setBusy(true);
    setError(null);
    try {
      // All approaches receive the same visible two-message prefix.
      const [rules, model] = await Promise.all([
        analyse('rules', demoMessages, createEmptyBrief()),
        analyse('model', demoMessages, createEmptyBrief()),
      ]);
      let formbridge = createEmptyBrief();
      for (let i = 0; i < demoMessages.length; i += 1) {
        formbridge = await analyse('formbridge', demoMessages.slice(0, i + 1), formbridge);
      }
      setComparison({ rules, model, formbridge });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The comparison could not finish.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="app-shell">
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="brand"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span>FormBridge</span></div>
      <div className="side-divider" />
      <div className="nav-section-label">WORKSPACE</div>
      <a className="nav-item" href="/"><ArrowLeft size={18} /> Booking desk</a>
      <a className="nav-item active" href="/evaluation"><BarChart3 size={18} /> Evaluation <span className="nav-dot" /></a>
      <div className="sidebar-spacer" />
      <div className="sidebar-note"><span className="sidebar-note-icon"><ShieldCheck size={18} /></span><strong>Honest comparison</strong><p>Live examples are demonstrations. The saved scenario suite is the regression evidence.</p></div>
      <div className="sidebar-footer"><span className="online-dot" /> Demo workspace <span>v1.0</span></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="topbar-breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>Evaluation</strong></div><div className="topbar-right"><a className="topbar-eval" href="/">Booking desk <ArrowRight size={13} /></a><span className="demo-badge"><span /> DEMO ENVIRONMENT</span><span className="topbar-avatar" aria-label="Staff workspace">FB</span></div></header>
      <div className="content-wrap evaluation-wrap">
        <div className="page-overline"><span className="overline-line" /> TECHNICAL EVALUATION</div>
        <div className="evaluation-hero"><div><h1>See what each approach understands.</h1><p>Three methods, one conversation. Run a transparent side-by-side example, then inspect the reproducible test suite in the repository.</p></div><a className="button subtle" href="/"><ArrowLeft size={15} /> Back to booking desk</a></div>
        <div className="evaluation-intro-grid">
          {modes.map((mode) => <article className={`method-card ${mode.key}`} key={mode.key}><span className="method-letter">{mode.short}</span><div><h2>{mode.label}</h2><p>{mode.description}</p></div></article>)}
        </div>
        <section className="evaluation-case panel" aria-labelledby="case-title"><div className="case-copy"><div className="panel-kicker">SYNTHETIC WORKED EXAMPLE</div><h2 id="case-title">A booking that changes mid-conversation.</h2><p>The customer changes four people to five and replaces an exact time with an “after 8 pm” preference. An exact time is still unknown.</p><div className="case-messages">{demoMessages.map((message, index) => <div className="case-message" key={message.id}><span>0{index + 1}</span><q>{message.text}</q></div>)}</div></div><div className="case-action"><FlaskConical size={27} /><strong>Run the same case through all three approaches</strong><p>Uses live API calls for the contextual methods.</p><button type="button" className="button primary" disabled={busy} onClick={runComparison}>{busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}{busy ? 'Comparing…' : 'Run comparison'}</button></div></section>
        {error && <div className="alert error" role="alert"><CircleHelp size={18} /><span>{error}</span></div>}
        <section className="comparison-section" aria-labelledby="comparison-title"><div className="section-heading"><div><div className="panel-kicker">LIVE COMPARISON</div><h2 id="comparison-title">Resulting booking states</h2></div><span className="comparison-caption">Customer turns only · no future messages</span></div><div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>FIELD</th>{modes.map((mode) => <th key={mode.key}><span className={`table-method-dot ${mode.key}`} />{mode.label}</th>)}</tr></thead><tbody>{FIELD_KEYS.map((field) => <tr key={field}><th scope="row">{names[field]}</th>{modes.map((mode) => { const item = comparison[mode.key]?.fields[field]; return <td key={mode.key}>{item ? <><strong className={item.value ? '' : 'unresolved-value'}>{item.value ?? (item.constraint ? 'Exact value unknown' : 'Missing')}</strong>{item.constraint && <small>{item.constraint}</small>}{item.status === 'resolved' ? <span className="comparison-status resolved"><Check size={11} /> Resolved</span> : <span className="comparison-status unresolved"><CircleHelp size={11} /> {item.status === 'missing' ? 'Missing' : 'Clarify'}</span>}</> : <span className="comparison-placeholder">Run comparison</span>}</td>; })}</tr>)}</tbody></table></div><p className="comparison-footnote"><Link2 size={15} /> This interactive case illustrates behaviour. It is not a population-level accuracy result.</p></section>
        <section className="evaluation-methods"><div className="evaluation-methods-copy"><div className="panel-kicker">HOW WE TEST</div><h2>Accuracy needs more than one example.</h2><p>The repository contains 20 labelled, team-authored scenarios covering corrections, uncertain times, staff acceptance and rejection, missing fields and an instruction-in-message case. The scenario runner calls the same API used by the app and saves each field-level result.</p></div><div className="evaluation-metrics"><div><span>01</span><strong>Field state</strong><p>Expected value and resolved, missing or clarification status.</p></div><div><span>02</span><strong>Source evidence</strong><p>References must point to messages in the visible conversation.</p></div><div><span>03</span><strong>Failure analysis</strong><p>Every failed scenario is retained for investigation.</p></div></div></section>
        <footer className="page-footer"><span>FormBridge · NLP AT2 project</span><span>Demo and synthetic tests only. No reservation is placed.</span></footer>
      </div>
    </main>
  </div>;
}
