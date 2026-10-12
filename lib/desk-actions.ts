import { z } from 'zod';
import { validIsoDate } from './temporal';
import type { Message } from './state';
import { followUpSchema, type FollowUp } from './follow-up';

// These are proposed staff tasks. Applying one never edits the five booking fields.
export const staffActionArguments = z.object({
  followUp: z.object({ dueDate: z.string(), note: z.string(), sourceIds: z.array(z.string()) }).nullable(),
  handoff: z.object({ note: z.string(), sourceIds: z.array(z.string()) }).nullable(),
});
export type StaffAction = { kind: 'follow_up'; dueDate: string; note: string; sourceIds: string[] } | { kind: 'handoff_note'; note: string; sourceIds: string[] };
export function actionIntent(question: string) {
  return { followUp: /\bfollow[ -]?up\b|\bremind\b|\bchase\b|\breply (?:later|tomorrow)\b/i.test(question), handoff: /\bhand[ -]?off\b|\bshift\b|\b(?:staff |team )?notes?\b/i.test(question) };
}
export function checkedActions(input: unknown, context: { question: string; today: string; messages: Message[] }): StaffAction[] {
  const parsed = staffActionArguments.safeParse(input); if (!parsed.success) return [];
  const intent = actionIntent(context.question); const actions: StaffAction[] = [];
  const realSources = (ids: string[]) => ids.length <= 12 && ids.every(id=>context.messages.some(message=>message.id===id));
  const {followUp,handoff} = parsed.data;
  if (intent.followUp && followUp && realSources(followUp.sourceIds) && validIsoDate(followUp.dueDate) && followUp.dueDate >= context.today && followUpSchema.safeParse({...followUp,done:false}).success) actions.push({kind:'follow_up',...followUp,sourceIds:[...new Set(followUp.sourceIds)]});
  if (intent.handoff && handoff && realSources(handoff.sourceIds) && handoff.note.trim() && handoff.note.length<=1000) actions.push({kind:'handoff_note',...handoff,note:handoff.note.trim(),sourceIds:[...new Set(handoff.sourceIds)]});
  return actions;
}
export function applyStaffAction<T extends { notes: string; followUp: FollowUp | null }>(draft: T, action: StaffAction, replace = false): T {
  if (action.kind === 'follow_up') {
    const task = followUpSchema.parse({dueDate:action.dueDate,note:action.note,done:false});
    if (draft.followUp && !replace && !draft.followUp.done && (draft.followUp.dueDate !== task.dueDate || draft.followUp.note !== task.note)) throw new Error('Review the existing follow-up before replacing it.');
    return {...draft,followUp:task};
  }
  const notes = [draft.notes.trim(),action.note.trim()].filter(Boolean).join('\n\n');
  if (notes.length>2000) throw new Error('Staff notes are full. Edit them before adding another handoff.');
  return {...draft,notes};
}
