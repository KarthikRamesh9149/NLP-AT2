export const VOICE_SAMPLE_RATE = 16000;
export const MAX_VOICE_SECONDS = 120;
export const MAX_VOICE_BYTES = VOICE_SAMPLE_RATE * 2 * MAX_VOICE_SECONDS + 44;
const tag = (bytes: Uint8Array, offset: number, length = 4) => String.fromCharCode(...bytes.subarray(offset,offset+length));

export function encodeVoiceWav(samples: Float32Array): Uint8Array<ArrayBuffer> {
  if (!samples.length || samples.length > VOICE_SAMPLE_RATE * MAX_VOICE_SECONDS) throw new Error('Use a voice message up to two minutes long.');
  const bytes = new Uint8Array(44 + samples.length*2); const view = new DataView(bytes.buffer);
  const write = (offset: number, text: string) => [...text].forEach((letter,index)=>view.setUint8(offset+index,letter.charCodeAt(0)));
  write(0,'RIFF'); view.setUint32(4,bytes.length-8,true); write(8,'WAVE'); write(12,'fmt '); view.setUint32(16,16,true);
  view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,VOICE_SAMPLE_RATE,true); view.setUint32(28,VOICE_SAMPLE_RATE*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true); write(36,'data'); view.setUint32(40,samples.length*2,true);
  samples.forEach((sample,index)=>{ const value=Number.isFinite(sample) ? Math.max(-1,Math.min(1,sample)) : 0; view.setInt16(44+index*2,Math.round(value*(value<0?32768:32767)),true); });
  return bytes;
}
export function inspectVoiceWav(bytes: Uint8Array): { seconds: number } {
  if (bytes.byteLength > MAX_VOICE_BYTES) throw new Error('Use a voice message up to two minutes long.');
  if (bytes.byteLength<44) throw new Error('This audio is incomplete. Choose another file.');
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if (tag(bytes,0)!=='RIFF' || tag(bytes,8)!=='WAVE' || tag(bytes,12)!=='fmt ' || tag(bytes,36)!=='data'
    || view.getUint32(16,true)!==16 || view.getUint16(20,true)!==1 || view.getUint16(22,true)!==1 || view.getUint32(24,true)!==VOICE_SAMPLE_RATE
    || view.getUint32(28,true)!==VOICE_SAMPLE_RATE*2 || view.getUint16(32,true)!==2 || view.getUint16(34,true)!==16) throw new Error('This audio format could not be read. Upload it through the voice-message window.');
  const size=view.getUint32(40,true);
  if (size!==bytes.byteLength-44 || size%2 || view.getUint32(4,true)!==bytes.byteLength-8) throw new Error('This audio is incomplete. Choose another file.');
  const seconds=size/(VOICE_SAMPLE_RATE*2);
  if (seconds<0.25 || seconds>MAX_VOICE_SECONDS) throw new Error('Use a voice message between a quarter-second and two minutes long.');
  let audible=false; for(let offset=44;offset<bytes.byteLength;offset+=2) if(view.getInt16(offset,true)!==0){audible=true;break;}
  if (!audible) throw new Error('This recording is silent. Record again or choose another file.');
  return {seconds};
}
