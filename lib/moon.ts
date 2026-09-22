import { fromIso } from "./dates";

// Moon phase from the date alone, mirroring the backend's rule
// (app/services/lunar.py): a molt window opens 4 days before a full or new
// moon and closes 2 days after it. The backend uses ephemerides; this uses the
// mean synodic month, which lands within a few hours - fine for day-level cues.

const SYNODIC = 29.530588853;
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
const DAYS_BEFORE = 4;
const DAYS_AFTER = 2;

export type MoonDay = {
  illumination: number; // 0-1
  waxing: boolean;
  /** Signed days to the nearest full moon; negative once it has passed. */
  daysToFull: number;
  daysToNew: number;
  window: "full" | "new" | null;
  isPeak: boolean;
};

function signedNearest(age: number, target: number): number {
  let d = target - age;
  while (d > SYNODIC / 2) d -= SYNODIC;
  while (d < -SYNODIC / 2) d += SYNODIC;
  return d;
}

export function moonOn(iso: string): MoonDay {
  const d = fromIso(iso);
  const days = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12) / 86400000;
  let age = (days - NEW_MOON_REF) % SYNODIC;
  if (age < 0) age += SYNODIC;
  const daysToFull = signedNearest(age, SYNODIC / 2);
  const daysToNew = signedNearest(age, 0);
  const inWin = (x: number) => -DAYS_AFTER <= x && x <= DAYS_BEFORE;
  return {
    illumination: (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2,
    waxing: age < SYNODIC / 2,
    daysToFull,
    daysToNew,
    window: inWin(daysToFull) ? "full" : inWin(daysToNew) ? "new" : null,
    isPeak: Math.abs(daysToFull) <= 0.5 || Math.abs(daysToNew) <= 0.5,
  };
}

/** Next syzygy ahead of the day: which one and in how many whole days. */
export function nextSyzygy(m: MoonDay): { name: "full" | "new"; days: number } {
  const full = m.daysToFull >= 0 ? m.daysToFull : m.daysToFull + SYNODIC;
  const neu = m.daysToNew >= 0 ? m.daysToNew : m.daysToNew + SYNODIC;
  return full < neu ? { name: "full", days: Math.round(full) } : { name: "new", days: Math.round(neu) };
}

export function moonEmoji(m: MoonDay): string {
  const phases = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
  // Age fraction: waxing runs 0 -> 0.5, waning 0.5 -> 1.
  const frac = m.waxing ? Math.acos(1 - 2 * m.illumination) / (2 * Math.PI) : 1 - Math.acos(1 - 2 * m.illumination) / (2 * Math.PI);
  return phases[Math.round(frac * 8) % 8];
}
