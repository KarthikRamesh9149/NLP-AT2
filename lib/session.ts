import { demoBrief, demoMessages } from './demo';
import type { Brief, Message } from './state';

export const SESSION_KEY = 'formbridge-session-v2';
export const LEGACY_SESSION_KEY = 'formbridge-session';

export interface SavedSession { messages: Message[]; brief: Brief }

function parseSession(raw: string | null): SavedSession | null {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as SavedSession;
    return Array.isArray(session.messages) && session.brief?.fields?.time ? session : null;
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
