import { encodeVoiceWav, MAX_VOICE_SECONDS, VOICE_SAMPLE_RATE } from './voice-audio';

export async function prepareVoiceAudio(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  if (blob.size>10_000_000) throw new Error('Choose an audio file below 10 MB and up to two minutes long.');
  if (!blob.size) throw new Error('This recording is empty. Please record again.');
  if (!window.AudioContext || !window.OfflineAudioContext) throw new Error('Audio input is unavailable in this browser. You can still type or paste the message.');
  const context=new AudioContext();
  try {
    const decoded=await context.decodeAudioData(await blob.arrayBuffer());
    if (!Number.isFinite(decoded.duration) || decoded.duration>MAX_VOICE_SECONDS) throw new Error('Use a voice message up to two minutes long.');
    const length=Math.floor(decoded.duration*VOICE_SAMPLE_RATE);
    if (!length) throw new Error('This recording is too short. Please record again.');
    const offline=new OfflineAudioContext(1,length,VOICE_SAMPLE_RATE);
    const source=offline.createBufferSource(); source.buffer=decoded; source.connect(offline.destination); source.start();
    return encodeVoiceWav((await offline.startRendering()).getChannelData(0));
  } catch(cause) {
    if (cause instanceof DOMException) throw new Error('This file could not be played. Try an MP3, WAV or M4A voice message.');
    throw cause;
  } finally { await context.close(); }
}
