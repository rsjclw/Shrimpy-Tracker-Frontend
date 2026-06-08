"use client";

import { differenceInDays, parseISO } from "date-fns";
import { useState } from "react";

import {
  api,
  type Cycle,
  type DayView,
  type FeedType,
  type PredictionConfig,
  type PredictionJob,
} from "@/lib/api";

type PricePointDraft = { count_size: string; price_per_kg: string };
type FeedPlanDraft = {
  feed_type_id: string;
  maximum_daily_feed_kg: string;
  use_until_abw_g: string;
};
type PredictionConfigDraft = {
  preparation_day: string;
  maximum_shrimp_size_g: string;
  target_fcr: string;
  maximum_adg_g_per_day: string;
  initial_feeding_index: string;
  feeding_index_increment: string;
  maximum_feeding_index: string;
  stable_carrying_capacity_kg_per_m2: string;
  final_carrying_capacity_kg_per_m2: string;
  minimum_partial_harvest_biomass_kg: string;
  harvest_fixed_cost_per_event: string;
  pl_price_per_piece: string;
  electricity_kwh: string;
  electricity_price_per_kwh: string;
  labor_cost_per_day: string;
  probiotics_cost_per_day: string;
  disinfection_cost_per_day: string;
  liming_cost_per_day: string;
  price_points: PricePointDraft[];
  feed_plan: FeedPlanDraft[];
};

const DEFAULT_PRICE_POINTS: PricePointDraft[] = [
  { count_size: "200", price_per_kg: "20000" },
  { count_size: "100", price_per_kg: "52000" },
  { count_size: "90", price_per_kg: "53000" },
  { count_size: "80", price_per_kg: "55000" },
  { count_size: "70", price_per_kg: "57000" },
  { count_size: "60", price_per_kg: "60000" },
  { count_size: "50", price_per_kg: "64000" },
  { count_size: "40", price_per_kg: "70000" },
  { count_size: "30", price_per_kg: "75000" },
  { count_size: "20", price_per_kg: "82000" },
];
const DEFAULT_FEED_PLAN: FeedPlanDraft[] = [
  { feed_type_id: "", maximum_daily_feed_kg: "50", use_until_abw_g: "10" },
  { feed_type_id: "", maximum_daily_feed_kg: "65", use_until_abw_g: "998" },
  { feed_type_id: "", maximum_daily_feed_kg: "65", use_until_abw_g: "999" },
];

function Spinner({ light = false }: { light?: boolean }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 ${
        light ? "border-white/40 border-t-white" : "border-amber-200 border-t-amber-600"
      }`}
      aria-hidden="true"
    />
  );
}

function stringValue(value: number | string | null | undefined, fallback: string) {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function predictionConfigToDraft(
  config: PredictionConfig | null,
  feedTypes: FeedType[],
): PredictionConfigDraft {
  const defaultFeedId = feedTypes[0]?.id ?? "";
  const feedPlan = config?.feed_plan?.length
    ? config.feed_plan.map((row) => ({
        feed_type_id: row.feed_type_id || defaultFeedId,
        maximum_daily_feed_kg: stringValue(row.maximum_daily_feed_kg, ""),
        use_until_abw_g: stringValue(row.use_until_abw_g, ""),
      }))
    : DEFAULT_FEED_PLAN.map((row) => ({ ...row, feed_type_id: defaultFeedId }));

  return {
    preparation_day: stringValue(config?.cycle.preparation_day, "20"),
    maximum_shrimp_size_g: stringValue(config?.cycle.maximum_shrimp_size_g, "100"),
    target_fcr: stringValue(config?.growth.target_fcr, "1.3"),
    maximum_adg_g_per_day: stringValue(config?.growth.maximum_adg_g_per_day, "0.5"),
    initial_feeding_index: stringValue(config?.growth.initial_feeding_index, "0.55"),
    feeding_index_increment: stringValue(config?.growth.feeding_index_increment, "0.010"),
    maximum_feeding_index: stringValue(config?.growth.maximum_feeding_index, "0.7"),
    stable_carrying_capacity_kg_per_m2: stringValue(
      config?.capacity.stable_carrying_capacity_kg_per_m2,
      "2",
    ),
    final_carrying_capacity_kg_per_m2: stringValue(
      config?.capacity.final_carrying_capacity_kg_per_m2,
      "3",
    ),
    minimum_partial_harvest_biomass_kg: stringValue(
      config?.harvest.minimum_partial_harvest_biomass_kg,
      "350",
    ),
    harvest_fixed_cost_per_event: stringValue(config?.harvest.harvest_fixed_cost_per_event, "500000"),
    pl_price_per_piece: stringValue(config?.costs.pl_price_per_piece, "54"),
    electricity_kwh: stringValue(config?.costs.electricity_kwh, "6"),
    electricity_price_per_kwh: stringValue(config?.costs.electricity_price_per_kwh, "1590"),
    labor_cost_per_day: stringValue(config?.costs.labor_cost_per_day, "100000"),
    probiotics_cost_per_day: stringValue(config?.costs.probiotics_cost_per_day, "42000"),
    disinfection_cost_per_day: stringValue(config?.costs.disinfection_cost_per_day, "70000"),
    liming_cost_per_day: stringValue(config?.costs.liming_cost_per_day, "30000"),
    price_points: config?.prices.harvest_price_points?.length
      ? config.prices.harvest_price_points.map((row) => ({
          count_size: stringValue(row.count_size, ""),
          price_per_kg: stringValue(row.price_per_kg, ""),
        }))
      : DEFAULT_PRICE_POINTS.map((row) => ({ ...row })),
    feed_plan: feedPlan,
  };
}

function requiredNumber(value: string, label: string) {
  const trimmed = value.trim();
  const number = Number(trimmed);
  if (!trimmed || !Number.isFinite(number)) {
    throw new Error(`${label} must be a number.`);
  }
  return number;
}

function buildPredictionConfig(draft: PredictionConfigDraft): PredictionConfig {
  if (!draft.feed_plan.length) throw new Error("Feed plan needs at least one row.");
  if (!draft.price_points.length) throw new Error("Harvest prices need at least one row.");
  draft.feed_plan.forEach((row, index) => {
    if (!row.feed_type_id) throw new Error(`Feed plan row ${index + 1} needs a feed.`);
  });

  return {
    cycle: {
      preparation_day: Math.floor(requiredNumber(draft.preparation_day, "Preparation days")),
      maximum_shrimp_size_g: requiredNumber(draft.maximum_shrimp_size_g, "Max shrimp size"),
    },
    growth: {
      target_fcr: requiredNumber(draft.target_fcr, "Target FCR"),
      maximum_adg_g_per_day: requiredNumber(draft.maximum_adg_g_per_day, "Max ADG"),
      initial_feeding_index: requiredNumber(draft.initial_feeding_index, "Initial feeding index"),
      feeding_index_increment: requiredNumber(draft.feeding_index_increment, "Feeding index increment"),
      maximum_feeding_index: requiredNumber(draft.maximum_feeding_index, "Max feeding index"),
    },
    capacity: {
      stable_carrying_capacity_kg_per_m2: requiredNumber(
        draft.stable_carrying_capacity_kg_per_m2,
        "Stable capacity",
      ),
      final_carrying_capacity_kg_per_m2: requiredNumber(
        draft.final_carrying_capacity_kg_per_m2,
        "Final capacity",
      ),
    },
    harvest: {
      minimum_partial_harvest_biomass_kg: requiredNumber(
        draft.minimum_partial_harvest_biomass_kg,
        "Min partial harvest",
      ),
      harvest_fixed_cost_per_event: requiredNumber(
        draft.harvest_fixed_cost_per_event,
        "Harvest fixed cost",
      ),
    },
    prices: {
      harvest_price_points: draft.price_points.map((row, index) => ({
        count_size: requiredNumber(row.count_size, `Price row ${index + 1} count size`),
        price_per_kg: requiredNumber(row.price_per_kg, `Price row ${index + 1} price/kg`),
      })),
    },
    costs: {
      pl_price_per_piece: requiredNumber(draft.pl_price_per_piece, "PL price/piece"),
      electricity_kwh: requiredNumber(draft.electricity_kwh, "Electricity kW"),
      electricity_price_per_kwh: requiredNumber(
        draft.electricity_price_per_kwh,
        "Electricity price/kWh",
      ),
      labor_cost_per_day: requiredNumber(draft.labor_cost_per_day, "Labor/day"),
      probiotics_cost_per_day: requiredNumber(draft.probiotics_cost_per_day, "Probiotics/day"),
      disinfection_cost_per_day: requiredNumber(draft.disinfection_cost_per_day, "Disinfection/day"),
      liming_cost_per_day: requiredNumber(draft.liming_cost_per_day, "Liming/day"),
    },
    feed_plan: draft.feed_plan.map((row, index) => ({
      feed_type_id: row.feed_type_id,
      maximum_daily_feed_kg: requiredNumber(row.maximum_daily_feed_kg, `Feed row ${index + 1} max kg`),
      use_until_abw_g: requiredNumber(row.use_until_abw_g, `Feed row ${index + 1} max ABW`),
    })),
  };
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
  min = "0.0001",
  step = "any",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  min?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <input
        required
        type="number"
        min={min}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border rounded px-3 py-2 disabled:bg-slate-50"
      />
    </label>
  );
}

export function PredictModal({
  cycle,
  day,
  feedTypes,
  onClose,
  onStarted,
  onCycleUpdated,
}: {
  cycle: Cycle;
  day: DayView;
  feedTypes: FeedType[];
  onClose: () => void;
  onStarted: (job: PredictionJob) => void;
  onCycleUpdated?: (cycle: Cycle) => void;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimizePartialHarvests, setOptimizePartialHarvests] = useState(true);
  const [configDraft, setConfigDraft] = useState(() =>
    predictionConfigToDraft(cycle.prediction_config, feedTypes),
  );
  const defaultTargetDoc = cycle.planned_end_date
    ? differenceInDays(parseISO(cycle.planned_end_date), parseISO(cycle.start_date)) + 1
    : "";
  const [targetDocDraft, setTargetDocDraft] = useState(
    defaultTargetDoc === "" ? "" : String(defaultTargetDoc),
  );

  const startDoc = day.metrics.doc;
  const targetDocNumber = Number(targetDocDraft);
  const targetDoc = Number.isInteger(targetDocNumber) && targetDocNumber >= 1
    ? targetDocNumber
    : Number.NaN;
  const canPreview = !Number.isNaN(targetDoc) && targetDoc >= startDoc && feedTypes.length > 0;

  function updateDraft<K extends keyof PredictionConfigDraft>(
    key: K,
    value: PredictionConfigDraft[K],
  ) {
    setConfigDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function requestBody() {
    return {
      start_date: day.date,
      target_doc: targetDoc,
      optimize_partial_harvests: optimizePartialHarvests,
    };
  }

  async function startPrediction(e: React.FormEvent) {
    e.preventDefault();
    if (!canPreview || starting) return;
    setStarting(true);
    setError(null);
    try {
      const predictionConfig = buildPredictionConfig(configDraft);
      const updatedCycle = await api.updateCycle(cycle.id, { prediction_config: predictionConfig });
      onCycleUpdated?.(updatedCycle);
      const started = await api.startPredictionPreviewJob(cycle.id, requestBody());
      onStarted(started);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start prediction.");
      setStarting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={startPrediction}
        className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto space-y-4 p-6"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Predict future feeding</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={starting}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none disabled:opacity-40"
            aria-label="Close"
          >
            x
          </button>
        </div>

        {defaultTargetDoc === "" && (
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            No planned end date set for this cycle. Enter a target DOC to predict.
          </p>
        )}

        {!feedTypes.length && (
          <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            Add at least one feed type in the farm feed catalog before predicting.
          </p>
        )}

        {Number.isNaN(targetDoc) && targetDocDraft.trim() && (
          <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            Target DOC must be a whole number.
          </p>
        )}

        {!Number.isNaN(targetDoc) && targetDoc < startDoc && (
          <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            The target DOC ({targetDoc}) is before the current day (DOC {startDoc}).
          </p>
        )}

        <section className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
          <label className="block text-sm">
            Target DOC
            <input
              type="number"
              step="1"
              min={startDoc}
              value={targetDocDraft}
              disabled={starting}
              onChange={(e) => {
                setTargetDocDraft(e.target.value);
                setError(null);
              }}
              placeholder="DOC"
              className="mt-1 w-full border rounded px-3 py-2 disabled:bg-slate-50"
              autoFocus
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm border rounded px-3 py-2">
            <input
              type="checkbox"
              checked={optimizePartialHarvests}
              disabled={starting}
              onChange={(e) => {
                setOptimizePartialHarvests(e.target.checked);
                setError(null);
              }}
            />
            Optimize partial harvests
          </label>
        </section>

        <div className="text-sm text-slate-600">
          Prediction starts at DOC <strong>{startDoc}</strong>
          {canPreview && (
            <>
              {" "}to DOC <strong>{targetDoc}</strong>
              {" "}({targetDoc - startDoc + 1} days)
            </>
          )}
        </div>

        <section className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium">Growth</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <NumberField
              label="Preparation days"
              value={configDraft.preparation_day}
              onChange={(value) => updateDraft("preparation_day", value)}
              disabled={starting}
              min="0"
              step="1"
            />
            <NumberField
              label="Max shrimp size (g)"
              value={configDraft.maximum_shrimp_size_g}
              onChange={(value) => updateDraft("maximum_shrimp_size_g", value)}
              disabled={starting}
            />
            <NumberField
              label="Target FCR"
              value={configDraft.target_fcr}
              onChange={(value) => updateDraft("target_fcr", value)}
              disabled={starting}
            />
            <NumberField
              label="Max ADG (g/day)"
              value={configDraft.maximum_adg_g_per_day}
              onChange={(value) => updateDraft("maximum_adg_g_per_day", value)}
              disabled={starting}
            />
            <NumberField
              label="Initial feeding index"
              value={configDraft.initial_feeding_index}
              onChange={(value) => updateDraft("initial_feeding_index", value)}
              disabled={starting}
            />
            <NumberField
              label="Feeding index increment"
              value={configDraft.feeding_index_increment}
              onChange={(value) => updateDraft("feeding_index_increment", value)}
              disabled={starting}
            />
            <NumberField
              label="Max feeding index"
              value={configDraft.maximum_feeding_index}
              onChange={(value) => updateDraft("maximum_feeding_index", value)}
              disabled={starting}
            />
          </div>
        </section>

        <section className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium">Capacity and harvest</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <NumberField
              label="Stable capacity (kg/m2)"
              value={configDraft.stable_carrying_capacity_kg_per_m2}
              onChange={(value) => updateDraft("stable_carrying_capacity_kg_per_m2", value)}
              disabled={starting}
            />
            <NumberField
              label="Final capacity (kg/m2)"
              value={configDraft.final_carrying_capacity_kg_per_m2}
              onChange={(value) => updateDraft("final_carrying_capacity_kg_per_m2", value)}
              disabled={starting}
            />
            <NumberField
              label="Min partial harvest (kg)"
              value={configDraft.minimum_partial_harvest_biomass_kg}
              onChange={(value) => updateDraft("minimum_partial_harvest_biomass_kg", value)}
              disabled={starting}
            />
            <NumberField
              label="Harvest fixed cost"
              value={configDraft.harvest_fixed_cost_per_event}
              onChange={(value) => updateDraft("harvest_fixed_cost_per_event", value)}
              disabled={starting}
              min="0"
            />
          </div>
        </section>

        <section className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium">Costs</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <NumberField
              label="PL price/piece"
              value={configDraft.pl_price_per_piece}
              onChange={(value) => updateDraft("pl_price_per_piece", value)}
              disabled={starting}
              min="0"
            />
            <NumberField
              label="Electricity kW"
              value={configDraft.electricity_kwh}
              onChange={(value) => updateDraft("electricity_kwh", value)}
              disabled={starting}
              min="0"
            />
            <NumberField
              label="Electricity price/kWh"
              value={configDraft.electricity_price_per_kwh}
              onChange={(value) => updateDraft("electricity_price_per_kwh", value)}
              disabled={starting}
              min="0"
            />
            <NumberField
              label="Labor/day"
              value={configDraft.labor_cost_per_day}
              onChange={(value) => updateDraft("labor_cost_per_day", value)}
              disabled={starting}
              min="0"
            />
            <NumberField
              label="Probiotics/day"
              value={configDraft.probiotics_cost_per_day}
              onChange={(value) => updateDraft("probiotics_cost_per_day", value)}
              disabled={starting}
              min="0"
            />
            <NumberField
              label="Disinfection/day"
              value={configDraft.disinfection_cost_per_day}
              onChange={(value) => updateDraft("disinfection_cost_per_day", value)}
              disabled={starting}
              min="0"
            />
            <NumberField
              label="Liming/day"
              value={configDraft.liming_cost_per_day}
              onChange={(value) => updateDraft("liming_cost_per_day", value)}
              disabled={starting}
              min="0"
            />
          </div>
        </section>

        <section className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Feed plan</h3>
            <button
              type="button"
              onClick={() =>
                updateDraft("feed_plan", [
                  ...configDraft.feed_plan,
                  {
                    feed_type_id: feedTypes[0]?.id ?? "",
                    maximum_daily_feed_kg: "",
                    use_until_abw_g: "",
                  },
                ])
              }
              disabled={starting || !feedTypes.length}
              className="text-xs border px-2 py-1 rounded disabled:opacity-40"
            >
              + Feed
            </button>
          </div>
          <div className="space-y-2">
            {configDraft.feed_plan.map((row, index) => (
              <div key={index} className="grid sm:grid-cols-[1fr_140px_140px_56px] gap-2">
                <select
                  required
                  value={row.feed_type_id}
                  disabled={starting}
                  onChange={(e) => {
                    const next = [...configDraft.feed_plan];
                    next[index] = { ...row, feed_type_id: e.target.value };
                    updateDraft("feed_plan", next);
                  }}
                  className="border rounded px-3 py-2 disabled:bg-slate-50"
                >
                  <option value="">Select feed</option>
                  {feedTypes.map((feed) => (
                    <option key={feed.id} value={feed.id}>
                      {feed.brand} {feed.type} - {Number(feed.price_per_kg).toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}/kg
                    </option>
                  ))}
                </select>
                <input
                  required
                  type="number"
                  min="0.0001"
                  step="any"
                  value={row.maximum_daily_feed_kg}
                  disabled={starting}
                  onChange={(e) => {
                    const next = [...configDraft.feed_plan];
                    next[index] = { ...row, maximum_daily_feed_kg: e.target.value };
                    updateDraft("feed_plan", next);
                  }}
                  placeholder="Max kg"
                  className="border rounded px-3 py-2 disabled:bg-slate-50"
                />
                <input
                  required
                  type="number"
                  min="0.0001"
                  step="any"
                  value={row.use_until_abw_g}
                  disabled={starting}
                  onChange={(e) => {
                    const next = [...configDraft.feed_plan];
                    next[index] = { ...row, use_until_abw_g: e.target.value };
                    updateDraft("feed_plan", next);
                  }}
                  placeholder="Max ABW"
                  className="border rounded px-3 py-2 disabled:bg-slate-50"
                />
                <button
                  type="button"
                  disabled={starting || configDraft.feed_plan.length === 1}
                  onClick={() =>
                    updateDraft(
                      "feed_plan",
                      configDraft.feed_plan.filter((_, i) => i !== index),
                    )
                  }
                  className="border rounded px-2 py-2 text-xs disabled:opacity-40"
                >
                  Del
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Harvest prices</h3>
            <button
              type="button"
              onClick={() =>
                updateDraft("price_points", [
                  ...configDraft.price_points,
                  { count_size: "", price_per_kg: "" },
                ])
              }
              disabled={starting}
              className="text-xs border px-2 py-1 rounded disabled:opacity-40"
            >
              + Price
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {configDraft.price_points.map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_56px] gap-2">
                <input
                  required
                  type="number"
                  min="0.0001"
                  step="any"
                  value={row.count_size}
                  disabled={starting}
                  onChange={(e) => {
                    const next = [...configDraft.price_points];
                    next[index] = { ...row, count_size: e.target.value };
                    updateDraft("price_points", next);
                  }}
                  placeholder="Count"
                  className="border rounded px-3 py-2 disabled:bg-slate-50"
                />
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={row.price_per_kg}
                  disabled={starting}
                  onChange={(e) => {
                    const next = [...configDraft.price_points];
                    next[index] = { ...row, price_per_kg: e.target.value };
                    updateDraft("price_points", next);
                  }}
                  placeholder="Price/kg"
                  className="border rounded px-3 py-2 disabled:bg-slate-50"
                />
                <button
                  type="button"
                  disabled={starting || configDraft.price_points.length === 1}
                  onClick={() =>
                    updateDraft(
                      "price_points",
                      configDraft.price_points.filter((_, i) => i !== index),
                    )
                  }
                  className="border rounded px-2 py-2 text-xs disabled:opacity-40"
                >
                  Del
                </button>
              </div>
            ))}
          </div>
        </section>

        <p className="text-xs text-amber-600">
          Existing daily data from DOC {startDoc} onward will be cleared before prediction is written,
          except an ABW sample already saved on DOC {startDoc}.
          {canPreview && <> DOC {targetDoc} is treated as harvest day, so no feed will be added that day.</>}
        </p>

        {error && (
          <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <button
            type="submit"
            disabled={!canPreview || starting}
            className="inline-flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded text-sm hover:bg-amber-600 disabled:opacity-50"
          >
            {starting && <Spinner light />}
            {starting ? "Starting..." : "Predict"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={starting}
            className="border px-4 py-2 rounded text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
