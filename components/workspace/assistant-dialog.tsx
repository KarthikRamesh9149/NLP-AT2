'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Copy, Link2, LoaderCircle, MessageSquareText, Send } from 'lucide-react';
import type { Brief, Message } from '@/lib/state';
import type { DeskReply } from '@/lib/server/desk-assistant';
import { assertRequestSize } from '@/lib/limits';
import { Dialog } from './dialog';

export function AssistantDialog({ messages, brief, referenceDate, pendingAnalysis, onClose, onUseReply, onSource }: { messages: Message[]; brief: Brief; referenceDate: string; pendingAnalysis: boolean; onClose: () => void; onUseReply: (text: string) => void; onSource: (id: string) => void }) {
  const [question, setQuestion] = useState(''); const [turns, setTurns] = useState<{ question: string; reply: DeskReply }[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [retryQuestion, setRetryQuestion] = useState(''); const [copied, setCopied] = useState(false);
  const abort = useRef<AbortController | null>(null); const thread = useRef<HTMLDivElement>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, [turns.length, busy]);
  async function ask(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true); setError(''); setRetryQuestion(text); setCopied(false);
    const controller = new AbortController(); abort.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const body = { question: text, messages, brief: { ...brief, history: brief.history.slice(-8) }, referenceDate: referenceDate || null, pendingAnalysis, history: turns.slice(-4).flatMap(turn => [{ role: 'user', text: turn.question }, { role: 'assistant', text: turn.reply.answer }]) };
      assertRequestSize(body);
      const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      const result = await response.json();
      if (!response.ok || typeof result.answer !== 'string') throw new Error(result.error || 'The answer could not be completed. Please retry.');
      setTurns(previous => [...previous, { question: text, reply: result }]); setQuestion(''); setRetryQuestion('');
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Please retry your question.'); else setError('The answer took too long. Please retry.'); }
    finally { window.clearTimeout(timeout); setBusy(false); }
  }
  return <Dialog wide title="Your booking-desk assistant." description="A little help with the next question, a clear reply or a change that needs another look." onClose={onClose}>
    <div className="assistant-thread" ref={thread} aria-live="polite">{!turns.length && <div className="assistant-welcome"><span className="assistant-symbol"><MessageSquareText size={27} /></span><h3>What would help right now?</h3><p>I can work through this enquiry with you.<br />Every decision stays in your hands.</p><div className="assistant-prompts">{['What should I ask next?', 'Draft a warm reply to the customer.', 'Summarise what changed.'].map(prompt => <button key={prompt} className="assistant-prompt" disabled={busy} onClick={() => ask(prompt)}>{prompt}<ArrowRight size={15} /></button>)}</div></div>}
    {turns.map((turn, index) => <div className="assistant-turn" key={index}><p className="assistant-question">{turn.question}</p><div className="assistant-answer"><span>FORMBRIDGE</span><p>{turn.reply.answer}</p>{turn.reply.sourceIds.length > 0 && <div className="assistant-sources">{turn.reply.sourceIds.map(id => <button className="text-button" key={id} onClick={() => { onClose(); onSource(id); }}><Link2 size={12} /> Message {messages.findIndex(message => message.id === id) + 1}</button>)}</div>}{turn.reply.replyDraft && <div className="reply-draft"><span>Reply for your review</span><blockquote>{turn.reply.replyDraft}</blockquote><div><button className="button compact primary" onClick={() => onUseReply(turn.reply.replyDraft!)}>Use in composer <ArrowRight size={14} /></button><button className="icon-button" aria-label="Copy reply draft" onClick={async () => { try { await navigator.clipboard.writeText(turn.reply.replyDraft!); setCopied(true); } catch { setError('Copy is unavailable. Use the draft in your composer instead.'); } }}><Copy size={15} /></button>{copied && <small role="status">Copied</small>}</div></div>}</div></div>)}{busy && <p className="assistant-loading"><LoaderCircle className="spin" size={16} /> Preparing an answer…</p>}</div>
    {error && <div className="dialog-error" role="alert">{error} <button className="text-button" disabled={busy} onClick={() => ask(retryQuestion)}>Retry answer</button></div>}
    <form className="assistant-composer" onSubmit={event => { event.preventDefault(); ask(question); }}><label className="sr-only" htmlFor="assistant-question">Ask the booking assistant</label><textarea id="assistant-question" value={question} maxLength={1000} rows={2} placeholder="Ask about this enquiry…" onChange={event => setQuestion(event.target.value)} /><button className="button primary" aria-label="Send assistant question" disabled={busy || !question.trim()}><Send size={16} /></button></form><p className="assistant-footnote">Suggestions for staff review. Availability and reservations are handled by the restaurant or booking provider.</p>
  </Dialog>;
}
