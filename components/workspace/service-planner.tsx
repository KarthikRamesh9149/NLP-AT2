'use client';
import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Copy, Download, LoaderCircle } from 'lucide-react';
import type { BookingCase } from '@/lib/cases';
import type { TeamCase } from '@/hooks/use-team';
import { buildServicePlan, enquiryDate, knownGuestCount, shiftHandoff } from '@/lib/service-planner';
import { caseStatus } from '@/lib/case-status';
import { downloadFile } from '@/lib/exports';
import { Dialog } from './dialog';
import { validIsoDate } from '@/lib/temporal';

export function ServicePlanner({ deviceCases, teamCases, teamName, today, loading, onOpen, onComplete, onClose }: {
  deviceCases: BookingCase[]; teamCases: TeamCase[]; teamName: string | null; today: string; loading: boolean;
  onOpen: (record: BookingCase | TeamCase) => void; onComplete: (record: BookingCase | TeamCase) => Promise<void>; onClose: () => void;
}) {
  const [scope, setScope] = useState<'device' | 'team'>(teamName ? 'team' : 'device');
  const [date, setDate] = useState(today); const [tab, setTab] = useState<'service' | 'follow-ups'>('service');
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [acting, setActing] = useState('');
  const plan = useMemo(() => buildServicePlan(scope === 'team' ? teamCases : deviceCases, date, today), [scope, teamCases, deviceCases, date, today]);
  const savedDates = useMemo(()=>[...new Set((scope === 'team' ? teamCases : deviceCases).filter(record=>!record.archived).map(enquiryDate).filter((value):value is string=>!!value))].sort().filter(value=>value>=today).slice(0,5),[scope,teamCases,deviceCases,today]);
  function move(days: number) { const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate()+days); const value=next.toISOString().slice(0,10); if(validIsoDate(value))setDate(value); }
  async function complete(record: BookingCase | TeamCase) {
    setActing(record.id); setError('');
    try { await onComplete(record); setNotice('Follow-up marked complete.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The follow-up could not be saved. Please retry.'); }
    finally { setActing(''); }
  }
  const open = (record: BookingCase) => onOpen(record);
  const dayLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-AU', { timeZone: 'UTC', weekday:'long', day:'numeric', month:'long', year:'numeric' });
  return <Dialog wide title="A calmer service starts here." description="Saved enquiries, next steps and a handoff the whole shift can follow." onClose={onClose}>
    <div className="planner-top"><div className="library-tabs" role="group" aria-label="Planner location"><button aria-pressed={scope === 'device'} onClick={()=>setScope('device')}>This device</button>{teamName && <button aria-pressed={scope === 'team'} onClick={()=>setScope('team')}>{teamName}</button>}</div><span className="planner-scope">{scope === 'team' ? 'Private team enquiries' : 'Saved in this browser'}</span></div>
    {tab === 'service' && <><div className="planner-date"><button className="icon-button" aria-label="Previous service day" disabled={date==='0001-01-01'} onClick={()=>move(-1)}><ChevronLeft size={18}/></button><label><span>Service date</span><input aria-label="Service date" type="date" min="0001-01-01" max="9999-12-31" value={date} onInput={event=>{if(validIsoDate(event.currentTarget.value))setDate(event.currentTarget.value);}} onChange={event=>{if(validIsoDate(event.target.value)) setDate(event.target.value);}}/></label><button className="icon-button" aria-label="Next service day" disabled={date==='9999-12-31'} onClick={()=>move(1)}><ChevronRight size={18}/></button><button className="text-button" onClick={()=>setDate(today)}>Today</button></div>
    {savedDates.length>0 && <div className="planner-shortcuts" aria-label="Upcoming service dates"><span>Coming up</span>{savedDates.map(value=><button key={value} className="text-button" aria-pressed={date===value} onClick={()=>setDate(value)}>{new Date(`${value}T12:00:00Z`).toLocaleDateString('en-AU',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'})}</button>)}</div>}
    <div className="planner-letterhead"><CalendarDays size={23}/><div><p>THE SERVICE DESK</p><h3>{dayLabel}</h3></div><span>{plan.service.length} {plan.service.length===1 ? 'enquiry' : 'enquiries'}<br/>{plan.knownGuests} known {plan.knownGuests===1 ? 'guest' : 'guests'}</span></div>
    </>}
    {tab === 'follow-ups' && <div className="planner-letterhead"><CalendarDays size={23}/><div><p>THE NEXT STEPS</p><h3>Pick up where you left off.</h3></div><span>{plan.followUps.filter(item=>item.overdue).length} overdue<br/>{plan.followUps.filter(item=>item.record.session.followUp!.dueDate===today).length} due today</span></div>}
    <div className="planner-tabs" role="group" aria-label="Planner view"><button aria-pressed={tab === 'service'} onClick={()=>setTab('service')}>Service timeline</button><button aria-pressed={tab === 'follow-ups'} onClick={()=>setTab('follow-ups')}>Follow-ups <span>{plan.followUps.length}</span></button></div>
    <div className="planner-list" aria-live="polite">{loading && scope === 'team' ? <p className="assistant-loading"><LoaderCircle className="spin" size={16}/> Loading team enquiries…</p> : tab === 'service' ? <>
      {plan.service.length ? plan.service.map(({record,timeMinutes}) => <article className="service-row" key={record.id}><div className="service-clock">{timeMinutes === null ? 'TIME NEEDED' : record.session.brief.fields.time.value}<span aria-hidden="true"/></div><div className="service-detail"><h4>{record.title}</h4><p>{record.session.guestCare?.name && `${record.session.guestCare.name} · `}{knownGuestCount(record)===null ? 'Guests to confirm' : `${knownGuestCount(record)} ${knownGuestCount(record)===1 ? 'guest' : 'guests'}`} · {record.session.brief.fields.city.status==='resolved' && !record.session.brief.fields.city.review ? record.session.brief.fields.city.value : 'City to confirm'}</p>{timeMinutes === null && <p>{record.session.brief.fields.time.constraint || 'Ask for an exact time.'}</p>}{record.session.guestCare?.dietary && <p className="guest-request">Dietary request: {record.session.guestCare.dietary}</p>}{record.session.guestCare?.occasion && <p className="guest-request">{record.session.guestCare.occasion}</p>}<span className="case-state">{caseStatus(record)}</span></div><button className="button compact subtle" onClick={()=>open(record)}>Open <ArrowRight size={14}/></button></article>) : <div className="planner-empty"><CalendarDays size={30}/><h4>Room for the next enquiry.</h4><p>No saved enquiries for this date. Add a conversation at the booking desk, then save it.</p></div>}
      {plan.unscheduled.length > 0 && <section className="unscheduled-list"><h4>A date still needs agreeing <span>{plan.unscheduled.length}</span></h4>{plan.unscheduled.map(record=><div key={record.id}><span>{record.title}<small>{caseStatus(record)}</small></span><button className="text-button" onClick={()=>open(record)}>Review <ArrowRight size={14}/></button></div>)}</section>}
    </> : plan.followUps.length ? plan.followUps.map(({record,overdue})=><article className={`follow-up-row ${overdue ? 'overdue' : ''}`} key={record.id}><div className="follow-up-day"><strong>{record.session.followUp!.dueDate}</strong><span>{overdue ? 'Overdue' : record.session.followUp!.dueDate === today ? 'Due today' : 'Upcoming'}</span></div><div className="service-detail"><h4>{record.title}</h4><p>{record.session.followUp!.note}</p></div><div className="follow-up-actions"><button className="text-button" onClick={()=>open(record)}>Open <ArrowRight size={14}/></button><button className="button compact subtle" disabled={!!acting} onClick={()=>complete(record)}>{acting === record.id ? <LoaderCircle className="spin" size={14}/> : <Check size={14}/>} Done</button></div></article>) : <div className="planner-empty"><Check size={30}/><h4>Nothing waiting on you.</h4><p>Add a follow-up to an enquiry when you need to pick it up later.</p></div>}</div>
    {error && <p className="dialog-error" role="alert">{error}</p>}{notice && <p className="dialog-hint" role="status">{notice}</p>}
    <div className="planner-footer"><span>Enquiries for review. No table is reserved.<br/>Save changes at the booking desk to update this view.</span><div><button className="button compact subtle" onClick={async()=>{try{await navigator.clipboard.writeText(shiftHandoff(plan,date));setNotice('Shift handoff copied.');}catch{setError('Copy is unavailable. Download the handoff instead.');}}}><Copy size={14}/> Copy handoff</button><button className="button compact primary" onClick={()=>downloadFile(shiftHandoff(plan,date),`formbridge-handoff-${date}.txt`,'text/plain;charset=utf-8')}><Download size={14}/> Handoff</button></div></div>
  </Dialog>;
}
