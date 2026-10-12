'use client';
import { useState } from 'react';
import { CalendarClock, Check, ClipboardList } from 'lucide-react';
import type { StaffAction } from '@/lib/desk-actions';
import type { FollowUp } from '@/lib/follow-up';

export function AssistantAction({ action, followUp, onApply }: { action: StaffAction; followUp: FollowUp | null; onApply: (action: StaffAction, replace: boolean) => void }) {
  const [applied,setApplied] = useState(false); const [replace,setReplace] = useState(false); const [error,setError] = useState('');
  const conflict = action.kind === 'follow_up' && followUp && !followUp.done && (action.dueDate !== followUp.dueDate || action.note !== followUp.note);
  return <div className="assistant-action"><span>{action.kind === 'follow_up' ? <CalendarClock size={15}/> : <ClipboardList size={15}/>} {action.kind === 'follow_up' ? 'Proposed follow-up' : 'Proposed shift note'}</span>{action.kind === 'follow_up' && <strong>{action.dueDate}</strong>}<p>{action.note}</p>{conflict && !applied && <div className="action-conflict"><p>Current follow-up: {followUp.dueDate} · {followUp.note}</p><label><input type="checkbox" checked={replace} onChange={event=>setReplace(event.target.checked)}/> Replace the current follow-up</label></div>}{error && <p className="dialog-error" role="alert">{error}</p>}<button className="button compact primary" disabled={applied || !!conflict && !replace} onClick={()=>{try{onApply(action,replace);setApplied(true);setError('');}catch(cause){setError(cause instanceof Error ? cause.message : 'This next step could not be added.');}}}><Check size={14}/>{applied ? 'Added to your draft' : action.kind === 'follow_up' ? 'Add follow-up' : 'Add shift note'}</button><small>{applied ? 'Save the enquiry to keep this change.' : 'Nothing is saved until you review and apply it.'}</small></div>;
}
