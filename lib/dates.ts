// Calendar helpers. Dates travel as ISO "YYYY-MM-DD" strings and are handled
// as local calendar days, never as instants, so DOC arithmetic can't drift
// across a timezone boundary.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fromIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function todayIso(): string {
  return toIso(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / 86400000);
}

/** Day of culture: the start date is DOC 1. */
export function docFor(startDate: string, iso: string): number {
  return daysBetween(startDate, iso) + 1;
}

export function isoForDoc(startDate: string, doc: number): string {
  return addDays(startDate, doc - 1);
}

/** "Mon, 21 Sep 2026" */
export function longDate(iso: string): string {
  const d = fromIso(iso);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Mon, 21 Sep" */
export function mediumDate(iso: string): string {
  const d = fromIso(iso);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "21 Sep" */
export function shortDate(iso: string): string {
  const d = fromIso(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "21 Sep 2026" */
export function niceDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = fromIso(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Sep 2026" */
export function monthYear(iso: string): string {
  const d = fromIso(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function weekday(iso: string): string {
  return WEEKDAYS[fromIso(iso).getDay()];
}

/** "today" / "1 day ago" / "3 days ago" relative to a reference day. */
export function agoText(iso: string, reference: string): string {
  const a = daysBetween(iso, reference);
  if (a === 0) return "today";
  if (a === 1) return "1 day ago";
  if (a === -1) return "tomorrow";
  return a > 0 ? `${a} days ago` : `in ${-a} days`;
}

// ---- 24-hour times ----

/** "07:00:00" -> "07:00" */
export function hhmm(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : "";
}

/** Typing helper that shapes free input into HH:MM (phones' native pickers follow the 12/24h setting). */
export function fmt24(value: string): string {
  let t = String(value || "").replace(/[^0-9:]/g, "");
  if (t.includes(":")) {
    const parts = t.split(":");
    let h = parts[0].slice(0, 2);
    const m = parts.slice(1).join("").slice(0, 2);
    if (m.length === 2 && h.length === 1) h = "0" + h;
    return `${h}:${m}`;
  }
  t = t.slice(0, 4);
  return t.length <= 2 ? t : `${t.slice(0, 2)}:${t.slice(2)}`;
}

export function valid24(value: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  return !!m && +m[1] < 24 && +m[2] < 60;
}

export function nowHHMM(): string {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}
