'use client';
import { ArrowDownRight, Check, ChevronDown, CircleHelp, Clock3, Link2, MapPin, Pencil, Users, CalendarDays, Utensils, ArrowRight } from 'lucide-react';
import { FIELD_KEYS, type Brief, type FieldKey, type Message } from '@/lib/state';
export const fieldLabels: Record<FieldKey, string> = { restaurantName: 'Restaurant', city: 'City', date: 'Date', time: 'Time', partySize: 'Guests' };
const fieldIcons = { restaurantName: Utensils, city: MapPin, date: CalendarDays, time: Clock3, partySize: Users };
export function BookingCard({ brief, messages, selectedField, onSelect, onEdit, onUseConversation, onKeepEdit, onViewSource, busy }: { brief: Brief; messages: Message[]; selectedField: FieldKey | null; onSelect: (field: FieldKey | null) => void; onEdit: (field: FieldKey) => void; onUseConversation: (field: FieldKey) => void; onKeepEdit: (field: FieldKey) => void; onViewSource: (id: string) => void; busy: boolean }) {
  return <div className="brief-fields">{FIELD_KEYS.map((field) => {
    const item = brief.fields[field]; const selected = selectedField === field; const Icon = fieldIcons[field];
    return <div key={field} className={`field-row ${selected ? 'selected' : ''} ${item.status}`} data-field={field}>
      <div className="field-leading"><Icon size={18} strokeWidth={1.6} /></div>
      <button type="button" className="field-main" onClick={() => onSelect(selected ? null : field)} aria-expanded={selected} aria-controls={`evidence-${field}`}>
        <span className="field-topline"><span className="field-label">{fieldLabels[field]}</span><span className={`field-status ${item.status}`}>{item.status === 'resolved' ? <Check size={12} /> : item.status === 'needs_clarification' ? <Clock3 size={12} /> : <CircleHelp size={12} />}{item.review ? 'Review change' : item.status === 'resolved' ? item.source === 'staff' ? 'Reviewed' : 'Ready' : item.status === 'needs_clarification' ? 'Ask customer' : 'Needed'}</span></span>
        <span className={`field-value ${!item.value ? 'placeholder' : ''}`}>{item.value ? field === 'partySize' ? `${item.value} ${item.value === '1' ? 'guest' : 'guests'}` : item.value : item.constraint ?? 'Not provided'}</span>
        {item.constraint && item.value && <span className="field-constraint">{item.constraint}</span>}
        <span className="field-footline">{item.source === 'staff' ? 'Staff edit' : item.evidenceIds.length ? <><Link2 size={12} /> {item.evidenceIds.length === 1 ? 'View source' : `${item.evidenceIds.length} linked messages`}</> : 'Waiting for a detail'}<ChevronDown size={14} className={selected ? 'rotate' : ''} /></span>
      </button>
      <button type="button" className="edit-button icon-button" onClick={() => onEdit(field)} disabled={busy} aria-label={`Edit ${fieldLabels[field]}`}><Pencil size={14} /></button>
      {selected && <div id={`evidence-${field}`} className="field-evidence">
        {item.review && <div className="review-choice"><p>{item.note}</p>{item.review.reason === 'staff_conflict' && <><span>Conversation detail: <strong>{item.review.value || item.review.constraint || 'Not confirmed'}</strong></span>{item.review.evidenceIds.map(id => <button key={id} className="text-button" onClick={() => onViewSource(id)}><Link2 size={12} /> View changed message</button>)}</>}<div>{item.value && <button className="button compact subtle" disabled={busy} onClick={() => onKeepEdit(field)}>Keep {item.value}</button>}<button className="button compact primary" disabled={busy || !messages.some(message => message.speaker === 'customer')} onClick={() => onUseConversation(field)}>{item.review.reason === 'staff_conflict' ? 'Use conversation detail' : 'Recheck conversation'}</button></div></div>}
        {item.source === 'staff' ? !item.review && <><p>{item.note || 'Entered by staff. This value stays until you change it.'}</p>{messages.some((m) => m.speaker === 'customer') && <button className="text-button" disabled={busy} onClick={() => onUseConversation(field)}>Use conversation instead <ArrowDownRight size={14} /></button>}</> : item.evidenceIds.length ? item.evidenceIds.map((id) => { const message = messages.find((m) => m.id === id); return <button className="evidence-link" type="button" key={id} onClick={() => onViewSource(id)}><span className="evidence-speaker">{message?.speaker === 'staff' ? 'Staff' : 'Customer'}<span>Message {messages.findIndex((m) => m.id === id) + 1}</span></span><q>{message?.text ?? 'Message unavailable'}</q><ArrowRight size={14} /></button>; }) : <p>Add this detail to the conversation, or enter it with the edit button.</p>}
      </div>}
      {item.review && !selected && <p className="field-conflict">A change needs your review before approval.</p>}
    </div>;
  })}</div>;
}
