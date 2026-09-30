import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import OpenAI from 'openai';

process.loadEnvFile('.env.local');

const scenes = JSON.parse(await readFile('docs/media/film-scenes.json', 'utf8'));
const output = process.env.FORMBRIDGE_FILM_AUDIO_DIR || '/tmp/formbridge-film-audio';
await mkdir(output, { recursive: true });

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
for (const [film, sequence] of Object.entries(scenes)) {
  for (const [index, scene] of sequence.entries()) {
    const file = join(output, `${film}-${String(index).padStart(2, '0')}.mp3`);
    try { await access(file); continue; } catch { /* Generate a missing clip. */ }
    const speech = await client.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: 'marin',
      input: scene.narration,
      instructions: 'Speak with a warm, assured Australian English style. Clear, thoughtful product narration; natural pace and no sales hype.',
      response_format: 'mp3',
    });
    await writeFile(file, Buffer.from(await speech.arrayBuffer()));
    console.log(`Generated ${film} voice ${index + 1}/${sequence.length}`);
  }
}
