// Draft/mapping helpers for the pond settings page. Kept separate from the
// components so the page and its sections can share the same shapes without
// import cycles.

import type { Cycle, Pond, PredictionConfig } from "@/lib/api";
import { DEFAULT_PREDICTION_CONFIG, normalizeConfig } from "@/lib/cycles";
import { docFor, hhmm, valid24 } from "@/lib/dates";
import { has, num } from "@/lib/num";

export type GeneralDraft = { name: string; area: string; firstFeed: string };

export function generalFromPond(pond: Pond): GeneralDraft {
  return { name: pond.name, area: pond.area_m2 ? String(Number(pond.area_m2)) : "", firstFeed: hhmm(pond.default_feed_time) || "06:00" };
}

export function generalErrors(g: GeneralDraft): string[] {
  const errors: string[] = [];
  if (!g.name.trim()) errors.push("Pond name is empty");
  if (!(num(g.area) > 0)) errors.push("Area must be more than 0");
  if (!valid24(g.firstFeed)) errors.push("First feeding must be a 24-hour time like 06:00");
  return errors;
}

export function generalEqual(a: GeneralDraft, b: GeneralDraft): boolean {
  return a.name === b.name && a.area === b.area && a.firstFeed === b.firstFeed;
}

let rowKeySeq = 0;
export function nextKey(prefix: string): string {
  rowKeySeq += 1;
  return `${prefix}${rowKeySeq}`;
}

export type FeedPlanRow = { key: string; feed_type_id: string; max: string; cutoff: string };
export type PricePointRow = { key: string; count: string; price: string };

export type CycleDraft = {
  name: string;
  prepDays: string;
  finalDoc: string; // blank = no target set
  initialFi: string;
  maxFi: string;
  fiInc: string;
  maxAdg: string;
  targetFcr: string;
  maxSize: string;
  stableCc: string;
  finalCc: string;
  feedPlan: FeedPlanRow[];
  minHarvest: string;
  harvestFixedCost: string;
  pricePoints: PricePointRow[];
  plPrice: string;
  elecKwh: string;
  elecPrice: string;
  labor: string;
  probiotics: string;
  disinfection: string;
  liming: string;
};

function draftFromConfig(cfg: PredictionConfig, name: string, finalDoc: string): CycleDraft {
  return {
    name,
    prepDays: String(cfg.cycle.preparation_day),
    finalDoc,
    initialFi: String(cfg.growth.initial_feeding_index),
    maxFi: String(cfg.growth.maximum_feeding_index),
    fiInc: String(cfg.growth.feeding_index_increment),
    maxAdg: String(cfg.growth.maximum_adg_g_per_day),
    targetFcr: String(cfg.growth.target_fcr),
    maxSize: String(cfg.cycle.maximum_shrimp_size_g),
    stableCc: String(cfg.capacity.stable_carrying_capacity_kg_per_m2),
    finalCc: String(cfg.capacity.final_carrying_capacity_kg_per_m2),
    feedPlan: cfg.feed_plan.map((r) => ({ key: nextKey("fp"), feed_type_id: r.feed_type_id, max: String(r.maximum_daily_feed_kg), cutoff: String(r.use_until_abw_g) })),
    minHarvest: String(cfg.harvest.minimum_partial_harvest_biomass_kg),
    harvestFixedCost: String(cfg.harvest.harvest_fixed_cost_per_event),
    pricePoints: cfg.prices.harvest_price_points.map((p) => ({ key: nextKey("pp"), count: String(p.count_size), price: String(p.price_per_kg) })),
    plPrice: String(cfg.costs.pl_price_per_piece),
    elecKwh: String(cfg.costs.electricity_kwh),
    elecPrice: String(cfg.costs.electricity_price_per_kwh),
    labor: String(cfg.costs.labor_cost_per_day),
    probiotics: String(cfg.costs.probiotics_cost_per_day),
    disinfection: String(cfg.costs.disinfection_cost_per_day),
    liming: String(cfg.costs.liming_cost_per_day),
  };
}

/** Draft for the active cycle's editable fields, seeded from its saved prediction_config (or defaults). */
export function cycleDraftFromCycle(cycle: Cycle): { draft: CycleDraft; usedDefaults: boolean } {
  const usedDefaults = !cycle.prediction_config;
  const cfg = normalizeConfig(cycle.prediction_config);
  const finalDoc = cycle.planned_end_date ? String(docFor(cycle.start_date, cycle.planned_end_date)) : "";
  return { usedDefaults, draft: draftFromConfig(cfg, cycle.name, finalDoc) };
}

export function buildPredictionConfig(d: CycleDraft): PredictionConfig {
  return {
    cycle: {
      preparation_day: Math.trunc(num(d.prepDays)) || 0,
      maximum_shrimp_size_g: num(d.maxSize),
    },
    growth: {
      target_fcr: num(d.targetFcr),
      maximum_adg_g_per_day: num(d.maxAdg),
      initial_feeding_index: num(d.initialFi),
      feeding_index_increment: num(d.fiInc),
      maximum_feeding_index: num(d.maxFi),
    },
    capacity: {
      stable_carrying_capacity_kg_per_m2: num(d.stableCc),
      final_carrying_capacity_kg_per_m2: num(d.finalCc),
    },
    harvest: {
      minimum_partial_harvest_biomass_kg: num(d.minHarvest),
      harvest_fixed_cost_per_event: num(d.harvestFixedCost),
    },
    prices: {
      harvest_price_points: d.pricePoints.map((p) => ({ count_size: num(p.count), price_per_kg: num(p.price) })),
    },
    costs: {
      pl_price_per_piece: num(d.plPrice),
      electricity_kwh: num(d.elecKwh),
      electricity_price_per_kwh: num(d.elecPrice),
      labor_cost_per_day: num(d.labor),
      probiotics_cost_per_day: num(d.probiotics),
      disinfection_cost_per_day: num(d.disinfection),
      liming_cost_per_day: num(d.liming),
    },
    feed_plan: d.feedPlan.map((r) => ({ feed_type_id: r.feed_type_id, maximum_daily_feed_kg: num(r.max), use_until_abw_g: num(r.cutoff) })),
  };
}

export function cycleErrors(d: CycleDraft): string[] {
  const e: string[] = [];
  if (!d.name.trim()) e.push("Cycle name is empty");
  if (!/^\d+$/.test(d.prepDays || "")) e.push("Preparation days must be a whole number");
  if (d.finalDoc.trim() && !(Number.isInteger(num(d.finalDoc)) && num(d.finalDoc) > 0)) {
    e.push("Target final DOC must be a whole number above 0");
  }
  if (!(num(d.initialFi) > 0)) e.push("Initial feeding index needs a number above 0");
  if (!(num(d.maxFi) > 0)) e.push("Max feeding index needs a number above 0");
  if (!(num(d.fiInc) > 0)) e.push("Index increment needs a number above 0");
  if (!(num(d.maxAdg) > 0)) e.push("Max ADG needs a number above 0");
  if (!(num(d.targetFcr) > 0)) e.push("Target FCR needs a number above 0");
  if (!(num(d.maxSize) > 0)) e.push("Max shrimp size needs a number above 0");
  if (!(num(d.stableCc) > 0)) e.push("Stable carrying capacity needs a number above 0");
  if (!(num(d.finalCc) > 0)) e.push("Final carrying capacity needs a number above 0");
  else if (num(d.finalCc) < num(d.stableCc)) e.push("Final carrying capacity is below stable");

  if (d.feedPlan.length === 0) e.push("Add at least one feed plan step");
  d.feedPlan.forEach((r, i) => {
    if (!r.feed_type_id) e.push(`Feed plan step ${i + 1} needs a feed type`);
    if (!(num(r.max) > 0)) e.push(`Feed plan step ${i + 1} needs the max daily feed`);
    if (!(num(r.cutoff) > 0)) e.push(`Feed plan step ${i + 1} needs the ABW cutoff`);
  });
  const cutoffs = d.feedPlan.map((r) => num(r.cutoff));
  cutoffs.forEach((c, i) => {
    if (Number.isFinite(c) && cutoffs.indexOf(c) !== i) e.push(`Two feed plan steps end at the same ABW (${c} g)`);
  });

  if (!(num(d.minHarvest) > 0)) e.push("Minimum partial harvest biomass needs a number above 0");
  if (!(num(d.harvestFixedCost) >= 0)) e.push("Harvest fixed cost can't be negative");
  if (d.pricePoints.length === 0) e.push("Add at least one harvest price point");
  d.pricePoints.forEach((p, i) => {
    if (!(num(p.count) > 0)) e.push(`Price point ${i + 1} needs a count size above 0`);
    if (!(num(p.price) > 0)) e.push(`Price point ${i + 1} needs a price above 0`);
  });
  if (!(num(d.plPrice) >= 0)) e.push("PL price can't be negative");
  if (!(num(d.elecKwh) >= 0)) e.push("Electricity kWh/day can't be negative");
  if (!(num(d.elecPrice) >= 0)) e.push("Electricity price can't be negative");
  if (!(num(d.labor) >= 0)) e.push("Labour cost can't be negative");
  if (!(num(d.probiotics) >= 0)) e.push("Probiotics cost can't be negative");
  if (!(num(d.disinfection) >= 0)) e.push("Disinfection cost can't be negative");
  if (!(num(d.liming) >= 0)) e.push("Liming cost can't be negative");
  return e;
}

function stripKeys(d: CycleDraft) {
  return {
    ...d,
    feedPlan: d.feedPlan.map(({ feed_type_id, max, cutoff }) => ({ feed_type_id, max, cutoff })),
    pricePoints: d.pricePoints.map(({ count, price }) => ({ count, price })),
  };
}

export function cycleEqual(a: CycleDraft, b: CycleDraft): boolean {
  return JSON.stringify(stripKeys(a)) === JSON.stringify(stripKeys(b));
}

/** Default draft used when starting a new cycle without copying a previous one. */
export function defaultCycleDraftFields() {
  return DEFAULT_PREDICTION_CONFIG;
}

export function crashReasonFromNotes(notes: string | null): string {
  if (!notes) return "";
  const marker = "Crashed:";
  const idx = notes.lastIndexOf(marker);
  if (idx === -1) return "";
  return notes.slice(idx + marker.length).trim();
}

export function sizePcsPerKg(gramsPerShrimp: number): number | null {
  if (!(gramsPerShrimp > 0)) return null;
  return Math.round(1000 / gramsPerShrimp);
}

export { has, num };
