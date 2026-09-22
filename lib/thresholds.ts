// Safe limits used to flag readings red on the dashboard, raise a pond's
// "Needs attention" alert, and draw the "safe range" bands on trend charts.
// One place, so all three agree.

export type SafeRange =
  // `strict`: the limit itself is already out of range ("under 1000" means 1000 is too high).
  | { kind: "min"; lo: number; strict?: boolean }
  | { kind: "max"; hi: number; strict?: boolean }
  | { kind: "range"; lo: number; hi: number };

export const SAFE_RANGES: Record<string, SafeRange> = {
  // Water
  do_am: { kind: "min", lo: 4 },
  do_pm: { kind: "min", lo: 4 },
  ph_am: { kind: "range", lo: 7.5, hi: 8.5 },
  ph_pm: { kind: "range", lo: 7.5, hi: 8.5 },
  tan: { kind: "max", hi: 1, strict: true }, // ammonia < 1 ppm
  nitrite: { kind: "max", hi: 0.1 },
  phosphate: { kind: "max", hi: 1, strict: true }, // PO4 < 1 ppm
  salinity: { kind: "range", lo: 15, hi: 30 },
  alkalinity: { kind: "range", lo: 120, hi: 200 },
  // Bacteria
  vibrio_percentage: { kind: "max", hi: 5, strict: true }, // total vibrio < 5% of TBC
  yellow_vibrio: { kind: "max", hi: 1000, strict: true }, // under 1,000 cfu/mL
  green_vibrio: { kind: "max", hi: 0 }, // should be 0
  black_vibrio: { kind: "max", hi: 0 }, // should be 0
  // Plankton
  total_plankton: { kind: "range", lo: 500_000, hi: 2_000_000 },
};

/**
 * Plankton groups that must stay below a share of total plankton (percent).
 * These need the day's total, so they are checked with `plankton share`, not SAFE_RANGES.
 */
export const PLANKTON_SHARE_MAX: Record<string, number> = {
  plankton_protozoa: 10,
  plankton_dino: 5,
  plankton_eugle: 5,
  plankton_yga: 10,
  plankton_bga: 10,
};

/** Feeds whose tray check took longer than this are flagged as slow eating. */
export const SLOW_TRAY_MIN = 120;

export function outOfRange(key: string, value: number | null | undefined): boolean {
  const range = SAFE_RANGES[key];
  if (!range || value === null || value === undefined || !Number.isFinite(value)) return false;
  if (range.kind === "min") return range.strict ? value <= range.lo : value < range.lo;
  if (range.kind === "max") return range.strict ? value >= range.hi : value > range.hi;
  return value < range.lo || value > range.hi;
}

/** A plankton group's share of the total is at or above its limit. */
export function shareTooHigh(key: string, value: number, total: number): boolean {
  const max = PLANKTON_SHARE_MAX[key];
  if (max === undefined || !(total > 0) || !Number.isFinite(value)) return false;
  return (value / total) * 100 >= max;
}
