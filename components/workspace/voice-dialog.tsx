'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, FileAudio, LoaderCircle, Mic, RotateCcw, Square } from 'lucide-react';
import { prepareVoiceAudio } from '@/lib/voice-client';
import { inspectVoiceWav, MAX_VOICE_SECONDS } from '@/lib/voice-audio';
import { Dialog } from './dialog';

export function VoiceDialog({ onClose, onUse, speaker }: { onClose: () => void; onUse: (text: string) => void; speaker: string }) {
  const [clip,setClip] = useState<Blob | null>(null); const [audioUrl,setAudioUrl] = useState(''); const [name,setName] = useState('');
  const [recording,setRecording] = useState(false); const [elapsed,setElapsed] = useState(0); const [busy,setBusy] = useState(false);
  const [text,setText] = useState(''); const [error,setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null); const stream = useRef<MediaStream | null>(null); const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const abort = useRef<AbortController | null>(null); const generation = useRef(0); const alive = useRef(true);
  function stopTracks() { stream.current?.getTracks().forEach(track=>track.stop()); stream.current=null; if(interval.current){clearInterval(interval.current);interval.current=null;} }
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;abort.current?.abort(); if(recorder.current?.state==='recording') recorder.current.stop();stopTracks();};},[]);
  useEffect(()=>{ if(!clip){setAudioUrl('');return;} const url=URL.createObjectURL(clip);setAudioUrl(url);return()=>URL.revokeObjectURL(url);},[clip]);
  async function record() {
    if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){setError('Recording is unavailable in this browser. Upload a voice message or type it instead.');return;}
    setError('');setText('');setClip(null);const id=++generation.current;
    try {
      const media=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!alive.current || id!==generation.current){media.getTracks().forEach(track=>track.stop());return;}
      stream.current=media;const next=new MediaRecorder(media);recorder.current=next;const chunks:BlobPart[]=[];
      next.ondataavailable=event=>{if(event.data.size) chunks.push(event.data);};
      next.onstop=()=>{stopTracks();if(!alive.current || id!==generation.current)return;setRecording(false);setClip(new Blob(chunks,{type:next.mimeType}));setName('Recorded voice message');};
      next.onerror=()=>{generation.current++;stopTracks();if(alive.current){setRecording(false);setError('The recording stopped unexpectedly. Please try again.');}};
      next.start();setRecording(true);setElapsed(0);const start=Date.now();
      interval.current=setInterval(()=>{const seconds=Math.floor((Date.now()-start)/1000);setElapsed(seconds);if(seconds>=MAX_VOICE_SECONDS-1 && next.state==='recording')next.stop();},250);
    } catch(cause){stopTracks();if(alive.current){setRecording(false);setError(cause instanceof DOMException && cause.name==='NotAllowedError' ? 'Microphone access was declined. Upload a voice message or type it instead.' : 'Your microphone could not be opened. Try uploading a voice message.');}}
  }
  function discard(){generation.current++;abort.current?.abort();if(recorder.current?.state==='recording')recorder.current.stop();stopTracks();setRecording(false);setBusy(false);setClip(null);setText('');setError('');setElapsed(0);}
  async function transcribe(){
    if(!clip || busy || recording)return;setBusy(true);setError('');const id=++generation.current;const controller=new AbortController();abort.current=controller;
    const timer=setTimeout(()=>controller.abort(),25_000);
    try{
      const bytes=await prepareVoiceAudio(clip);inspectVoiceWav(bytes);
      if(controller.signal.aborted || id!==generation.current)return;
      const response=await fetch('/api/transcribe',{method:'POST',headers:{'Content-Type':'audio/wav'},body:bytes,signal:controller.signal});
      const result=await response.json().catch(()=>null);
      if(!response.ok || typeof result?.text!=='string')throw new Error(result?.error || 'This message could not be transcribed. Please retry.');
      if(alive.current && id===generation.current)setText(result.text);
    }catch(cause){if(alive.current && id===generation.current)setError(controller.signal.aborted ? 'Transcription took too long. Retry, or type the message.' : cause instanceof Error ? cause.message : 'This message could not be transcribed. Please retry.');}
    finally{clearTimeout(timer);if(alive.current && id===generation.current)setBusy(false);}
  }
  return <Dialog wide title="Give the conversation a voice." description={`Record or upload a short voice message, then review its words before using them as a ${speaker} message.`} onClose={onClose}>
    {!text && <div className="voice-capture"><div className={`voice-orb ${recording?'recording':''}`} aria-hidden="true"><Mic size={34}/>{recording && <span/>}</div><h3>{recording?'Listening to your message.':clip?'Ready to hear it back.':'A voice note, a clearer brief.'}</h3><p>{recording?`${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')} · Stops at two minutes`:'Up to two minutes. You choose what enters the conversation.'}</p><div className="voice-capture-actions">{recording?<button className="button primary" onClick={()=>recorder.current?.stop()}><Square size={14}/> Stop recording</button>:<button className="button primary" disabled={busy} onClick={record}><Mic size={16}/>{clip?'Record again':'Record voice message'}</button>}{!recording && <label className={`button subtle voice-upload ${busy?'disabled':''}`}><FileAudio size={16}/> Upload audio<input aria-label="Upload voice message" type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>10_000_000){setError('Choose an audio file below 10 MB and up to two minutes long.');return;}generation.current++;setClip(file);setName(file.name);setText('');setError('');}}/></label>}</div></div>}
    {clip && !recording && <div className="voice-playback"><span><FileAudio size={16}/>{name}</span><audio controls src={audioUrl || undefined} aria-label="Play voice message"/><button className="text-button" disabled={busy} onClick={discard}><RotateCcw size={14}/> Start over</button></div>}
    {text && <div className="voice-transcript"><span>YOUR WORDS, FOR REVIEW</span><label htmlFor="voice-transcript">Check names, dates and numbers before continuing.</label><textarea id="voice-transcript" rows={6} value={text} maxLength={8000} onChange={event=>setText(event.target.value)}/><div className={text.length>1000?'voice-limit over':'voice-limit'}>{text.length}/1,000 characters{text.length>1000 && ' · Shorten this message before using it.'}</div></div>}
    {error && <p className="dialog-error" role="alert">{error}</p>}
    <div className="voice-footer"><p>{text?'The transcript will be placed in your composer for another review.':busy?'Transcribing your voice message…':'Transcribe sends this audio to OpenAI. FormBridge does not save the audio.'}</p>{text?<button className="button primary" disabled={!text.trim() || text.length>1000} onClick={()=>onUse(text.trim())}>Use in composer <ArrowRight size={15}/></button>:<button className="button primary" disabled={!clip || recording || busy} onClick={transcribe}>{busy?<LoaderCircle className="spin" size={16}/>:<FileAudio size={16}/>} {busy?'Transcribing…':error?'Retry transcription':'Transcribe message'}</button>}</div>
  </Dialog>;
}
