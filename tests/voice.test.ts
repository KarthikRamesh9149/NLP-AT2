import { expect, it } from 'vitest';
import { encodeVoiceWav, inspectVoiceWav, MAX_VOICE_BYTES, VOICE_SAMPLE_RATE } from '../lib/voice-audio';
import { maximumCost, voiceCostMicroUsd } from '../lib/server/usage-budget';
import { POST } from '../app/api/transcribe/route';
it('encodes bounded mono PCM and derives duration from actual bytes, not a client claim',()=>{
  const samples = Float32Array.from({length:VOICE_SAMPLE_RATE},(_,i)=>Math.sin(i/10)*0.2);
  const bytes=encodeVoiceWav(samples); const audio=inspectVoiceWav(bytes);
  expect(audio.seconds).toBe(1); expect(bytes.byteLength).toBe(32044);
  const dishonest=bytes.slice(); new DataView(dishonest.buffer).setUint32(28,1,true);
  expect(()=>inspectVoiceWav(dishonest)).toThrow(/format/);
});
it('rejects truncated, oversize, malformed and silent audio before contacting OpenAI',()=>{
  expect(()=>inspectVoiceWav(new Uint8Array(44))).toThrow();
  expect(()=>inspectVoiceWav(new Uint8Array(MAX_VOICE_BYTES+1))).toThrow();
  expect(()=>inspectVoiceWav(encodeVoiceWav(new Float32Array(VOICE_SAMPLE_RATE)))).toThrow(/silent/);
  const wav=encodeVoiceWav(Float32Array.from({length:16000},()=>0.1));
  expect(()=>inspectVoiceWav(wav.slice(0,300))).toThrow();
  const compressed=wav.slice(); compressed[20]=3;
  expect(()=>inspectVoiceWav(compressed)).toThrow(/format/);
});
it('shares the durable quota and reserves more than the verified transcription price',()=>{
  expect(voiceCostMicroUsd(60)).toBe(4500);
  expect(maximumCost({seconds:60},'voice')).toBeGreaterThan(4500);
  expect(()=>maximumCost({seconds:121},'voice')).toThrow();
});
it('returns a clear client error for silence and wrong content type without provider usage',async()=>{
  const wrong=await POST(new Request('http://localhost/api/transcribe',{method:'POST',body:'bad'})); expect(wrong.status).toBe(415);
  const silent=encodeVoiceWav(new Float32Array(16000));
  const response=await POST(new Request('http://localhost/api/transcribe',{method:'POST',headers:{'Content-Type':'audio/wav'},body:new Uint8Array(silent)}));
  expect(response.status).toBe(400); expect((await response.json()).error).toMatch(/silent/);
});
