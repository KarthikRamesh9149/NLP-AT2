import OpenAI, { toFile } from 'openai';
import { inspectVoiceWav, MAX_VOICE_BYTES } from '@/lib/voice-audio';
import { reserveUsage, settleVoiceUsage, UsageLimitError } from '@/lib/server/usage-budget';

export const runtime='nodejs';
export const maxDuration=30;
const headers={'Cache-Control':'no-store'};
async function readAudio(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  if (!request.body) throw new Error('Choose or record a voice message first.');
  const reader=request.body.getReader(); const chunks:Uint8Array[]=[]; let total=0;
  try {
    while(true){ const {done,value}=await reader.read(); if(done) break; total+=value.byteLength; if(total>MAX_VOICE_BYTES) { await reader.cancel(); throw new Error('Use a voice message up to two minutes long.'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes=new Uint8Array(total); let offset=0; chunks.forEach(chunk=>{bytes.set(chunk,offset);offset+=chunk.byteLength;}); return bytes;
}
export async function POST(request: Request) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'audio/wav') return Response.json({error:'Upload audio through the voice-message window.'},{status:415,headers});
  let bytes:Uint8Array<ArrayBuffer>; let seconds:number;
  try { bytes=await readAudio(request); seconds=inspectVoiceWav(bytes).seconds; }
  catch(cause) { return Response.json({error:cause instanceof Error ? cause.message : 'This audio could not be read.'},{status:400,headers}); }
  try {
    const reservation=await reserveUsage(request,{seconds},'voice');
    if(!process.env.OPENAI_API_KEY) throw new Error('Transcription is unavailable.');
    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0,timeout:20_000});
    const result=await client.audio.transcriptions.create({file:await toFile(Buffer.from(bytes),'voice-note.wav',{type:'audio/wav'}),model:'gpt-transcribe',response_format:'json'});
    const duration=result.usage?.type==='duration' && Number.isFinite(result.usage.seconds) && result.usage.seconds>0 && result.usage.seconds<=Math.ceil(seconds)+1 ? result.usage.seconds : null;
    await settleVoiceUsage(reservation,duration);
    const text=result.text?.trim();
    if(!text) return Response.json({error:'No speech was recognised. Record again or type the message.'},{status:422,headers});
    return Response.json({text:text.slice(0,8000),tooLong:text.length>1000},{headers});
  } catch(cause) {
    if(cause instanceof UsageLimitError) return Response.json({error:cause.message},{status:cause.status,headers:{...headers,'Retry-After':String(cause.retryAfter)}});
    return Response.json({error:'This voice message could not be transcribed. Retry, or type the message instead.'},{status:503,headers});
  }
}
