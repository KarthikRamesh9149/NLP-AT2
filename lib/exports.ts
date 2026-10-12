import { FIELD_KEYS } from './state';
import { calendarDate, clockTime } from './temporal';
import { utf8Bytes } from './limits';
import type { SavedSession } from './session';
const labels = { restaurantName: 'Restaurant', city: 'City', date: 'Date', time: 'Time', partySize: 'Guests' };
export function reviewedSession(session: SavedSession): boolean {
  return !session.pendingAnalysis && session.brief.approvedRevision === session.brief.revision && FIELD_KEYS.every(key => session.brief.fields[key].status === 'resolved' && !!session.brief.fields[key].value && !session.brief.fields[key].review);
}
export function textExport(session: SavedSession, title: string, notes = ''): string {
  return ['FORMBRIDGE · BOOKING BRIEF', title, reviewedSession(session) ? 'Reviewed by staff' : session.pendingAnalysis ? 'UNFINISHED UPDATE · The details below may predate the latest messages.' : 'Draft · review required', '', ...FIELD_KEYS.map(key => `${labels[key]}: ${session.brief.fields[key].value ?? session.brief.fields[key].constraint ?? 'Not provided'}${session.brief.fields[key].status !== 'resolved' || session.brief.fields[key].review ? ' (needs review)' : ''}`), ...(notes ? ['', 'STAFF NOTES', notes] : []), '', 'This brief does not reserve a table.', '', 'CONVERSATION', ...session.messages.map(message => `${message.speaker === 'customer' ? 'Customer' : 'Staff'}: ${message.text}`)].join('\n');
}
const escapeCalendar = (text: string) => text.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
function foldCalendar(line: string): string {
  const parts: string[] = []; let part = '';
  for (const character of line) { if (utf8Bytes(part + character) > 75) { parts.push(part); part = ' '; } part += character; }
  parts.push(part); return parts.join('\r\n');
}
export function calendarExport(session: SavedSession): string {
  if (!reviewedSession(session)) throw new Error('Approve the complete brief before downloading a calendar reminder.');
  const date = calendarDate(session.brief.fields.date.value!); const time = clockTime(session.brief.fields.time.value!);
  if (!date?.year || !time) throw new Error('An exact date and time are needed for the calendar reminder.');
  const match = time.match(/^(\d{1,2})(?::(\d{2}))? (am|pm)$/)!;
  const hour = Number(match[1]) % 12 + (match[3] === 'pm' ? 12 : 0);
  const start = `${date.year}${String(date.month).padStart(2,'0')}${String(date.day).padStart(2,'0')}T${String(hour).padStart(2,'0')}${match[2] ?? '00'}00`;
  const now = new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const fields = session.brief.fields;
  // A floating time uses the calendar's local zone; no duration is invented.
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//FormBridge//Booking enquiry//EN','BEGIN:VEVENT',`UID:${crypto.randomUUID()}@formbridge`, `DTSTAMP:${now}`,`DTSTART:${start}`,`SUMMARY:${escapeCalendar(`Booking enquiry · ${fields.restaurantName.value}`)}`,`LOCATION:${escapeCalendar(`${fields.restaurantName.value}, ${fields.city.value}`)}`,`DESCRIPTION:${escapeCalendar(`Staff-reviewed enquiry for ${fields.partySize.value} guests. No table is reserved. Time uses your calendar’s local time zone.`)}`,'STATUS:TENTATIVE','END:VEVENT','END:VCALENDAR'].map(foldCalendar).join('\r\n')+'\r\n';
}
export function downloadFile(content: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a');
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}
