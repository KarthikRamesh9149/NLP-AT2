'use client';
import { useMemo, useState } from 'react';
import { Archive, ArrowRight, BookOpen, Check, Clock3, FolderOpen, RefreshCw, Search, Upload } from 'lucide-react';
import { type BookingCase } from '@/lib/cases';
import { FIELD_KEYS } from '@/lib/state';
import { isCancelledBooking } from '@/lib/cancellation-status';
import type { TeamCase } from '@/hooks/use-team';
import { Dialog } from './dialog';

export function caseStatus(record: BookingCase): string {
  const { brief, messages, pendingAnalysis } = record.session;
  if (record.archived) return 'Archived';
  if (pendingAnalysis) return 'Update unfinished';
  if (isCancelledBooking(brief, messages)) return 'Cancelled';
  if (brief.approvedRevision === brief.revision) return 'Approved';
  if (FIELD_KEYS.every(key => brief.fields[key].status === 'resolved' && !brief.fields[key].review)) return 'Ready for review';
  return 'Needs details';
}
export function CaseLibrary({ deviceCases, teamCases, teamName, loading, onOpen, onArchive, onReopen, onRefresh, onClose }: { deviceCases: BookingCase[]; teamCases: TeamCase[]; teamName: string | null; loading: boolean; onOpen: (record: BookingCase | TeamCase) => void; onArchive: (record: BookingCase | TeamCase) => Promise<void>; onReopen: () => void; onRefresh: () => void; onClose: () => void }) {
  const [scope, setScope] = useState<'device' | 'team'>(teamName ? 'team' : 'device');
  const [query, setQuery] = useState(''); const [archived, setArchived] = useState(false);
  const [acting, setActing] = useState(''); const [error, setError] = useState('');
  async function archive(record: BookingCase | TeamCase) { setActing(record.id); setError(''); try { await onArchive(record); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The enquiry could not be updated. Please retry.'); } finally { setActing(''); } }
  const records = useMemo(() => (scope === 'team' ? teamCases : deviceCases).filter(record => record.archived === archived && `${record.title} ${record.notes} ${Object.values(record.session.brief.fields).map(field => field.value || field.constraint || '').join(' ')}`.toLowerCase().includes(query.toLowerCase())), [scope, deviceCases, teamCases, query, archived]);
  return <Dialog wide title="The enquiry book." description="A clear handoff for every guest, from the first question to the next shift." onClose={onClose}>
    <div className="case-library-toolbar"><div className="library-tabs" role="group" aria-label="Saved enquiry location"><button aria-pressed={scope === 'device'} onClick={() => setScope('device')}>This device</button>{teamName && <button aria-pressed={scope === 'team'} onClick={() => setScope('team')}>{teamName}</button>}</div><button className="icon-button" aria-label="Refresh saved enquiries" onClick={onRefresh} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={17} /></button></div>
    <div className="case-search"><Search size={17} /><label className="sr-only" htmlFor="case-search">Search saved enquiries</label><input id="case-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a restaurant, date or note…" /><button aria-pressed={archived} className={`button compact ${archived ? 'primary' : 'subtle'}`} onClick={() => setArchived(!archived)}><Archive size={14} /> Archived</button></div>
    <div className="case-list" aria-live="polite">{loading && scope === 'team' ? <div className="case-skeleton" aria-label="Loading saved enquiries"><span /><span /><span /></div> : records.length ? records.map(record => { const state = caseStatus(record); const fields = record.session.brief.fields; return <article className="case-ticket" key={record.id}><span className="case-date"><small>{fields.date.value ? 'ENQUIRY DATE' : 'DATE NEEDED'}</small><strong>{fields.date.value || 'To be agreed'}</strong><span>{fields.time.value || fields.time.constraint || 'Time to confirm'}</span></span><div className="case-ticket-main"><h3>{record.title}</h3><p>{fields.city.value || 'City to confirm'}<span>·</span>{fields.partySize.value ? `${fields.partySize.value} guests` : 'Guests to confirm'}</p><span className={`case-state ${state === 'Approved' ? 'approved' : ''}`}>{state === 'Approved' ? <Check size={12} /> : <Clock3 size={12} />}{state}</span></div><div className="case-ticket-actions"><button className="button compact subtle" onClick={() => onOpen(record)}>Open <ArrowRight size={14} /></button><button className="icon-button" aria-label={`${record.archived ? 'Restore' : 'Archive'} ${record.title}`} disabled={!!acting} onClick={() => archive(record)}>{record.archived ? <FolderOpen size={16} /> : <Archive size={16} />}</button></div></article>; }) : <div className="library-empty"><BookOpen size={30} /><h3>{query ? 'No matching enquiries.' : archived ? 'Nothing archived yet.' : 'Your next enquiry belongs here.'}</h3><p>{query ? 'Try another restaurant name, date or note.' : 'Save a brief from the booking desk, or reopen a downloaded JSON file.'}</p></div>}</div>
    {error && <p className="dialog-error" role="alert">{error}</p>}<div className="library-footer"><span>{records.length} {records.length === 1 ? 'enquiry' : 'enquiries'}{scope === 'device' ? ' · Kept in this browser' : ' · Private to your team'}</span><button className="button compact subtle" onClick={onReopen}><Upload size={15} /> Reopen JSON</button></div>
  </Dialog>;
}
