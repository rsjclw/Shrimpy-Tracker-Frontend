import type { DayView, Feeding, FeedingAdditive, FeedingFeedType, WaterParameterSourceKey } from "@/lib/api";
import { hhmm } from "@/lib/dates";
import { fmtNum, num } from "@/lib/num";
import { SLOW_TRAY_MIN, outOfRange, shareTooHigh } from "@/lib/thresholds";

// ---- Water quality tiles ----

export type WaterTile = {
  id: string;
  label: string;
  keys: WaterParameterSourceKey[];
  unit: string;
};

export const WATER_TILES: WaterTile[] = [
  { id: "ph", label: "pH AM / PM", keys: ["ph_am", "ph_pm"], unit: "" },
  { id: "do", label: "DO AM / PM", keys: ["do_am", "do_pm"], unit: "ppm" },
  { id: "tan", label: "Ammonia (TAN)", keys: ["tan"], unit: "ppm" },
  { id: "salinity", label: "Salinity", keys: ["salinity"], unit: "ppt" },
  { id: "nitrite", label: "Nitrite", keys: ["nitrite"], unit: "ppm" },
  { id: "phosphate", label: "Phosphate", keys: ["phosphate"], unit: "ppm" },
  { id: "calcium", label: "Calcium", keys: ["calcium"], unit: "ppm" },
  { id: "magnesium", label: "Magnesium", keys: ["magnesium"], unit: "ppm" },
  { id: "alkalinity", label: "Alkalinity", keys: ["alkalinity"], unit: "ppm" },
  { id: "clarity", label: "Clarity AM / PM", keys: ["water_clarity_am", "water_clarity_pm"], unit: "cm" },
];

export const WATER_FIELDS: { key: WaterParameterSourceKey; label: string }[] = [
  { key: "ph_am", label: "pH AM" },
  { key: "ph_pm", label: "pH PM" },
  { key: "do_am", label: "DO AM" },
  { key: "do_pm", label: "DO PM" },
  { key: "tan", label: "Ammonia" },
  { key: "salinity", label: "Salinity" },
  { key: "nitrite", label: "Nitrite" },
  { key: "phosphate", label: "Phosphate" },
  { key: "calcium", label: "Calcium" },
  { key: "magnesium", label: "Magnesium" },
  { key: "alkalinity", label: "Alkalinity" },
  { key: "water_clarity_am", label: "Clarity AM" },
  { key: "water_clarity_pm", label: "Clarity PM" },
];

export type SegmentDef = { key: WaterParameterSourceKey; label: string; color: string };

export const PLANKTON_DEFS: SegmentDef[] = [
  { key: "plankton_ga", label: "GA", color: "#4ADE80" },
  { key: "plankton_bga", label: "BGA", color: "#22D3EE" },
  { key: "plankton_dino", label: "Dino", color: "#F87171" },
  { key: "plankton_diatom", label: "Diatom", color: "#FACC15" },
  { key: "plankton_protozoa", label: "Protozoa", color: "#C084FC" },
  { key: "plankton_zoo", label: "Zooplankton", color: "#F472B6" },
  { key: "plankton_yga", label: "YGA", color: "#A3E635" },
  { key: "plankton_eugle", label: "Euglena", color: "#FB923C" },
];

export const VIBRIO_DEFS: SegmentDef[] = [
  { key: "yellow_vibrio", label: "Yellow", color: "#FACC15" },
  { key: "green_vibrio", label: "Green", color: "#4ADE80" },
  { key: "black_vibrio", label: "Black", color: "#64748B" },
];

export const BACTERIA_FIELDS: { key: WaterParameterSourceKey; label: string }[] = [
  { key: "tbc", label: "TBC" },
  { key: "yellow_vibrio", label: "Vibrio yellow" },
  { key: "green_vibrio", label: "Vibrio green" },
  { key: "black_vibrio", label: "Vibrio black" },
];

export type Reading = { value: number; date: string };

/** Latest non-empty reading of a water key on or before the viewed day. `days` must be newest first. */
export function latestReading(days: DayView[], key: WaterParameterSourceKey): Reading | null {
  for (const d of days) {
    const v = num(d.water?.[key]);
    if (Number.isFinite(v)) return { value: v, date: d.date };
  }
  return null;
}

/** Newest day (on or before the viewed day) where any of the keys was measured. */
export function latestSampleDay(days: DayView[], keys: WaterParameterSourceKey[]): DayView | null {
  return days.find((d) => keys.some((k) => Number.isFinite(num(d.water?.[k])))) ?? null;
}

export function sumKeys(day: DayView | null, keys: WaterParameterSourceKey[]): number {
  if (!day?.water) return 0;
  return keys.reduce((t, k) => t + (Number.isFinite(num(day.water?.[k])) ? num(day.water?.[k]) : 0), 0);
}

// ---- Feed schedule ----

export type FeedStatus = "done" | "next" | "missed" | "upcoming" | "planned" | "notlogged";
export type DayKind = "today" | "past" | "future";

export function sortFeedings(list: Feeding[]): Feeding[] {
  return [...list].sort((a, b) => a.feed_time.localeCompare(b.feed_time));
}

/** Status of each feed on a day, mirroring the mockup: tray minutes logged = done. */
export function feedStatuses(list: Feeding[], kind: DayKind, now: string): FeedStatus[] {
  let nextFound = false;
  return sortFeedings(list).map((f) => {
    if (f.duration_min !== null && f.duration_min !== undefined) return "done";
    if (kind === "past") return "notlogged";
    if (kind === "future") return "planned";
    if (hhmm(f.feed_time) < now) return "missed";
    if (!nextFound) {
      nextFound = true;
      return "next";
    }
    return "upcoming";
  });
}

export function isSlowTray(f: Feeding): boolean {
  return f.duration_min !== null && f.duration_min !== undefined && f.duration_min > SLOW_TRAY_MIN;
}

export function feedTypeLabel(types: Pick<FeedingFeedType, "brand" | "type" | "percentage">[]): string {
  if (!types.length) return "";
  if (types.length === 1) return `${types[0].brand} ${types[0].type}`.trim();
  return types.map((t) => `${t.type} ${Math.round(num(t.percentage))}%`).join(" + ");
}

export function additiveLabel(additives: FeedingAdditive[]): string {
  return additives.map((a) => `${a.name} ${fmtNum(a.dose_per_kg, 3)} ${a.dose_unit || "g"}/kg`).join(", ");
}

export function dayFeedKg(day: DayView | null): number {
  return (day?.feedings ?? []).reduce((t, f) => t + num(f.amount_kg), 0);
}

/** Four sessions four hours apart from the pond's first feeding time. */
export function sessionTimesFor(firstFeed: string | null | undefined, count = 4): string[] {
  const anchor = firstFeed?.slice(0, 5) || "06:00";
  const [h, m] = anchor.split(":").map(Number);
  const start = (h || 0) * 60 + (m || 0);
  return Array.from({ length: count }, (_, i) => {
    const t = (start + i * 240) % (24 * 60);
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  });
}

/** Reasons a pond needs attention today: readings outside their safe range. Missed feeds show on the schedule only. */
export function alertsFor(day: DayView | null): string[] {
  const w = day?.water;
  if (!w) return [];
  const out: string[] = [];
  const read = (key: string) => num((w as unknown as Record<string, string | null>)[key]);
  const check = (key: string, label: string) => {
    if (outOfRange(key, read(key))) out.push(label);
  };
  check("do_am", "DO AM");
  check("do_pm", "DO PM");
  check("ph_am", "pH AM");
  check("ph_pm", "pH PM");
  check("tan", "Ammonia");
  check("nitrite", "Nitrite");
  check("phosphate", "Phosphate");
  check("salinity", "Salinity");
  check("alkalinity", "Alkalinity");
  check("vibrio_percentage", "Vibrio %");
  check("yellow_vibrio", "Yellow vibrio");
  check("green_vibrio", "Green vibrio");
  check("black_vibrio", "Black vibrio");
  const total = sumKeys(day, PLANKTON_DEFS.map((d) => d.key));
  if (total > 0) {
    if (outOfRange("total_plankton", total)) out.push("Total plankton");
    PLANKTON_DEFS.forEach((d) => {
      if (shareTooHigh(d.key, read(d.key), total)) out.push(d.label);
    });
  }
  return out;
}

/** Collapsed-card hint about today's feeding. */
export function nextFeedHint(day: DayView | null, now: string): { label: string; value: string; tone: "accent" | "warn" | "good" | "faint" } {
  if (!day || day.feedings.length === 0) return { label: "Feed today", value: "No schedule", tone: "faint" };
  const sorted = sortFeedings(day.feedings);
  const statuses = feedStatuses(day.feedings, "today", now);
  const nextIdx = statuses.indexOf("next");
  if (nextIdx >= 0) {
    const f = sorted[nextIdx];
    return { label: "Next feed", value: `${hhmm(f.feed_time)} · ${fmtNum(f.amount_kg, 1)} kg`, tone: "accent" };
  }
  const missed = statuses.filter((s) => s === "missed").length;
  if (missed) return { label: "Feed today", value: `${missed} missed`, tone: "warn" };
  return { label: "Feed today", value: "All fed", tone: "good" };
}

/** Per-feed share of a day's total, in whole percent summing to 100. */
export function ratiosFromFeedings(list: Feeding[]): string[] | null {
  const sorted = sortFeedings(list);
  const total = sorted.reduce((t, f) => t + num(f.amount_kg), 0);
  if (!sorted.length || total <= 0) return null;
  const out = sorted.map((f) => Math.round((num(f.amount_kg) / total) * 100));
  out[out.length - 1] += 100 - out.reduce((t, r) => t + r, 0);
  return out.map(String);
}
