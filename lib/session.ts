import { demoBrief, demoMessages } from './demo';
import { briefSchema, messageSchema } from './contracts';
import { validIsoDate } from './temporal';
import { FIELD_KEYS, type Brief, type Message } from './state';
import { MAX_HISTORY } from './limits';

export const SESSION_KEY = 'formbridge-session-v2';
export const LEGACY_SESSION_KEY = 'formbridge-session';

export interface SavedSession { messages: Message[]; brief: Brief; referenceDate?: string; pendingAnalysis?: boolean; manualMode?: boolean; analysisVersion?: string; caseId?: string; caseTitle?: string; notes?: string; teamCase?: { id: string; workspaceId: string; version: number } }

export function parseSession(raw: string | null): SavedSession | null {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as SavedSession;
    if (Array.isArray(session.brief?.history)) session.brief.history = session.brief.history.slice(-MAX_HISTORY);
    if (!Array.isArray(session.messages) || session.messages.length > 30 || session.messages.some((m) => !messageSchema.safeParse(m).success) || new Set(session.messages.map((m) => m.id)).size !== session.messages.length || !briefSchema.safeParse(session.brief).success) return null;
    if (session.referenceDate !== undefined && !validIsoDate(session.referenceDate)) return null;
    if (session.pendingAnalysis !== undefined && typeof session.pendingAnalysis !== 'boolean') return null;
    if (session.manualMode !== undefined && typeof session.manualMode !== 'boolean') return null;
    if (session.caseTitle !== undefined && (typeof session.caseTitle !== 'string' || session.caseTitle.length > 80)) return null;
    if (session.notes !== undefined && (typeof session.notes !== 'string' || session.notes.length > 2000)) return null;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (session.caseId !== undefined && (typeof session.caseId !== 'string' || !uuid.test(session.caseId))) return null;
    if (session.teamCase && (!uuid.test(session.teamCase.id) || !uuid.test(session.teamCase.workspaceId) || !Number.isInteger(session.teamCase.version) || session.teamCase.version < 1)) return null;
    if (session.pendingAnalysis || session.brief.approvedRevision !== session.brief.revision || FIELD_KEYS.some(key => session.brief.fields[key].status !== 'resolved' || !session.brief.fields[key].value || session.brief.fields[key].review)) session.brief.approvedRevision = null;
    return session;
  } catch {
    return null;
  }
}

export function restoreSession(current: string | null, legacy: string | null): SavedSession | null {
  const saved = parseSession(current);
  if (saved) return saved;

  const previous = parseSession(legacy);
  if (!previous) return null;
  // Earlier releases automatically saved this example on first visit. Do not revive it.
  const untouchedExample = JSON.stringify(previous.messages) === JSON.stringify(demoMessages)
    && JSON.stringify(previous.brief) === JSON.stringify(demoBrief);
  return untouchedExample ? null : previous;
}
