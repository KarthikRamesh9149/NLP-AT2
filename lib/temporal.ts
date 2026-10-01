// Shared, deterministic representations. A missing year or meridiem is never invented.
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthPattern = months.join('|');
const isoPattern = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const forwardPattern = new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i');
const reversePattern = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthPattern})(?:,?\\s+(\\d{4}))?\\b`, 'i');
const numbers: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30 };
export const cleanText = (text: string) => text.normalize('NFKC').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
export function digitWords(text: string): string {
  return cleanText(text).replace(/\b(twenty|thirty)[ -](one|two|three|four|five|six|seven|eight|nine)\b/g, (_, tens: string, units: string) => String(numbers[tens] + numbers[units]))
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty)\b/g, (word) => String(numbers[word]));
}
function ordinal(day: number): string { return `${day}${day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th')}`; }
export function validIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === text;
}
export interface CalendarDate { month: number; day: number; year: number | null; value: string }
export function calendarDate(text: string): CalendarDate | null {
  const iso = text.match(isoPattern);
  let month: number; let day: number; let year: number | null;
  if (iso) {
    if (!validIsoDate(iso[0])) return null;
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]);
  } else {
    const forward = text.match(forwardPattern);
    const reverse = text.match(reversePattern);
    const match = forward ?? reverse;
    if (!match) return null;
    month = months.findIndex((m) => m.toLowerCase() === match[forward ? 1 : 2].toLowerCase()) + 1;
    day = Number(match[forward ? 2 : 1]); year = match[3] ? Number(match[3]) : null;
    if (!validIsoDate(`${year ?? 2000}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)) return null;
  }
  return { month, day, year, value: year ? `${day} ${months[month - 1]} ${year}` : `${months[month - 1]} ${ordinal(day)}` };
}
export function isInvalidCalendarDate(text: string): boolean {
  return (isoPattern.test(text) || forwardPattern.test(text) || reversePattern.test(text)) && !calendarDate(text);
}
export function relativeDate(text: string, reference: string | null): string | null {
  if (!reference || !validIsoDate(reference)) return null;
  const value = cleanText(text);
  const offset = /\bday after tomorrow\b/.test(value) ? 2 : /\btomorrow\b/.test(value) ? 1 : /\btoday\b/.test(value) ? 0 : null;
  if (offset === null) return null;
  const date = new Date(`${reference}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function clockTime(text: string): string | null {
  let value = digitWords(text).replace(/\b(\d{1,2})\.(\d{2})\b/g, '$1:$2').replace(/o["']?clock/g, '').replace(/\b(?:in the |at )?(morning|afternoon|evening|night)\b/g, (_, period: string) => period === 'morning' ? 'am' : 'pm');
  if (/\bnoon\b/.test(value)) return '12 pm';
  if (/\bmidnight\b/.test(value)) return '12 am';
  value = value.replace(/\bhalf past (\d{1,2})\b/g, '$1:30').replace(/\b(?:a )?quarter past (\d{1,2})\b/g, '$1:15')
    .replace(/\b(?:a )?quarter to (\d{1,2})\b/g, (_, h: string) => `${Number(h) === 1 ? 12 : Number(h) - 1}:45`)
    .replace(/\ba\.?m\.?\b/g, 'am').replace(/\bp\.?m\.?\b/g, 'pm');
  const suffix = value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  const prefix = value.match(/\b(am|pm)\s*(\d{1,2})(?::(\d{2}))?\b/);
  if (suffix || prefix) {
    const h = Number(suffix?.[1] ?? prefix![2]); const m = Number(suffix?.[2] ?? prefix?.[3] ?? 0); const period = suffix?.[3] ?? prefix![1];
    if (h < 1 || h > 12 || m > 59) return null;
    return `${h}${m ? `:${String(m).padStart(2, '0')}` : ''} ${period}`;
  }
  const twentyFour = value.match(/\b(\d{1,2}):(\d{2})\b/);
  if (twentyFour && Number(twentyFour[1]) <= 23 && Number(twentyFour[2]) <= 59) {
    const h = Number(twentyFour[1]); const m = Number(twentyFour[2]);
    // 01:00–12:59 without a period is ambiguous in ordinary booking chat.
    if (h > 0 && h <= 12 && !/^0\d:/.test(twentyFour[0])) return null;
    return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
  }
  return null;
}
