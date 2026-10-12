import { z } from 'zod';
import { parseSession, type SavedSession } from './session';
import { FIELD_KEYS } from './state';
import { rebuildForTranscriptChange } from './draft-workflow';
import { utf8Bytes } from './limits';

export const CASES_KEY = 'formbridge-cases-v1';
const MAX_CASES = 50;
const metadataSchema = z.object({ id: z.uuid(), title: z.string().trim().min(1).max(80), updatedAt: z.iso.datetime({ offset: true }), archived: z.boolean(), notes: z.string().max(2000).default('') });
export interface BookingCase extends z.infer<typeof metadataSchema> { session: SavedSession }

export function caseTitle(session: SavedSession): string {
  return [session.brief.fields.restaurantName.value || 'Booking enquiry', session.brief.fields.date.value].filter(Boolean).join(' · ').slice(0, 80);
}
export function readCases(raw: string | null): BookingCase[] {
  if (!raw) return [];
  try {
    const records: unknown = JSON.parse(raw);
    if (!Array.isArray(records)) return [];
    return records.slice(0, MAX_CASES).flatMap(record => {
      const metadata = metadataSchema.safeParse(record);
      const session = record && typeof record === 'object' && 'session' in record ? parseSession(JSON.stringify(record.session)) : null;
      return metadata.success && session ? [{ ...metadata.data, updatedAt: new Date(metadata.data.updatedAt).toISOString(), session }] : [];
    });
  } catch { return []; }
}
export function saveCase(cases: BookingCase[], record: BookingCase): BookingCase[] {
  if (!metadataSchema.safeParse(record).success || !parseSession(JSON.stringify(record.session))) throw new Error('Check the case name and draft before saving.');
  const remaining = cases.filter(item => item.id !== record.id);
  if (remaining.length >= MAX_CASES) throw new Error('This device has 50 saved cases. Reopen an existing enquiry to update it, or save to your team workspace.');
  return [record, ...remaining].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function exportCase(session: SavedSession, title: string, notes = '') {
  const approved = !session.pendingAnalysis && session.brief.approvedRevision === session.brief.revision && FIELD_KEYS.every(key => session.brief.fields[key].status === 'resolved' && !session.brief.fields[key].review);
  return { format: 'formbridge-case', version: 1, title, notes, status: session.pendingAnalysis ? 'unfinished_update' : approved ? 'approved_brief' : 'draft', ...session, exportedAt: new Date().toISOString() };
}
export function importCase(raw: string): { session: SavedSession; title: string; notes: string } {
  if (utf8Bytes(raw) > 250_000) throw new Error('This file is too large. Use a FormBridge JSON file below 250 KB.');
  let data: Record<string, unknown>;
  try { data = JSON.parse(raw); } catch { throw new Error('This file is not valid JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Choose a FormBridge booking brief JSON file.');
  if (data.format !== undefined && (data.format !== 'formbridge-case' || data.version !== 1)) throw new Error('This file format is not supported.');
  // Reopen both the current format and briefs exported by earlier releases.
  const legacy = !data.brief && data.fields ? { fields: data.fields, history: data.changes ?? [], revision: 0, approvedRevision: null } : null;
  if (legacy) legacy.revision = Math.max(0, ...(Array.isArray(legacy.history) ? legacy.history.map((change: { revision?: number }) => change.revision ?? 0) : []));
  const session = parseSession(JSON.stringify({ messages: data.messages, brief: data.brief ?? legacy, ...(data.referenceDate ? { referenceDate: data.referenceDate } : {}) }));
  if (!session) throw new Error('This file has invalid booking details or messages.');
  const title = typeof data.title === 'string' ? data.title.trim().slice(0, 80) || caseTitle(session) : caseTitle(session);
  const notes = typeof data.notes === 'string' ? data.notes.slice(0, 2000) : '';
  return { session: { ...session, brief: rebuildForTranscriptChange(session.brief), pendingAnalysis: session.messages.some(message => message.speaker === 'customer') }, title, notes };
}
