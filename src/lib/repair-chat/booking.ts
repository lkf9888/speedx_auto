/**
 * Appointment slots the estimate assistant offers: Monday–Saturday, half-hour
 * slots starting 11:00 through 16:30 (so every visit starts by 17:00), shop
 * time (America/Vancouver), excluding BC statutory holidays and Boxing Day.
 * Extra closed days come from REPAIR_BOOKING_CLOSED_DATES on the server.
 *
 * A booking is a request: the shop confirms it by phone or WhatsApp.
 */

export const SLOT_TIMES = [
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
] as const;

/** How far ahead a visitor can book, and how soon a same-day slot can be. */
export const BOOKING_DAYS_AHEAD = 30;
export const MIN_NOTICE_MINUTES = 120;

export interface BookableDay {
  date: string; // YYYY-MM-DD, shop time
  slots: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function utcDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date: string, days: number): string {
  const next = utcDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return iso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return utcDate(date).getUTCDay();
}

/** The n-th given weekday of a month (n = 1 for the first). */
function nthWeekday(year: number, month: number, day: number, n: number): string {
  const first = iso(year, month, 1);
  const offset = (day - weekday(first) + 7) % 7;
  return addDays(first, offset + (n - 1) * 7);
}

/** Western Easter Sunday (anonymous Gregorian algorithm). */
function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

/** BC statutory holidays plus Boxing Day; a fixed date on a Sunday moves to Monday. */
export function shopHolidays(year: number): Set<string> {
  const fixed = [iso(year, 1, 1), iso(year, 7, 1), iso(year, 9, 30), iso(year, 11, 11), iso(year, 12, 25), iso(year, 12, 26)];
  const days = new Set<string>();
  for (const date of fixed) {
    days.add(date);
    if (weekday(date) === 0) days.add(addDays(date, 1));
  }
  // Christmas on a Saturday or Sunday pushes Boxing Day's closure to Monday/Tuesday.
  if (weekday(iso(year, 12, 25)) === 6) days.add(iso(year, 12, 27));
  const may25 = iso(year, 5, 25);
  days.add(addDays(may25, -((weekday(may25) + 6) % 7 || 7))); // Victoria Day: Monday before May 25
  days.add(nthWeekday(year, 2, 1, 3)); // Family Day
  days.add(addDays(easter(year), -2)); // Good Friday
  days.add(nthWeekday(year, 8, 1, 1)); // BC Day
  days.add(nthWeekday(year, 9, 1, 1)); // Labour Day
  days.add(nthWeekday(year, 10, 1, 2)); // Thanksgiving
  return days;
}

export function isOpenDay(date: string, extraClosed: ReadonlySet<string> = new Set()): boolean {
  if (weekday(date) === 0) return false;
  if (extraClosed.has(date)) return false;
  return !shopHolidays(Number(date.slice(0, 4))).has(date);
}

const shopClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Today's date and the minutes since midnight, in shop time. */
export function shopNow(now: Date): { date: string; minutes: number } {
  const parts = Object.fromEntries(shopClock.formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const slotMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export function parseClosedDates(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(/[\s,]+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
}

export function bookableDays(now: Date, extraClosed: ReadonlySet<string> = new Set()): BookableDay[] {
  const today = shopNow(now);
  const days: BookableDay[] = [];
  for (let i = 0; i <= BOOKING_DAYS_AHEAD; i += 1) {
    const date = addDays(today.date, i);
    if (!isOpenDay(date, extraClosed)) continue;
    const slots = SLOT_TIMES.filter((t) => i > 0 || slotMinutes(t) >= today.minutes + MIN_NOTICE_MINUTES);
    if (slots.length > 0) days.push({ date, slots: [...slots] });
  }
  return days;
}

export function isBookable(date: string, time: string, now: Date, extraClosed: ReadonlySet<string> = new Set()): boolean {
  return bookableDays(now, extraClosed).some((d) => d.date === date && d.slots.includes(time));
}
