import type { Cycle, PredictionConfig } from "./api";
import { docFor, todayIso } from "./dates";

// Cycle statuses: the backend stores free text. The UI writes these three.
export type CycleStatus = "active" | "completed" | "crashed";

/** "3" reads as "Cycle 3"; free-text names are shown as typed. */
export function cycleLabel(cycle: Pick<Cycle, "name">): string {
  return /^\d+$/.test(cycle.name.trim()) ? `Cycle ${cycle.name.trim()}` : cycle.name;
}

export function isActive(cycle: Cycle): boolean {
  return cycle.status === "active";
}

/** Newest first by start date. */
export function byStartDesc(a: Cycle, b: Cycle): number {
  // Same start day: the one still running, then the one that ended last, comes first.
  return (
    b.start_date.localeCompare(a.start_date) ||
    (b.actual_end_date ?? "9999").localeCompare(a.actual_end_date ?? "9999") ||
    (Number(b.name) || 0) - (Number(a.name) || 0)
  );
}

/** Next cycle name for a pond: one above its highest numeric name, or blank when names are free text. */
export function nextCycleName(cycles: Cycle[], pondId: string): string {
  const nums = cycles.filter((c) => c.pond_id === pondId && /^\d+$/.test(c.name.trim())).map((c) => parseInt(c.name.trim(), 10));
  return nums.length ? String(Math.max(...nums) + 1) : cycles.some((c) => c.pond_id === pondId) ? "" : "1";
}

/**
 * The cycle a pond is running now: its most recently started active cycle.
 * A pond can hold several "active" rows (old data), so pick the newest.
 */
export function currentCycle(cycles: Cycle[], pondId: string): Cycle | null {
  return cycles.filter((c) => c.pond_id === pondId && isActive(c)).sort(byStartDesc)[0] ?? null;
}

/** Every cycle of a pond except the current one, newest first. */
export function pastCycles(cycles: Cycle[], pondId: string): Cycle[] {
  const current = currentCycle(cycles, pondId);
  return cycles.filter((c) => c.pond_id === pondId && c.id !== current?.id).sort(byStartDesc);
}

/** Last day a cycle can be logged: its end date when closed, else today + 30 (planning ahead). */
export function lastLoggableDoc(cycle: Cycle): number {
  if (cycle.actual_end_date) return docFor(cycle.start_date, cycle.actual_end_date);
  return docFor(cycle.start_date, todayIso()) + 30;
}

export function todayDoc(cycle: Cycle): number {
  return docFor(cycle.start_date, todayIso());
}

/** Target final DOC from the planned end date. */
export function targetDoc(cycle: Cycle): number | null {
  return cycle.planned_end_date ? docFor(cycle.start_date, cycle.planned_end_date) : null;
}

export function statusLabel(status: string): string {
  if (status === "active") return "Active";
  if (status === "completed") return "Finished";
  if (status === "crashed") return "Crashed";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Tailwind text colour for a cycle status. */
export function statusText(status: string): string {
  if (status === "active") return "text-accent";
  if (status === "crashed") return "text-bad";
  return "text-tx-muted";
}

// Defaults used when a cycle has no prediction settings yet. Same values the
// previous cycle form started from.
export const DEFAULT_PREDICTION_CONFIG: PredictionConfig = {
  cycle: { preparation_day: 20, maximum_shrimp_size_g: 100 },
  growth: {
    target_fcr: 1.3,
    maximum_adg_g_per_day: 0.5,
    initial_feeding_index: 0.55,
    feeding_index_increment: 0.01,
    maximum_feeding_index: 0.7,
  },
  capacity: { stable_carrying_capacity_kg_per_m2: 2, final_carrying_capacity_kg_per_m2: 3 },
  harvest: { minimum_partial_harvest_biomass_kg: 350, harvest_fixed_cost_per_event: 500000 },
  prices: {
    harvest_price_points: [
      { count_size: 200, price_per_kg: 20000 },
      { count_size: 100, price_per_kg: 52000 },
      { count_size: 90, price_per_kg: 53000 },
      { count_size: 80, price_per_kg: 55000 },
      { count_size: 70, price_per_kg: 57000 },
      { count_size: 60, price_per_kg: 60000 },
      { count_size: 50, price_per_kg: 64000 },
      { count_size: 40, price_per_kg: 70000 },
      { count_size: 30, price_per_kg: 75000 },
      { count_size: 20, price_per_kg: 82000 },
    ],
  },
  costs: {
    pl_price_per_piece: 54,
    electricity_kwh: 6,
    electricity_price_per_kwh: 1590,
    labor_cost_per_day: 100000,
    probiotics_cost_per_day: 42000,
    disinfection_cost_per_day: 70000,
    liming_cost_per_day: 30000,
  },
  feed_plan: [],
};

/** Deep copy with numbers coerced (the API returns decimals as strings inside JSON). */
export function normalizeConfig(config: PredictionConfig | null | undefined): PredictionConfig {
  const src = config ?? DEFAULT_PREDICTION_CONFIG;
  const n = (v: unknown) => Number(v);
  return {
    cycle: { preparation_day: n(src.cycle.preparation_day), maximum_shrimp_size_g: n(src.cycle.maximum_shrimp_size_g) },
    growth: {
      target_fcr: n(src.growth.target_fcr),
      maximum_adg_g_per_day: n(src.growth.maximum_adg_g_per_day),
      initial_feeding_index: n(src.growth.initial_feeding_index),
      feeding_index_increment: n(src.growth.feeding_index_increment),
      maximum_feeding_index: n(src.growth.maximum_feeding_index),
    },
    capacity: {
      stable_carrying_capacity_kg_per_m2: n(src.capacity.stable_carrying_capacity_kg_per_m2),
      final_carrying_capacity_kg_per_m2: n(src.capacity.final_carrying_capacity_kg_per_m2),
    },
    harvest: {
      minimum_partial_harvest_biomass_kg: n(src.harvest.minimum_partial_harvest_biomass_kg),
      harvest_fixed_cost_per_event: n(src.harvest.harvest_fixed_cost_per_event),
    },
    prices: {
      harvest_price_points: src.prices.harvest_price_points.map((p) => ({ count_size: n(p.count_size), price_per_kg: n(p.price_per_kg) })),
    },
    costs: {
      pl_price_per_piece: n(src.costs.pl_price_per_piece),
      electricity_kwh: n(src.costs.electricity_kwh),
      electricity_price_per_kwh: n(src.costs.electricity_price_per_kwh),
      labor_cost_per_day: n(src.costs.labor_cost_per_day),
      probiotics_cost_per_day: n(src.costs.probiotics_cost_per_day),
      disinfection_cost_per_day: n(src.costs.disinfection_cost_per_day),
      liming_cost_per_day: n(src.costs.liming_cost_per_day),
    },
    feed_plan: src.feed_plan.map((r) => ({
      product_id: r.product_id,
      maximum_daily_feed_kg: n(r.maximum_daily_feed_kg),
      use_until_abw_g: n(r.use_until_abw_g),
    })),
  };
}
