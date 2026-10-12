import { demoBrief, demoMessages } from './demo';
import { briefSchema, messageSchema } from './contracts';
import { validIsoDate } from './temporal';
import { FIELD_KEYS, type Brief, type Message } from './state';
import { MAX_HISTORY } from './limits';
import { rebuildForTranscriptChange } from './draft-workflow';

export const SESSION_KEY = 'formbridge-session-v2';
export const LEGACY_SESSION_KEY = 'formbridge-session';
export const CURRENT_ANALYSIS_VERSION = 'grounded-state-v15';

export interface SavedSession { messages: Message[]; brief: Brief; referenceDate?: string; pendingAnalysis?: boolean; manualMode?: boolean; analysisVersion?: string; caseId?: string; caseTitle?: string; notes?: string; teamCase?: { id: string; workspaceId: string; version: number } }

export function needsSavedReview(session: SavedSession): boolean {
  return session.analysisVersion !== CURRENT_ANALYSIS_VERSION && FIELD_KEYS.some(key => !!session.brief.fields[key].value || !!session.brief.fields[key].constraint || !!session.brief.fields[key].review);
}

export function prepareStoredSession(session: SavedSession): SavedSession {
  if (!needsSavedReview(session)) return session;
  const hasModel = FIELD_KEYS.some(key => session.brief.fields[key].source === 'model' && (session.brief.fields[key].value || session.brief.fields[key].constraint));
  const brief = rebuildForTranscriptChange(session.brief);
  for (const key of FIELD_KEYS) if (brief.fields[key].source === 'staff') brief.fields[key].note = 'Review this saved detail before approving the brief.';
  return { ...session, brief, analysisVersion: CURRENT_ANALYSIS_VERSION, pendingAnalysis: !!session.pendingAnalysis || (hasModel && session.messages.some(message => message.speaker === 'customer')), manualMode: hasModel ? false : session.manualMode };
}

export function parseSession(raw: string | null): SavedSession | null {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as SavedSession;
    if (Array.isArray(session.brief?.history)) session.brief.history = session.brief.history.slice(-MAX_HISTORY);
    if (!Array.isArray(session.messages) || session.messages.length > 30 || session.messages.some((m) => !messageSchema.safeParse(m).success) || new Set(session.messages.map((m) => m.id)).size !== session.messages.length || !briefSchema.safeParse(session.brief).success) return null;
    if (session.referenceDate !== undefined && !validIsoDate(session.referenceDate)) return null;
    if (session.pendingAnalysis !== undefined && typeof session.pendingAnalysis !== 'boolean') return null;
    if (session.manualMode !== undefined && typeof session.manualMode !== 'boolean') return null;
    if (session.analysisVersion !== undefined && (typeof session.analysisVersion !== 'string' || session.analysisVersion.length > 50)) return null;
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
  if (saved) return prepareStoredSession(saved);

  const previous = parseSession(legacy);
  if (!previous) return null;
  // Earlier releases automatically saved this example on first visit. Do not revive it.
  const untouchedExample = JSON.stringify(previous.messages) === JSON.stringify(demoMessages)
    && JSON.stringify(previous.brief) === JSON.stringify(demoBrief);
  return untouchedExample ? null : prepareStoredSession(previous);
}
