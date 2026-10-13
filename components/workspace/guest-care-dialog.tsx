'use client';
import { useState } from 'react';
import { Check, Heart, CalendarClock } from 'lucide-react';
import { followUpSchema, guestCareSchema, type FollowUp, type GuestCare } from '@/lib/follow-up';
import { Dialog } from './dialog';
import {CareSuggestions} from './care-suggestions';
import type {Message} from '@/lib/state';
import type {CareSuggestion} from '@/lib/restaurant-desk';

export function GuestCareDialog({ care, followUp, today, onSave, onClose, messages=[], evidence=[] }: { care: GuestCare; followUp: FollowUp | null; today: string; messages?:Message[];evidence?:CareSuggestion[];onSave: (care: GuestCare, task: FollowUp | null,evidence:CareSuggestion[]) => void; onClose: () => void }) {
  const [sources,setSources]=useState(evidence);
  const [values,setValues] = useState(care); const [enabled,setEnabled] = useState(!!followUp); const [dueDate,setDueDate] = useState(followUp?.dueDate || today); const [note,setNote] = useState(followUp?.note || ''); const [done,setDone] = useState(followUp?.done || false); const [error,setError] = useState('');
  function submit() {
    const guest = guestCareSchema.safeParse(values); const task = enabled ? followUpSchema.safeParse({dueDate,note,done}) : null;
    if (!guest.success || (task && !task.success)) { setError('Add a valid follow-up date and a short next step.'); return; }
    onSave(guest.data,task?.success ? task.data : null,sources.filter(source=>guest.data[source.field]===source.value));
  }
  return <Dialog wide title="A little care goes a long way." description="Keep useful guest details and the next step alongside this enquiry." onClose={onClose}>
    <CareSuggestions messages={messages} onAccept={suggestion=>{setValues({...values,[suggestion.field]:suggestion.value});setSources([...sources.filter(source=>source.field!==suggestion.field),suggestion]);}}/>
    <form onSubmit={event=>{event.preventDefault();submit();}}><div className="care-section-title"><Heart size={17}/><h3>Guest care</h3><span>Optional · reviewed by staff</span></div><div className="guest-care-grid">{([['name','Guest name',100,'e.g. Alex Morgan'],['contact','Contact details',120,'Phone or email for your team'],['dietary','Dietary requests',300,'Record the guest’s request; check with the kitchen'],['seating','Seating preference',200,'e.g. Quiet table, step-free access'],['occasion','Occasion',120,'e.g. Birthday dinner']] as const).map(([key,label,max,placeholder])=><label key={key} className={key === 'dietary' ? 'care-wide' : ''}>{label}<input className="edit-input" value={values[key]} maxLength={max} placeholder={placeholder} onChange={event=>setValues({...values,[key]:event.target.value})}/></label>)}</div>
    {sources.filter(source=>values[source.field]===source.value).map(source=><div className="care-source" key={source.field}><strong>{source.value}</strong><blockquote>“{source.quote}”</blockquote><small>Customer message · reviewed by staff</small></div>)}
    <p className="dialog-hint">Requests stay separate from booking details. Check dietary requirements with the guest and kitchen.</p>
    <div className="care-section-title"><CalendarClock size={17}/><h3>Next step</h3><label className="care-toggle"><input type="checkbox" checked={enabled} onChange={event=>setEnabled(event.target.checked)}/> Add a follow-up</label></div>
    {enabled && <div className="follow-up-editor"><label>Follow-up date<input className="edit-input" type="date" value={dueDate} required onInput={event=>setDueDate(event.currentTarget.value)} onChange={event=>setDueDate(event.target.value)}/></label><label>What needs doing?<input className="edit-input" value={note} required maxLength={200} onChange={event=>setNote(event.target.value)} placeholder="e.g. Ask the guest to confirm 8:30 pm"/></label><label className="care-toggle"><input type="checkbox" checked={done} onChange={event=>setDone(event.target.checked)}/> Already completed</label></div>}
    {error && <p className="dialog-error" role="alert">{error}</p>}<div className="dialog-actions"><span className="care-save-hint">Save the enquiry to add it to your planner.</span><button className="button subtle" type="button" onClick={onClose}>Cancel</button><button className="button primary"><Check size={15}/> Keep these details</button></div></form>
  </Dialog>;
}
