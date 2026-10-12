import { z } from 'zod';
export const bookingProviders = { opentable: { name: 'OpenTable', hosts: ['opentable.com', 'opentable.com.au', 'opentable.co.uk'] }, sevenrooms: { name: 'SevenRooms', hosts: ['sevenrooms.com'] }, resy: { name: 'Resy', hosts: ['resy.com'] }, thefork: { name: 'TheFork', hosts: ['thefork.com', 'thefork.com.au', 'thefork.co.uk', 'thefork.fr', 'thefork.es', 'thefork.it'] } } as const;
export type BookingProvider = keyof typeof bookingProviders;
export const BOOKING_LINKS_KEY = 'formbridge-booking-pages-v1';
export interface BookingLink { provider: BookingProvider; url: string; restaurantName: string; city: string }
const schema = z.object({ provider: z.enum(['opentable','sevenrooms','resy','thefork']), url: z.string().max(2000), restaurantName: z.string().min(1).max(120), city: z.string().max(120) });
export function validateBookingLink(link: BookingLink): BookingLink {
  const parsed = schema.parse(link); const url = new URL(parsed.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Use the provider’s secure HTTPS booking-page URL.');
  if (!bookingProviders[parsed.provider].hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw new Error(`Use a booking-page URL from ${bookingProviders[parsed.provider].name}.`);
  return { ...parsed, url: url.toString() };
}
export function readBookingLinks(raw: string | null): BookingLink[] {
  try { const entries: unknown = JSON.parse(raw ?? '[]'); return Array.isArray(entries) ? entries.slice(0, 20).flatMap(entry => { try { return [validateBookingLink(entry)]; } catch { return []; } }) : []; } catch { return []; }
}
export function venueKey(name: string, city: string) { return `${name.trim().toLowerCase()}|${city.trim().toLowerCase()}`; }
