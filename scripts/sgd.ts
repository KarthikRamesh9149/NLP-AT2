import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FieldKey, Message } from '../lib/state';

type Split = 'train' | 'dev' | 'test';
interface SgdFrame { service: string; state?: { active_intent: string; slot_values: Record<string, string[]> } }
interface SgdTurn { speaker: 'USER' | 'SYSTEM'; utterance: string; frames: SgdFrame[] }
interface SgdDialogue { dialogue_id: string; services: string[]; turns: SgdTurn[] }
export interface EligibleDialogue { id: string; split: Split; service: string; messages: Message[]; gold: Partial<Record<FieldKey, string[]>>; reserveUserTurns: number }

const serviceFor: Record<Split, string> = { train: 'Restaurants_1', dev: 'Restaurants_2', test: 'Restaurants_2' };
const slotFor: Record<Split, Record<FieldKey, string>> = {
  train: { restaurantName: 'restaurant_name', city: 'city', date: 'date', time: 'time', partySize: 'party_size' },
  dev: { restaurantName: 'restaurant_name', city: 'location', date: 'date', time: 'time', partySize: 'number_of_seats' },
  test: { restaurantName: 'restaurant_name', city: 'location', date: 'date', time: 'time', partySize: 'number_of_seats' },
};

export async function loadEligible(dataDir: string, split: Split): Promise<{ dialogueCount: number; singleServiceCount: number; eligible: EligibleDialogue[] }> {
  const names = (await readdir(join(dataDir, split))).filter((name) => /^dialogues_\d+\.json$/.test(name)).sort();
  let dialogueCount = 0;
  let singleServiceCount = 0;
  const eligible: EligibleDialogue[] = [];
  const service = serviceFor[split];
  for (const name of names) {
    const dialogues = JSON.parse(await readFile(join(dataDir, split, name), 'utf8')) as SgdDialogue[];
    for (const dialogue of dialogues) {
      dialogueCount += 1;
      if (dialogue.services.length !== 1 || dialogue.services[0] !== service) continue;
      singleServiceCount += 1;
      const reserveTurns = dialogue.turns.map((turn, index) => ({ turn, index })).filter(({ turn }) => turn.speaker === 'USER' && turn.frames.some((frame) => frame.service === service && frame.state?.active_intent === 'ReserveRestaurant'));
      if (!reserveTurns.length) continue;
      const last = reserveTurns.at(-1)!;
      const state = last.turn.frames.find((frame) => frame.service === service)!.state!;
      const messages = dialogue.turns.slice(0, last.index + 1).map((turn, index) => ({ id: `m${index + 1}`, speaker: turn.speaker === 'USER' ? 'customer' as const : 'staff' as const, text: turn.utterance }));
      const gold = Object.fromEntries(Object.entries(slotFor[split]).map(([field, slot]) => [field, state.slot_values[slot] ?? []])) as EligibleDialogue['gold'];
      eligible.push({ id: dialogue.dialogue_id, split, service, messages, gold, reserveUserTurns: reserveTurns.length });
    }
  }
  return { dialogueCount, singleServiceCount, eligible };
}

export { serviceFor, slotFor };
