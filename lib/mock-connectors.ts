import { z } from 'zod';
import type { RestaurantDesk } from './restaurant-desk';
import type { SavedSession } from './session';
import { reviewedSession } from './exports';
import { calendarDate, clockTime, validIsoDate } from './temporal';

export const providerNames={opentable:'OpenTable',sevenrooms:'SevenRooms',resy:'Resy',thefork:'TheFork'};
export const channelMessageSchema=z.object({id:z.string().trim().min(1).max(100),channel:z.enum(['email','whatsapp']),from:z.string().trim().min(1).max(120),name:z.string().trim().min(1).max(100),text:z.string().trim().min(1).max(1000)});
export function receiveMockMessage(desk:RestaurantDesk,event:z.infer<typeof channelMessageSchema>,caseId:string):RestaurantDesk {
  if(desk.inbox.some(item=>item.id===`${event.channel}:${event.id}`))return desk;
  if(!desk.connectors[event.channel])throw new Error('Enable this mock connector first.');
  if(desk.inbox.length>=300)throw new Error('The inbox has reached its limit.');
  return {...desk,inbox:[{...event,id:`${event.channel}:${event.id}`,caseId,receivedAt:new Date().toISOString(),simulation:true,read:false,replies:[]},...desk.inbox]};
}
export function mockAvailability(request:{date:string;time:string;partySize:number},scenario:'normal'|'full'|'unavailable'='normal') {
  if(!validIsoDate(request.date)||!/^\d{2}:\d{2}$/.test(request.time)||!clockTime(request.time)||!Number.isInteger(request.partySize)||request.partySize<1||request.partySize>30)throw new Error('An exact date, time and guest count are needed.');
  if(scenario==='unavailable')throw new Error('The mock booking provider is unavailable. Your enquiry is kept. Switch the test response to normal and retry.');
  const slots=scenario==='full'||request.partySize>12?[]:['17:30','18:00','18:30','19:00','19:30','20:00','20:30','21:00'].map(time=>({time,available:true}));
  return {simulation:true as const,date:request.date,partySize:request.partySize,slots};
}
export function bookingRequest(session:SavedSession) {
  if(!reviewedSession(session))throw new Error('Save a complete, approved brief before trying the booking handoff.');
  const date=calendarDate(session.brief.fields.date.value!),time=clockTime(session.brief.fields.time.value!);
  if(!date?.year||!time)throw new Error('Use an exact date including the year, and an exact time.');
  const match=time.match(/^(\d{1,2})(?::(\d{2}))? (am|pm)$/)!;
  return {date:`${date.year}-${String(date.month).padStart(2,'0')}-${String(date.day).padStart(2,'0')}`,time:`${String(Number(match[1])%12+(match[3]==='pm'?12:0)).padStart(2,'0')}:${match[2]||'00'}`,partySize:Number(session.brief.fields.partySize.value)};
}
export function mockReservation(session:SavedSession,provider:keyof typeof providerNames,key:string,scenario:'normal'|'full'|'unavailable'='normal') {
  const request=bookingRequest(session),availability=mockAvailability(request,scenario);
  if(!availability.slots.some(slot=>slot.time===request.time))throw new Error('No simulated table is available at the requested time. Keep the guest’s request and review another time with them.');
  let hash=2166136261; for(const character of key)hash=Math.imul(hash^character.charCodeAt(0),16777619);
  return {provider,reference:`SIM-${provider.toUpperCase()}-${(hash>>>0).toString(16).toUpperCase()}`,status:'simulated_confirmed' as const,simulation:true as const,request};
}
