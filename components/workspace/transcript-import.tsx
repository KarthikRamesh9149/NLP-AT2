'use client';
import { useMemo, useState } from 'react';
import { ArrowRight, MessageSquareText } from 'lucide-react';
import { parseTranscript } from '@/lib/transcript';
import type { Message } from '@/lib/state';
import { Dialog } from './dialog';
export function TranscriptImport({ onClose, onImport, hasDraft }: { onClose: () => void; onImport: (messages: Omit<Message, 'id'>[]) => void; hasDraft: boolean }) {
  const [raw, setRaw] = useState('');
  const preview = useMemo(() => { try { return { messages: parseTranscript(raw), error: null }; } catch (e) { return { messages: [], error: e instanceof Error ? e.message : 'Check the conversation format.' }; } }, [raw]);
  return <Dialog wide title="Bring your conversation" description="Paste an enquiry, or a conversation with Customer: and Staff: before each message." onClose={onClose}>
    <label className="input-label" htmlFor="import-input">Conversation</label>
    <textarea autoFocus id="import-input" className="import-input" rows={9} value={raw} onChange={(e) => setRaw(e.target.value)} maxLength={32000} placeholder={'Customer: A table for four at Juniper in Sydney, 9 October 2026 at 7 pm.\nStaff: Would 7:30 pm work?\nCustomer: Yes, and make that five people.'} />
    <div className="import-preview" role="status"><MessageSquareText size={16} /><span>{raw.trim() ? preview.error ?? `${preview.messages.length} messages ready · ${preview.messages.filter((m) => m.speaker === 'customer').length} from the customer` : 'A single enquiry works too. No speaker labels needed.'}</span></div>
    {hasDraft && <p className="dialog-hint">This starts a new brief. Download your current draft first if you want to keep it.</p>}
    <div className="dialog-actions"><button className="button subtle" onClick={onClose}>Cancel</button><button className="button primary" disabled={!preview.messages.length} onClick={() => onImport(preview.messages)}>Create booking brief <ArrowRight size={16} /></button></div>
  </Dialog>;
}
