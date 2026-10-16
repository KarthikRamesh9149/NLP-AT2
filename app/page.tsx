'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, CalendarPlus, CalendarDays, CalendarClock, Heart, Mic, Check, CheckCheck, Circle, CircleHelp, Copy, Download, ExternalLink, History, Link2, LoaderCircle, MessageSquareText, Pencil, Plus, RotateCcw, Save, Send, ShieldCheck, Trash2, Users, Utensils, Upload, X } from 'lucide-react';
import { demoBrief, demoMessages } from '@/lib/demo';
import { LEGACY_SESSION_KEY, restoreSession, SESSION_KEY, prepareStoredSession, CURRENT_ANALYSIS_VERSION, type SavedSession } from '@/lib/session';
import { briefSchema } from '@/lib/contracts';
import { applyManualEdit, approveBrief, clarificationFor, createEmptyBrief, FIELD_KEYS, type Brief, type FieldKey, type Message, type Speaker } from '@/lib/state';
import { BookingCard, fieldLabels } from '@/components/workspace/booking-card';
import { TranscriptImport } from '@/components/workspace/transcript-import';
import { Dialog } from '@/components/workspace/dialog';
import { TableSetting } from '@/components/workspace/table-setting';
import { CANCELLATION_NOTICE, isCancelledBooking } from '@/lib/cancellation-status';
import { analysisPayload, mergeAnalysisHistory, rebuildForTranscriptChange, resolveFieldReview } from '@/lib/draft-workflow';
import { CASES_KEY, caseTitle, exportCase, importCase, readCases, saveCase, type BookingCase } from '@/lib/cases';
import { calendarExport, downloadFile, reviewedSession, textExport } from '@/lib/exports';
import { BOOKING_LINKS_KEY, readBookingLinks, venueKey, type BookingLink } from '@/lib/booking-links';
import { useTeam, type TeamCase } from '@/hooks/use-team';
import { CaseLibrary } from '@/components/workspace/case-library';
import { TeamDialog } from '@/components/workspace/team-dialog';
import { AssistantDialog } from '@/components/workspace/assistant-dialog';
import { ServicePlanner } from '@/components/workspace/service-planner';
import { GuestCareDialog } from '@/components/workspace/guest-care-dialog';
import { VoiceDialog } from '@/components/workspace/voice-dialog';
import { emptyGuestCare, type FollowUp, type GuestCare } from '@/lib/follow-up';
import { applyStaffAction, type StaffAction } from '@/lib/desk-actions';
import { BookingLinkDialog } from '@/components/workspace/booking-link-dialog';
import {checkedCareSuggestions,type CareSuggestion} from '@/lib/restaurant-desk';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

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
  const [dialog, setDialog] = useState<'paste' | 'new' | 'example' | 'help' | 'cases' | 'save' | 'team' | 'assistant' | 'export' | 'reopen' | 'booking-link' | 'open-case' | 'planner' | 'guest-care' | 'voice' | null>(null);
  const team = useTeam();
  const [deviceCases, setDeviceCases] = useState<BookingCase[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [caseName, setCaseName] = useState('');
  const [notes, setNotes] = useState('');
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const [guestCare, setGuestCare] = useState<GuestCare>(emptyGuestCare);
  const [guestCareEvidence,setGuestCareEvidence]=useState<CareSuggestion[]>([]);
  const queryHandled=useRef(false);
  const [cloudCase, setCloudCase] = useState<SavedSession['teamCase']>(undefined);
  const [caseDestination, setCaseDestination] = useState<'device' | 'team'>('device');
  const [saving, setSaving] = useState(false);
  const [storageIssue, setStorageIssue] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<SavedSession | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [requestedCase, setRequestedCase] = useState<BookingCase | TeamCase | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [exportFormat, setExportFormat] = useState<'text' | 'json'>('text');
  const [bookingLinks, setBookingLinks] = useState<BookingLink[]>([]);
  const [mobileView, setMobileView] = useState<'conversation' | 'brief'>('conversation');
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef<{ id: number; controller: AbortController | null }>({ id: 0, controller: null });
  const conversationRef = useRef<HTMLDivElement>(null);
  const resolvedCount = FIELD_KEYS.filter((field) => brief.fields[field].status === 'resolved' && !!brief.fields[field].value && !brief.fields[field].review).length;
  const needsStaffReview = FIELD_KEYS.some(field => !!brief.fields[field].review);
  const selectedEvidence = useMemo(() => new Set(selectedField ? brief.fields[selectedField].evidenceIds : []), [selectedField, brief]);
  const isCancelled = !busy && !pendingAnalysis && isCancelledBooking(brief, messages);
  const clarification = isCancelled ? null : clarificationFor(brief);
  const isApproved = !busy && reviewedSession({ messages, brief, pendingAnalysis });
  const hasContent = messages.length > 0 || FIELD_KEYS.some(key => !!brief.fields[key].value || !!brief.fields[key].constraint) || !!notes || !!followUp || Object.values(guestCare).some(Boolean);
  const bookingLink = bookingLinks.find(link => venueKey(link.restaurantName, link.city) === venueKey(brief.fields.restaurantName.value || '', brief.fields.city.value || '')) ?? null;
  function snapshot(): SavedSession { return { messages, brief, referenceDate, pendingAnalysis: pendingAnalysis || busy, manualMode, analysisVersion: CURRENT_ANALYSIS_VERSION, ...(activeCaseId ? { caseId: activeCaseId } : {}), caseTitle: caseName, notes, followUp, guestCare, guestCareEvidence:checkedCareSuggestions(guestCareEvidence,messages).filter(source=>guestCare[source.field]===source.value), ...(cloudCase ? { teamCase: cloudCase } : {}) }; }

  useEffect(() => {
    setReferenceDate(today());
    try {
      const session = restoreSession(sessionStorage.getItem(SESSION_KEY), sessionStorage.getItem(LEGACY_SESSION_KEY));
      if (session) { setMessages(session.messages); setBrief(session.brief); setReferenceDate(session.referenceDate ?? today()); setPendingAnalysis(session.pendingAnalysis ?? false); setManualMode(session.manualMode ?? false); setActiveCaseId(session.caseId ?? null); setCaseName(session.caseTitle ?? ''); setNotes(session.notes ?? ''); setFollowUp(session.followUp ?? null); setGuestCare(session.guestCare ?? emptyGuestCare()); setGuestCareEvidence(session.guestCareEvidence??[]); setCloudCase(session.teamCase); if(session.composerDraft){setDraft(session.composerDraft.text);setSpeaker(session.composerDraft.speaker);} }
      setDeviceCases(readCases(localStorage.getItem(CASES_KEY))); setBookingLinks(readBookingLinks(localStorage.getItem(BOOKING_LINKS_KEY)));
    } catch { setStorageIssue(true); }
    setHydrated(true);
    return () => requestRef.current.controller?.abort();
  }, []);
  useEffect(() => { if (hydrated) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({...snapshot(),composerDraft:{text:draft,speaker}})); setStorageIssue(false); } catch { setStorageIssue(true); } } }, [messages, brief, referenceDate, pendingAnalysis, manualMode, caseName, notes, followUp, guestCare, guestCareEvidence, draft, speaker, activeCaseId, cloudCase, hydrated]);
  useEffect(() => { if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight; }, [messages.length]);
  useEffect(() => { function keyDown(event: KeyboardEvent) { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !dialog && !editingField && !editingMessage) { event.preventDefault(); setDialog('cases'); } } window.addEventListener('keydown', keyDown); return () => window.removeEventListener('keydown', keyDown); }, [dialog, editingField, editingMessage]);

  async function analyse(nextMessages: Message[], current: Brief, date = referenceDate) {
    requestRef.current.controller?.abort();
    const id = ++requestRef.current.id; const controller = new AbortController(); requestRef.current.controller = controller;
    setBusy(true); setPendingAnalysis(true); setManualMode(false); setError(null); setNotice(null);
    const timer = window.setTimeout(() => controller.abort(), 35_000);
    try {
      if (!nextMessages.some(message => message.speaker === 'customer')) { setBrief(current); setPendingAnalysis(false); setNotice('Add the customer’s enquiry to prepare the brief.'); return; }
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify(analysisPayload(nextMessages, current, date || null)) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'This update could not be completed. Your draft is kept. Retry in a moment.');
      if (!result) throw new Error('The update was incomplete. Your previous brief is kept. Please retry.');
      const parsed = briefSchema.safeParse(result.brief);
      if (!parsed.success) throw new Error('The update was incomplete. Your previous brief is kept. Please retry.');
      if (requestRef.current.id !== id) return;
      setBrief(mergeAnalysisHistory(current, parsed.data as Brief)); setPendingAnalysis(false);
      setNotice(result.warning ?? (isCancelledBooking(parsed.data as Brief, nextMessages) ? CANCELLATION_NOTICE : result.appliedUpdates ? `${result.appliedUpdates} ${result.appliedUpdates === 1 ? 'detail updated' : 'details updated'}. Your brief is ready to review.` : 'Brief checked. Your existing details are kept.'));
    } catch (cause) {
      if (requestRef.current.id !== id) return;
      setError(cause instanceof DOMException && cause.name === 'AbortError' ? 'The update took too long. Your previous brief is kept. Please retry.' : cause instanceof Error ? cause.message : 'This update could not be completed. Please retry.');
    } finally { window.clearTimeout(timer); if (requestRef.current.id === id) { setBusy(false); requestRef.current.controller = null; } }
  }
  async function addMessage() {
    const text = draft.trim(); if (!text || busy) return;
    if (messages.length >= 30) { setError('This brief has reached 30 messages. Download it and start a new brief.'); return; }
    const nextMessages = [...messages, { id: `m_${crypto.randomUUID()}`, speaker, text }];
    try { analysisPayload(nextMessages, brief, referenceDate || null); } catch (cause) { setError((cause as Error).message); return; }
    setMessages(nextMessages); setDraft(''); setNotice(null); setBrief({ ...brief, approvedRevision: null });
    if (speaker === 'staff') setNotice('Staff message added. Add the customer’s answer to update the brief.');
    else if (manualMode) { setBrief(rebuildForTranscriptChange(brief)); setPendingAnalysis(false); setNotice('New customer message added. Review the five details against the updated conversation.'); }
    else await analyse(nextMessages, { ...brief, approvedRevision: null });
    composerRef.current?.focus();
  }
  function reset(example = false) {
    requestRef.current.id++; requestRef.current.controller?.abort(); requestRef.current.controller = null;
    setBusy(false); setMessages(example ? demoMessages : []); setBrief(example ? demoBrief : createEmptyBrief()); setSelectedField(null); setDraft(''); setSpeaker('customer'); setPendingAnalysis(false); setError(null); setNotice(example ? 'Example loaded. Continue the conversation to try it.' : null); setReferenceDate(today()); setDialog(null); setMobileView('conversation');
    setActiveCaseId(null); setCaseName(''); setNotes(''); setFollowUp(null); setGuestCare(emptyGuestCare()); setGuestCareEvidence([]); setCloudCase(undefined); setUndoSnapshot(null); setEditingMessage(null); setManualMode(false);
    composerRef.current?.focus();
  }
  function startNew(example = false) { if (hasContent || draft || brief.revision > 0) setDialog(example ? 'example' : 'new'); else reset(example); }
  function focusConversation() {
    setMobileView('conversation');
    requestAnimationFrame(() => {
      composerRef.current?.focus({ preventScroll: true });
      composerRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    });
  }
  async function importMessages(raw: Omit<Message, 'id'>[]) {
    const date = referenceDate; const next = raw.map((m) => ({ ...m, id: `m_${crypto.randomUUID()}` }));
    try { analysisPayload(next, createEmptyBrief(), date || null); } catch (cause) { setError((cause as Error).message); return; }
    reset(); setReferenceDate(date); setMessages(next); await analyse(next, createEmptyBrief(), date);
  }
  function saveEdit() {
    if (!editingField || busy) return;
    try { setBrief(applyManualEdit(brief, editingField, editValue)); setNotice(`${fieldLabels[editingField]} updated. Your edit is kept when the conversation changes.`); setEditingField(null); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Enter a valid detail.'); }
  }
  async function useConversation(field: FieldKey) {
    if (brief.fields[field].review?.reason === 'staff_conflict') { setBrief(resolveFieldReview(brief, field, 'conversation')); setNotice(`${fieldLabels[field]} now uses the reviewed conversation detail.`); return; }
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
    if (messages.length && value && !busy && !manualMode) {
      const next = { ...brief, fields: { ...brief.fields, ...(brief.fields.date.source !== 'staff' ? { date: createEmptyBrief().fields.date } : {}) }, approvedRevision: null };
      await analyse(messages, next, value);
    }
  }

  function viewSource(id: string) {
    setMobileView('conversation');
    requestAnimationFrame(() => { const message = document.getElementById(`message-${id}`); message?.focus({ preventScroll: true }); message?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }); });
  }
  function downloadDraft(format: 'text' | 'json', confirm = false) {
    if (!confirm && (busy || pendingAnalysis || resolvedCount !== 5)) { setExportFormat(format); setDialog('export'); return; }
    const session = snapshot(); const title = caseName.trim() || caseTitle(session);
    downloadFile(format === 'json' ? JSON.stringify(exportCase(session, title, notes), null, 2) : textExport(session, title, notes), `formbridge-booking-brief.${format === 'json' ? 'json' : 'txt'}`, format === 'json' ? 'application/json' : 'text/plain;charset=utf-8');
  }
  function storeDeviceCase(record: BookingCase) {
    const next = saveCase(deviceCases, record);
    localStorage.setItem(CASES_KEY, JSON.stringify(next)); setDeviceCases(next); return next;
  }
  async function saveCurrentCase() {
    if (!hasContent || saving) return;
    setSaving(true); setError(null);
    try {
      const session = snapshot(); const title = caseName.trim() || caseTitle(session);
      const id = caseDestination === 'team' ? cloudCase?.workspaceId === team.workspaceId ? cloudCase.id : crypto.randomUUID() : activeCaseId || crypto.randomUUID();
      const record: BookingCase = { id, title, notes, archived: false, updatedAt: new Date().toISOString(), session };
      if (caseDestination === 'team') { const saved = await team.save(record, cloudCase?.workspaceId === team.workspaceId ? cloudCase.version : 0); setCloudCase({ id: saved.id, workspaceId: saved.workspaceId, version: saved.version }); setNotice(`Saved to ${team.workspace?.name}. Your team can open this enquiry.`); }
      else { storeDeviceCase(record); setActiveCaseId(id); setNotice('Enquiry saved on this device. Find it in the enquiry book.'); }
      setCaseName(title); setDialog(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This enquiry could not be saved. Your draft is kept.'); }
    finally { setSaving(false); }
  }
  function loadCase(record: BookingCase | TeamCase) {
    reset(); const session = prepareStoredSession(record.session);
    setMessages(session.messages); setBrief(session.brief); setReferenceDate(session.referenceDate || today()); setPendingAnalysis(session.pendingAnalysis ?? false); setManualMode(session.manualMode ?? false); setCaseName(record.title); setNotes(record.notes); setFollowUp(session.followUp ?? null); setGuestCare(session.guestCare ?? emptyGuestCare()); setGuestCareEvidence(session.guestCareEvidence??[]); setNotice(`Opened ${record.title}.`);
    if ('workspaceId' in record) setCloudCase({ id: record.id, workspaceId: record.workspaceId, version: record.version }); else setActiveCaseId(record.id);
    setRequestedCase(null);
  }
  useEffect(()=>{
    if(!hydrated||queryHandled.current||!team.user)return;
    const search=new URLSearchParams(window.location.search),id=search.get('case'),workspace=search.get('workspace');
    if(!id||!workspace)return;
    if(team.workspaceId!==workspace){if(team.workspaces.some(item=>item.id===workspace))team.chooseWorkspace(workspace);return;}
    const record=team.cases.find(item=>item.id===id);
    if(record){queryHandled.current=true;requestOpen(record);window.history.replaceState(null,'',window.location.pathname);}
  // Opening a requested case is explicit; existing drafts still receive the review dialog.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[hydrated,team.user?.id,team.workspaceId,team.workspaces,team.cases]);
  function requestOpen(record: BookingCase | TeamCase) { if (hasContent || draft) { setRequestedCase(record); setDialog('open-case'); } else loadCase(record); }
  function saveBeforeOpening() {
    if (!requestedCase) return;
    try { const session = snapshot(); storeDeviceCase({ id: activeCaseId || crypto.randomUUID(), title: caseName.trim() || caseTitle(session), notes, archived: false, updatedAt: new Date().toISOString(), session }); loadCase(requestedCase); }
    catch (cause) { setError((cause as Error).message); }
  }
  async function archiveCase(record: BookingCase | TeamCase) {
    try {
      const next = { ...record, archived: !record.archived, updatedAt: new Date().toISOString() };
      if ('workspaceId' in record) { const saved = await team.save(next, record.version); if (cloudCase?.id === saved.id) setCloudCase({ id: saved.id, workspaceId: saved.workspaceId, version: saved.version }); }
      else storeDeviceCase(next);
      setNotice(next.archived ? 'Enquiry archived. You can restore it from the enquiry book.' : 'Enquiry restored.');
    } catch (cause) { throw new Error((cause as Error).message); }
  }
  async function completeFollowUp(record: BookingCase | TeamCase) {
    if (!record.session.followUp) return;
    const next = { ...record, updatedAt: new Date().toISOString(), session: { ...record.session, followUp: { ...record.session.followUp, done: true } } };
    if ('workspaceId' in record) {
      const saved = await team.save(next, record.version);
      if (cloudCase?.id === saved.id && cloudCase.workspaceId === saved.workspaceId) { setCloudCase({id:saved.id,workspaceId:saved.workspaceId,version:saved.version}); if (followUp?.dueDate === record.session.followUp.dueDate && followUp.note === record.session.followUp.note) setFollowUp({...followUp,done:true}); }
    } else { storeDeviceCase(next); if (activeCaseId === record.id && followUp?.dueDate === record.session.followUp.dueDate && followUp.note === record.session.followUp.note) setFollowUp({...followUp,done:true}); }
  }
  function applyAssistantAction(action: StaffAction, replace: boolean) {
    const result = applyStaffAction({notes,followUp}, action, replace);
    setNotes(result.notes); setFollowUp(result.followUp); setNotice('Next step added to your draft. Save the enquiry to keep it in your planner.');
  }
  async function reopenJSON(raw: string) {
    try {
      const imported = importCase(raw); const session = imported.session;
      if (session.messages.some(message => message.speaker === 'customer')) analysisPayload(session.messages, session.brief, session.referenceDate || referenceDate || null);
      reset(); setCaseName(imported.title); setNotes(imported.notes); setFollowUp(session.followUp ?? null); setGuestCare(session.guestCare ?? emptyGuestCare()); setGuestCareEvidence(session.guestCareEvidence??[]); setMessages(session.messages); setBrief(session.brief); setReferenceDate(session.referenceDate || today()); setManualMode(session.manualMode ?? false); setJsonInput('');
      if (session.messages.some(message => message.speaker === 'customer') && !session.manualMode) await analyse(session.messages, session.brief, session.referenceDate || today());
      else { setPendingAnalysis(false); setNotice('Brief reopened. Review the saved staff details before approving it.'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This file could not be reopened.'); }
  }
  async function changeTranscript(nextMessages: Message[]) {
    const next = rebuildForTranscriptChange(brief);
    try { if (nextMessages.some(message => message.speaker === 'customer')) analysisPayload(nextMessages, next, referenceDate || null); } catch (cause) { setError((cause as Error).message); return; }
    setUndoSnapshot(snapshot());
    setMessages(nextMessages); setBrief(next); setEditingMessage(null); setSelectedField(null); setError(null);
    if (!manualMode) await analyse(nextMessages, next); else { setPendingAnalysis(false); setNotice('Conversation corrected. Review the details against the updated messages.'); }
  }
  function undoTranscript() {
    if (!undoSnapshot) return;
    requestRef.current.id++; requestRef.current.controller?.abort(); setBusy(false);
    setMessages(undoSnapshot.messages); setBrief({ ...undoSnapshot.brief, approvedRevision: null }); setPendingAnalysis(undoSnapshot.pendingAnalysis ?? false); setManualMode(undoSnapshot.manualMode ?? false); setUndoSnapshot(null); setError(null); setNotice('Conversation change undone. Review the restored brief.');
  }
  function startManualReview() { requestRef.current.id++; requestRef.current.controller?.abort(); setBusy(false); setBrief(rebuildForTranscriptChange(brief)); setPendingAnalysis(false); setManualMode(true); setError(null); setNotice('Manual review is on. Enter or confirm each detail using its edit button. New customer messages will ask you to review them again.'); }
  function keepEditedValue(field: FieldKey) { try { setBrief(resolveFieldReview(brief, field, 'staff')); setNotice(`${fieldLabels[field]} reviewed. Your chosen value is kept.`); } catch (cause) { setError((cause as Error).message); } }
  function storeBookingLink(link: BookingLink) {
    try { const next = [...bookingLinks.filter(item => venueKey(item.restaurantName, item.city) !== venueKey(link.restaurantName, link.city)), link].slice(-20); localStorage.setItem(BOOKING_LINKS_KEY, JSON.stringify(next)); setBookingLinks(next); setDialog(null); setNotice('Booking page saved for this restaurant.'); } catch { setError('This browser could not save the booking page.'); }
  }

  return <div className="app-shell">
    <a href="#conversation-title" className="skip-link">Skip to workspace</a>
    <header className="topbar">
      <a className="brand" href="/" aria-label="FormBridge booking workspace"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span>Form<span className="brand-accent">Bridge</span></span></a>
      <span className="topbar-label"><Utensils size={13} /> Restaurant booking desk</span>
      <div className="topbar-right"><span className="session-badge"><span /> {busy ? 'Updating brief' : storageIssue ? 'Draft not saved' : hydrated ? 'Saved in this tab' : 'Opening workspace'}</span><button className="button topbar-new" aria-label="New brief" disabled={!hydrated} onClick={() => startNew()}><Plus size={15} /><span>New brief</span></button><button type="button" className="icon-button" aria-label="How FormBridge works" onClick={() => setDialog('help')}><CircleHelp size={19} /></button></div>
    </header>
    <main className="content-wrap">
      <section className={`page-heading ${messages.length ? 'working' : ''}`}>
        <div className="heading-copy"><p className="page-overline"><span /> Restaurant booking desk · Human review</p><h1>Turn a changing conversation into <em>an accurate booking brief.</em></h1><p>Every detail stays linked to its message. Missing information becomes a question, never a guess.</p><div className="heading-actions"><button className="button hero-primary" disabled={!hydrated || busy} onClick={focusConversation}>{messages.length ? 'Continue conversation' : 'Start an enquiry'} <ArrowRight size={15} /></button><button className="button hero-secondary" disabled={!hydrated} onClick={() => startNew(true)}>Try an example</button></div></div>
        <TableSetting />
      </section>
      <nav className="desk-nav" aria-label="Booking desk tools"><div><button className="desk-tool" onClick={() => setDialog('cases')} disabled={!hydrated}><BookOpen size={18} /><span>Enquiry book</span><kbd>⌘ K</kbd></button><button className="desk-tool" onClick={()=>setDialog('planner')} disabled={!hydrated}><CalendarDays size={18}/><span>Service planner</span></button><button className="desk-tool" onClick={() => setDialog('assistant')} disabled={!hydrated || busy}><MessageSquareText size={18} /><span>Desk assistant</span></button><a className="desk-tool" href="/team"><Users size={18} /><span>{team.workspace?.name || 'Team workspace'}</span>{team.user && <span className="connected-dot" aria-label="Signed in" />}</a></div><button className="button primary" onClick={() => { setError(null); setCaseName(caseName || caseTitle(snapshot())); setCaseDestination(cloudCase && cloudCase.workspaceId === team.workspaceId ? 'team' : 'device'); setDialog('save'); }} disabled={!hydrated || !hasContent || busy}><Save size={15} /> Save enquiry</button></nav>
      {caseName && <div className="active-case-heading"><BookOpen size={15} /><span>{caseName}</span><small>{cloudCase ? team.workspace?.id === cloudCase.workspaceId ? team.workspace.name : 'Team enquiry' : activeCaseId ? 'Device enquiry' : 'Draft enquiry'}</small></div>}
      <div className={`workspace-status ${isApproved ? 'approved' : ''}`} aria-label="Booking completeness">
        <span className="status-icon"><ShieldCheck size={20} /></span><div><strong>{isCancelled ? 'Booking enquiry cancelled' : isApproved ? 'Reviewed and ready for handoff' : messages.length ? brief.fields.restaurantName.value ?? 'Your booking enquiry' : 'A fresh start for your next enquiry'}</strong><p>{busy ? 'Reading the conversation and checking each detail…' : pendingAnalysis ? 'An update needs to finish before you can approve this brief.' : isCancelled ? 'Extracted details cleared · Start a new brief for another enquiry' : isApproved ? 'All five details reviewed · Download the brief for your team' : `${resolvedCount} of 5 details ready${resolvedCount === 5 ? ' · Review before handoff' : ' · We’ll keep track of what still needs an answer'}`}</p></div>
        <div className="detail-steps" aria-label={`${resolvedCount} of 5 details ready`}>{FIELD_KEYS.map((k) => <span key={k} className={brief.fields[k].status === 'resolved' ? 'done' : ''} aria-label={`${fieldLabels[k]}: ${brief.fields[k].status === 'resolved' ? 'ready' : 'needs an answer'}`}>{brief.fields[k].status === 'resolved' ? <Check size={11} /> : <Circle size={9} />}{fieldLabels[k]}</span>)}</div>
      </div>
      {error && !editingField && <div className="alert error" role="alert"><CircleHelp size={18} /><span>{error}</span>{pendingAnalysis && <button className="text-button" onClick={() => analyse(messages, brief)} disabled={busy}>Retry update <RotateCcw size={14} /></button>}<button className="icon-button" aria-label="Dismiss error" onClick={() => setError(null)}><X size={16} /></button></div>}
      {pendingAnalysis && !busy && <div className="pending-update" role="status"><div><strong>This brief needs another check.</strong><p>Your conversation is kept. Retry, correct a message or review the details manually.</p></div><button className="button compact primary" onClick={() => analyse(messages, brief)}><RotateCcw size={15} /> Retry analysis</button><button className="button compact subtle" onClick={startManualReview}>Review manually</button></div>}
      {manualMode && <div className="manual-review-bar"><Pencil size={15} /><span>Manual review · Confirm each detail against the conversation.</span><button className="text-button" disabled={busy || !messages.some(message => message.speaker === 'customer')} onClick={() => analyse(messages, brief)}>Use automatic analysis <ArrowRight size={14} /></button></div>}
      {undoSnapshot && <div className="undo-bar"><span>Conversation edited</span><button className="text-button" onClick={undoTranscript}><RotateCcw size={14} /> Undo conversation change</button></div>}
      {notice && <div className="alert notice" role="status"><Check size={18} /><span>{notice}</span><button className="icon-button" aria-label="Dismiss notice" onClick={() => setNotice(null)}><X size={16} /></button></div>}
      <div className="mobile-tabs" aria-label="Workspace view"><button aria-pressed={mobileView === 'conversation'} onClick={() => setMobileView('conversation')}>Conversation <span>{messages.length}</span></button><button aria-pressed={mobileView === 'brief'} onClick={() => setMobileView('brief')}>Booking brief <span>{resolvedCount}/5</span></button></div>
      <div className="workspace-grid" data-mobile-view={mobileView}>
        <div className="conversation-column">
        <section className="panel conversation-panel" aria-labelledby="conversation-title">
          <div className="panel-heading"><div className="panel-title-group"><span className="section-icon"><MessageSquareText size={18} /></span><div><h2 id="conversation-title">Conversation</h2><p>{messages.length ? `${messages.length} ${messages.length === 1 ? 'message' : 'messages'} · Customer and staff` : 'Every good welcome starts here'}</p></div></div><button className="button compact subtle" onClick={() => setDialog('paste')} disabled={!hydrated || busy}><Upload size={15} /> Paste conversation</button></div>
          <div ref={conversationRef} className={`conversation-list ${!messages.length ? 'empty' : ''}`} aria-live="polite">
            {!messages.length ? <div className="conversation-empty"><div className="empty-illustration" aria-hidden="true"><span className="empty-bubble">A table for four, please.</span><span className="empty-detail"><Check size={14} /> 4 guests</span><span className="empty-link"><Link2 size={15} /></span></div><h3>It starts with a conversation.</h3><p>Add an enquiry below or paste a conversation.<br />We’ll gather the details as you go.</p><button className="text-button" disabled={!hydrated} onClick={() => setDialog('paste')}>Paste your conversation <ArrowRight size={15} /></button></div> : messages.map((m, index) => <article id={`message-${m.id}`} key={m.id} tabIndex={-1} aria-label={`${m.speaker === 'customer' ? 'Customer' : 'Staff'} message ${index + 1}`} className={`message-row ${m.speaker} ${selectedEvidence.has(m.id) ? 'evidence-active' : ''}`}><div className={`message-avatar ${m.speaker}`}>{m.speaker === 'customer' ? 'C' : 'S'}</div><div className="message-main"><div className="message-meta"><strong>{m.speaker === 'customer' ? 'Customer' : 'Staff'}</strong><span>{String(index + 1).padStart(2, '0')}</span><button className="message-edit icon-button" aria-label={`Edit message ${index + 1}`} disabled={busy} onClick={() => { setEditingMessage({ ...m }); setError(null); }}><Pencil size={13} /></button>{selectedEvidence.has(m.id) && <em><Link2 size={11} /> Source</em>}</div><p className="message-text">{m.text}</p></div></article>)}
          </div>
          <div className="composer"><div className="composer-head"><div className="speaker-switch" role="group" aria-label="Message speaker"><button aria-pressed={speaker === 'customer'} className={speaker === 'customer' ? 'selected' : ''} onClick={() => setSpeaker('customer')}>Customer</button><button aria-pressed={speaker === 'staff'} className={speaker === 'staff' ? 'selected' : ''} onClick={() => setSpeaker('staff')}>Staff</button></div><span className="composer-count">{draft.length}/1,000</span></div><label className="sr-only" htmlFor="message-input">New message</label><textarea id="message-input" ref={composerRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={speaker === 'customer' ? 'What did the customer say?' : 'Add your question or suggestion…'} rows={3} maxLength={1000} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addMessage(); } }} />
            <div className="composer-footer"><button className="text-button" disabled={!hydrated || busy || messages.length >= 30} onClick={()=>setDialog('voice')}><Mic size={15}/> Voice message</button><span className="composer-shortcut">⌘ / Ctrl + Enter</span><button className="button primary" onClick={addMessage} disabled={!hydrated || !draft.trim() || busy || messages.length >= 30}>{busy ? <LoaderCircle className="spin" size={16} /> : <Send size={15} />} {busy ? 'Updating brief…' : speaker === 'customer' ? 'Add to brief' : 'Add staff message'}</button></div>
            <div className="date-context"><label htmlFor="conversation-date">Conversation date</label><input id="conversation-date" type="date" value={referenceDate} onInput={(e) => changeDate(e.currentTarget.value)} disabled={!hydrated || busy} aria-describedby="date-hint" /><span id="date-hint">For “today” and “tomorrow”</span></div>
          </div>
        </section>
        {brief.history.length > 0 && <details className="change-card"><summary><History size={16} /><span>What changed</span><span className="change-count">{brief.history.length} {brief.history.length === 1 ? 'update' : 'updates'}</span><ArrowRight className="change-arrow" size={15} /></summary><div className="change-list">{[...brief.history].reverse().slice(0, 5).map((change) => <div className="change-item" key={change.revision}><span className="change-track" /><strong>{fieldLabels[change.field]}</strong><p>{change.previousValue && <><s>{change.previousValue}</s><ArrowRight size={13} /></>}{change.nextValue ?? (change.operation === 'constrain' ? 'Needs an exact answer' : 'Cleared')}</p><span className="change-revision">#{change.revision}</span></div>)}</div></details>}
        </div>
        <section className={`panel brief-panel ${busy ? 'updating' : ''}`} aria-labelledby="brief-title" aria-busy={busy}>
          <div className="brief-letterhead"><span><Utensils size={12} /> PREPARED WITH FORMBRIDGE</span><button className="text-button" disabled={!hydrated} onClick={() => startNew()}><Plus size={13} /> New brief</button></div>
          <div className="panel-heading"><div className="panel-title-group"><div><h2 id="brief-title">Booking brief</h2><p>The details behind a warm welcome</p></div></div><span className={`draft-status ${isApproved ? 'approved' : ''}`}>{isApproved ? <CheckCheck size={14} /> : <span />}{isApproved ? 'Approved' : 'Draft'}</span></div>
          <BookingCard brief={brief} messages={messages} selectedField={selectedField} onSelect={setSelectedField} onViewSource={(id) => { setMobileView('conversation'); requestAnimationFrame(() => { const message = document.getElementById(`message-${id}`); message?.focus({ preventScroll: true }); message?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }); }); }} onEdit={(k) => { setSelectedField(k); setEditingField(k); setEditValue(brief.fields[k].value ?? ''); setError(null); }} onUseConversation={useConversation} onKeepEdit={keepEditedValue} busy={!hydrated || busy} />
          <div className={`clarification-box ${resolvedCount === 5 || isCancelled ? 'complete' : ''}`}><div className="clarification-icon">{resolvedCount === 5 || isCancelled ? <Check size={18} /> : <CircleHelp size={18} />}</div><div><span>{busy ? 'Reading the conversation' : pendingAnalysis ? 'Update needs attention' : isCancelled ? 'Enquiry cancelled' : isApproved ? 'Reviewed brief' : resolvedCount === 5 ? 'Ready for your review' : needsStaffReview ? 'Review the change' : 'Ask the customer'}</span><p>{busy ? 'We’re checking what changed and linking each detail to its source.' : pendingAnalysis ? 'Retry the update above to bring this brief up to date.' : isCancelled ? CANCELLATION_NOTICE : isApproved ? 'Your brief is ready for staff handoff. Download a copy for your team.' : clarification ?? 'All five details are ready. Check the sources, then approve the brief.'}</p></div>{clarification && !needsStaffReview && !busy && !pendingAnalysis && <button className="icon-button" aria-label="Copy clarification question" onClick={copyQuestion}><Copy size={16} /></button>}</div>
          <div className="brief-actions"><button className="button approve" onClick={approve} disabled={resolvedCount !== 5 || busy || pendingAnalysis}>{isApproved ? <CheckCheck size={17} /> : <ShieldCheck size={17} />}{isApproved ? 'Brief approved' : 'Approve brief'}</button><div className="export-actions"><button className="button export" onClick={() => downloadDraft('text')} disabled={!messages.length && resolvedCount === 0}><Download size={16} /> Download {isApproved ? 'brief' : 'draft'}</button><button className="button export json-export" onClick={() => downloadDraft('json')} disabled={!messages.length && resolvedCount === 0} aria-label="Download brief as JSON">JSON</button></div></div>
          <p className="approval-disclaimer">A booking brief for staff review. No table is reserved.</p>
          <div className="handoff-tools"><span>For the next step</span><button className="text-button" disabled={!brief.fields.restaurantName.value || busy} onClick={() => { setError(null); setDialog('booking-link'); }}><Link2 size={14} /> {bookingLink ? 'Edit booking page' : 'Add booking page'}</button>{isApproved && <div>{bookingLink && <a className="button compact primary" href={bookingLink.url} target="_blank" rel="noopener noreferrer">Open booking page <ExternalLink size={14} /></a>}<button className="button compact subtle" onClick={() => { try { downloadFile(calendarExport(snapshot()), 'formbridge-enquiry.ics', 'text/calendar;charset=utf-8'); setNotice('Calendar reminder prepared. Its time follows your calendar’s local time zone.'); } catch (cause) { setError((cause as Error).message); } }}><CalendarPlus size={15} /> Calendar reminder</button></div>}</div>
        </section>
      </div>
      <div className="guest-care-summary"><div><Heart size={17}/><span><strong>{guestCare.name || 'Care beyond the booking.'}</strong><small>{[guestCare.dietary && 'Dietary request', guestCare.seating && 'Seating preference', guestCare.occasion].filter(Boolean).join(' · ') || 'Guest details, preferences and the next step.'}</small></span></div>{followUp && <span className="follow-up-badge"><CalendarClock size={14}/>{followUp.done ? 'Follow-up complete' : `Follow up ${followUp.dueDate}`}</span>}<button className="button compact subtle" disabled={!hydrated} onClick={()=>setDialog('guest-care')}>Guest care & follow-up <ArrowRight size={14}/></button></div><details className="staff-notes"><summary><Pencil size={15} /> Notes for the next shift <span>{notes ? 'Note added' : 'Optional'}</span></summary><label className="sr-only" htmlFor="staff-notes">Staff handoff notes</label><textarea id="staff-notes" rows={3} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Add something your team should know. These notes stay separate from the customer’s booking details." /><small>Included when you save or download the enquiry.</small></details>
      <footer className="page-footer"><span className="footer-brand"><ShieldCheck size={14} /> Clear details. Human decisions.</span><span>Your active draft stays in this tab. Save enquiries to this device or your private team. Text is analysed with OpenAI.</span></footer>
    </main>
    {dialog === 'paste' && <TranscriptImport onClose={() => setDialog(null)} onImport={importMessages} hasDraft={messages.length > 0 || brief.revision > 0} />}
    {dialog === 'voice' && <VoiceDialog speaker={speaker} onClose={()=>setDialog(null)} onUse={text=>{setDraft(text);setDialog(null);focusConversation();setNotice('Voice transcript placed in your composer. Review it before adding it to the conversation.');}}/>}
    {dialog === 'guest-care' && <GuestCareDialog care={guestCare} messages={messages} evidence={guestCareEvidence} followUp={followUp} today={today()} onClose={()=>setDialog(null)} onSave={(care,task,evidence)=>{setGuestCare(care);setGuestCareEvidence(evidence);setFollowUp(task);setDialog(null);setNotice('Guest care kept in your draft. Save the enquiry to update your planner.');}}/>}
    {dialog === 'planner' && <ServicePlanner deviceCases={deviceCases} teamCases={team.cases} teamName={team.workspace?.name || null} today={today()} loading={team.loading} onOpen={requestOpen} onComplete={completeFollowUp} onClose={()=>setDialog(null)}/> }
    {dialog === 'cases' && <CaseLibrary deviceCases={deviceCases} teamCases={team.cases} teamName={team.workspace?.name || null} loading={team.loading} onOpen={requestOpen} onArchive={archiveCase} onReopen={() => { setError(null); setJsonInput(''); setDialog('reopen'); }} onRefresh={() => { try { setDeviceCases(readCases(localStorage.getItem(CASES_KEY))); } catch { setError('Device cases could not be read.'); } team.refreshCases().catch(cause => setError(cause.message)); }} onClose={() => setDialog(null)} />}
    {dialog === 'save' && <Dialog title="Save this enquiry." description="Give it a useful name so the next shift can pick up where you left off." onClose={() => { if (!saving) setDialog(null); }}><form onSubmit={event => { event.preventDefault(); saveCurrentCase(); }}><label className="input-label" htmlFor="case-name">Enquiry name</label><input className="edit-input" id="case-name" value={caseName} maxLength={80} onChange={event => setCaseName(event.target.value)} placeholder="Juniper · Saturday dinner" required /><label className="input-label" htmlFor="case-location">Save to</label><select className="edit-input" id="case-location" value={caseDestination} onChange={event => setCaseDestination(event.target.value as 'device' | 'team')}><option value="device">This device</option>{team.workspace && <option value="team">{team.workspace.name} · Shared with team</option>}</select>{pendingAnalysis && <p className="dialog-hint">The latest update is unfinished. It will be saved with your draft so you can retry later.</p>}{error && <p className="dialog-error" role="alert">{error}</p>}<div className="dialog-actions"><button className="button subtle" type="button" onClick={() => setDialog(null)} disabled={saving}>Cancel</button><button className="button primary" disabled={saving || !caseName.trim()}>{saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}{saving ? 'Saving enquiry…' : 'Save enquiry'}</button></div></form></Dialog>}
    {dialog === 'team' && <TeamDialog team={team} onClose={() => setDialog(null)} onSignedOut={() => { reset(); setNotice('Signed out. The active desk has been cleared.'); }} />}
    {dialog === 'assistant' && <AssistantDialog messages={messages} brief={brief} referenceDate={referenceDate} pendingAnalysis={pendingAnalysis} today={today()} notes={notes} followUp={followUp} guestCare={guestCare} onApply={applyAssistantAction} onClose={() => setDialog(null)} onSource={viewSource} onUseReply={text => { setDraft(text); setSpeaker('staff'); setDialog(null); focusConversation(); setNotice('Reply placed in the staff composer. Review it before adding it to the conversation.'); }} />}
    {dialog === 'booking-link' && <BookingLinkDialog name={brief.fields.restaurantName.value || ''} city={brief.fields.city.value || ''} current={bookingLink} onSave={storeBookingLink} onClose={() => setDialog(null)} />}
    {dialog === 'export' && <Dialog title={pendingAnalysis || busy ? 'Download an unfinished draft?' : 'Download a draft for review?'} description={pendingAnalysis || busy ? 'The brief has not caught up with the latest messages. The downloaded file will clearly mark that update as unfinished.' : 'Some details still need review. This file will be marked as a draft.'} onClose={() => setDialog(null)}><div className="dialog-actions"><button className="button subtle" onClick={() => setDialog(null)}>Keep reviewing</button><button className="button primary" onClick={() => { downloadDraft(exportFormat, true); setDialog(null); }}>Download draft <Download size={15} /></button></div></Dialog>}
    {dialog === 'open-case' && requestedCase && <Dialog title={`Open ${requestedCase.title}?`} description="Your active draft will be replaced. You can keep a copy on this device first." onClose={() => setDialog(null)}>{error && <p className="dialog-error" role="alert">{error}</p>}<div className="dialog-actions"><button className="button subtle" onClick={saveBeforeOpening}><Save size={15} /> Save current and open</button><button className="button primary" onClick={() => loadCase(requestedCase)}>Open enquiry <ArrowRight size={15} /></button></div></Dialog>}
    {dialog === 'reopen' && <Dialog wide title="Reopen a saved brief." description="Choose a FormBridge JSON file. Conversation details will be checked again before approval." onClose={() => setDialog(null)}>{hasContent && <p className="dialog-hint">This replaces the active draft. Save your enquiry first if you want to keep it.</p>}<label className="file-picker" htmlFor="case-file"><Upload size={22} /><strong>Choose your brief</strong><span>FormBridge JSON · up to 250 KB</span><input id="case-file" type="file" accept=".json,application/json" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 250_000) { setError('Choose a JSON file below 250 KB.'); return; } await reopenJSON(await file.text()); }} /></label><details className="json-paste"><summary>Or paste the file contents</summary><label className="sr-only" htmlFor="json-input">Saved JSON brief</label><textarea id="json-input" rows={5} value={jsonInput} onChange={event => setJsonInput(event.target.value)} maxLength={250000} /><button className="button primary" disabled={!jsonInput.trim()} onClick={() => reopenJSON(jsonInput)}>Reopen brief <ArrowRight size={15} /></button></details>{error && <p className="dialog-error" role="alert">{error}</p>}</Dialog>}
    {(dialog === 'new' || dialog === 'example') && <Dialog title={dialog === 'new' ? 'Start a fresh brief?' : 'Open the example?'} description="Your current brief will be replaced. Download the draft if you want to keep it." onClose={() => setDialog(null)}><div className="dialog-actions"><button className="button subtle" onClick={() => downloadDraft('text', true)}><Download size={15} /> Download draft</button><button className="button primary" onClick={() => reset(dialog === 'example')}>{dialog === 'example' ? 'Open example' : 'Start fresh'} <ArrowRight size={15} /></button></div></Dialog>}
    {dialog === 'help' && <Dialog title="A clearer handoff, in three steps." onClose={() => setDialog(null)}><ol className="help-steps"><li><strong>Add the conversation</strong><p>Enter customer and staff messages, or paste a whole conversation.</p></li><li><strong>Review the details</strong><p>Click a detail to see its source. Changes are tracked, and unanswered questions stay visible.</p></li><li><strong>Approve and share the brief</strong><p>Edit anything that needs a correction, then download the brief for your team. FormBridge never reserves a table.</p></li></ol><button className="button primary full-width" onClick={() => setDialog(null)}>Back to the workspace <ArrowRight size={16} /></button></Dialog>}
    {editingField && <Dialog title={`Edit ${fieldLabels[editingField].toLowerCase()}`} description="Your edit is kept when new messages arrive. You can return to the conversation’s value at any time." onClose={() => { setEditingField(null); setError(null); }}><label className="input-label" htmlFor="edit-input">{fieldLabels[editingField]}</label><input className="edit-input" id="edit-input" autoFocus value={editValue} type={editingField === 'partySize' ? 'number' : 'text'} min={editingField === 'partySize' ? 1 : undefined} max={editingField === 'partySize' ? 30 : undefined} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); }} />{error && <p className="dialog-error" role="alert">{error}</p>}<div className="dialog-actions"><button className="button subtle" onClick={() => { setEditingField(null); setError(null); }}>Cancel</button><button className="button primary" onClick={saveEdit}>Save detail <Check size={16} /></button></div></Dialog>}
    {editingMessage && <Dialog title="Correct this message." description="The brief will be rebuilt from the updated conversation. Staff edits will need another review." onClose={() => { setEditingMessage(null); setError(null); }}><label className="input-label" htmlFor="message-speaker">Speaker</label><select className="edit-input" id="message-speaker" value={editingMessage.speaker} onChange={event => setEditingMessage({ ...editingMessage, speaker: event.target.value as Speaker })}><option value="customer">Customer</option><option value="staff">Staff</option></select><label className="input-label" htmlFor="message-edit-text">Message</label><textarea className="import-input" id="message-edit-text" rows={5} maxLength={1000} value={editingMessage.text} onChange={event => setEditingMessage({ ...editingMessage, text: event.target.value })} />{error && <p className="dialog-error" role="alert">{error}</p>}<div className="dialog-actions"><button className="button subtle danger-text" onClick={() => changeTranscript(messages.filter(message => message.id !== editingMessage.id))}><Trash2 size={15} /> Delete message</button><button className="button primary" disabled={!editingMessage.text.trim()} onClick={() => { const updated = { ...editingMessage, text: editingMessage.text.trim() }; const previous = messages.find(message => message.id === updated.id); if (previous?.text === updated.text && previous.speaker === updated.speaker) { setEditingMessage(null); return; } changeTranscript(messages.map(message => message.id === updated.id ? updated : message)); }}>Save message <Check size={15} /></button></div></Dialog>}
  </div>;
}
