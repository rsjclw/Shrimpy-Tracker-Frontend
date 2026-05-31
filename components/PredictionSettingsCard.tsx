"use client";

import { useEffect, useMemo, useState } from "react";

import {
  api,
  type Cycle,
  type CycleFeedPlanRow,
  type FeedType,
  type HarvestPricePoint,
} from "@/lib/api";
import { formatFeedTypeName } from "@/lib/format";

type Props = {
  cycle: Cycle;
  feedTypes: FeedType[];
  canManage: boolean;
  onSaved: (cycle: Cycle) => void;
};

type FeedPlanDraftRow = {
  feed_type_id: string;
  brand: string;
  type: string;
  price_per_kg: string;
  use_until_abw_g: string;
  notes: string | null;
};

type ParsedPricePoint = {
  count_size: number;
  price_per_kg: number;
};

const inputClass = "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm";
const panelClass = "rounded-lg border border-slate-200 bg-slate-50/60 p-3";

function numberDraft(value: string | null | undefined, digits?: number) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return digits === undefined ? String(number) : number.toFixed(digits);
}

function nullableNumber(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

function formatPricePoints(points: HarvestPricePoint[] | undefined) {
  return (points ?? [])
    .map((point) => `${Number(point.count_size)},${Number(point.price_per_kg)}`)
    .join("; ");
}

function parsePricePoints(value: string): { points: ParsedPricePoint[]; error: string | null } {
  const trimmed = value.trim();
  if (!trimmed) return { points: [], error: null };

  const tokens = trimmed.split(/[,\s;]+/).filter(Boolean);
  if (tokens.length % 2 !== 0) {
    return { points: [], error: "Price table must contain count/price pairs." };
  }

  const seen = new Set<string>();
  const points: ParsedPricePoint[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const countSize = Number(tokens[i]);
    const pricePerKg = Number(tokens[i + 1]);
    if (!Number.isFinite(countSize) || countSize <= 0) {
      return { points: [], error: "Count size must be greater than zero." };
    }
    if (!Number.isFinite(pricePerKg) || pricePerKg < 0) {
      return { points: [], error: "Price/kg must be zero or greater." };
    }

    const duplicateKey = countSize.toString();
    if (seen.has(duplicateKey)) {
      return { points: [], error: "Count sizes must be unique." };
    }
    seen.add(duplicateKey);
    points.push({ count_size: countSize, price_per_kg: pricePerKg });
  }

  return {
    points: points.sort((a, b) => a.count_size - b.count_size),
    error: null,
  };
}

function feedPlanToDraft(feedPlan: CycleFeedPlanRow[] | undefined): FeedPlanDraftRow[] {
  return (feedPlan ?? []).map((row) => ({
    feed_type_id: row.feed_type_id,
    brand: row.brand,
    type: row.type,
    price_per_kg: numberDraft(row.price_per_kg),
    use_until_abw_g: numberDraft(row.use_until_abw_g),
    notes: row.notes,
  }));
}

function draftFromFeedType(feedType: FeedType): FeedPlanDraftRow {
  return {
    feed_type_id: feedType.id,
    brand: feedType.brand,
    type: feedType.type,
    price_per_kg: numberDraft(feedType.price_per_kg),
    use_until_abw_g: "",
    notes: feedType.notes,
  };
}

function selectFeedType(row: FeedPlanDraftRow, feedTypes: FeedType[], feedTypeId: string) {
  const feedType = feedTypes.find((item) => item.id === feedTypeId);
  if (!feedType) return { ...row, feed_type_id: feedTypeId };
  return {
    ...row,
    feed_type_id: feedType.id,
    brand: feedType.brand,
    type: feedType.type,
    price_per_kg: numberDraft(feedType.price_per_kg),
    notes: feedType.notes,
  };
}

export function PredictionSettingsCard({ cycle, feedTypes, canManage, onSaved }: Props) {
  const [priceDraft, setPriceDraft] = useState(formatPricePoints(cycle.harvest_price_points));
  const [stableCapacityDraft, setStableCapacityDraft] = useState(
    numberDraft(cycle.stable_carrying_capacity_kg_per_m2, 3),
  );
  const [finalCapacityDraft, setFinalCapacityDraft] = useState(
    numberDraft(cycle.final_carrying_capacity_kg_per_m2, 3),
  );
  const [plBrandDraft, setPlBrandDraft] = useState(cycle.pl_brand ?? "");
  const [plPriceDraft, setPlPriceDraft] = useState(numberDraft(cycle.pl_price_per_piece));
  const [electricityKwhDraft, setElectricityKwhDraft] = useState(
    numberDraft(cycle.electricity_kwh_per_day),
  );
  const [electricityPriceDraft, setElectricityPriceDraft] = useState(
    numberDraft(cycle.electricity_price_per_kwh),
  );
  const [probioticsDraft, setProbioticsDraft] = useState(numberDraft(cycle.probiotics_cost_per_day));
  const [disinfectionDraft, setDisinfectionDraft] = useState(
    numberDraft(cycle.disinfection_cost_per_day),
  );
  const [limingDraft, setLimingDraft] = useState(numberDraft(cycle.liming_cost_per_day));
  const [minimumHarvestDraft, setMinimumHarvestDraft] = useState(
    numberDraft(cycle.minimum_partial_harvest_biomass_kg, 3),
  );
  const [feedPlanDraft, setFeedPlanDraft] = useState(feedPlanToDraft(cycle.feed_plan));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPriceDraft(formatPricePoints(cycle.harvest_price_points));
    setStableCapacityDraft(numberDraft(cycle.stable_carrying_capacity_kg_per_m2, 3));
    setFinalCapacityDraft(numberDraft(cycle.final_carrying_capacity_kg_per_m2, 3));
    setPlBrandDraft(cycle.pl_brand ?? "");
    setPlPriceDraft(numberDraft(cycle.pl_price_per_piece));
    setElectricityKwhDraft(numberDraft(cycle.electricity_kwh_per_day));
    setElectricityPriceDraft(numberDraft(cycle.electricity_price_per_kwh));
    setProbioticsDraft(numberDraft(cycle.probiotics_cost_per_day));
    setDisinfectionDraft(numberDraft(cycle.disinfection_cost_per_day));
    setLimingDraft(numberDraft(cycle.liming_cost_per_day));
    setMinimumHarvestDraft(numberDraft(cycle.minimum_partial_harvest_biomass_kg, 3));
    setFeedPlanDraft(feedPlanToDraft(cycle.feed_plan));
    setError(null);
  }, [cycle]);

  const parsedPrices = useMemo(() => parsePricePoints(priceDraft), [priceDraft]);

  function validateNumber(value: string, label: string, allowZero = true) {
    if (!value.trim()) return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || (!allowZero && number <= 0)) {
      return `${label} must be ${allowZero ? "zero or greater" : "greater than zero"}.`;
    }
    return null;
  }

  function updateFeedPlanRow(index: number, next: FeedPlanDraftRow) {
    setFeedPlanDraft((rows) => rows.map((row, i) => (i === index ? next : row)));
  }

  function removeFeedPlanRow(index: number) {
    setFeedPlanDraft((rows) => rows.filter((_, i) => i !== index));
  }

  function addFeedPlanRow() {
    const feedType = feedTypes[0];
    if (!feedType) return;
    setFeedPlanDraft((rows) => [...rows, draftFromFeedType(feedType)]);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (parsedPrices.error) {
      setError(parsedPrices.error);
      return;
    }

    const numericError = [
      validateNumber(stableCapacityDraft, "Stable carrying capacity", false),
      validateNumber(finalCapacityDraft, "Final carrying capacity", false),
      validateNumber(plPriceDraft, "PL price"),
      validateNumber(electricityKwhDraft, "Electricity kWh/day"),
      validateNumber(electricityPriceDraft, "Electricity price/kWh"),
      validateNumber(probioticsDraft, "Probiotics cost/day"),
      validateNumber(disinfectionDraft, "Disinfection cost/day"),
      validateNumber(limingDraft, "Liming cost/day"),
      validateNumber(minimumHarvestDraft, "Minimum partial harvest biomass", false),
    ].find(Boolean);
    if (numericError) {
      setError(numericError);
      return;
    }

    const feedPlan = feedPlanDraft.map((row) => ({
      feed_type_id: row.feed_type_id,
      brand: row.brand,
      type: row.type,
      price_per_kg: Number(row.price_per_kg),
      use_until_abw_g: Number(row.use_until_abw_g),
      notes: row.notes,
    }));
    if (feedPlan.some((row) => !row.feed_type_id || !Number.isFinite(row.use_until_abw_g) || row.use_until_abw_g <= 0)) {
      setError("Feed plan rows need a feed type and ABW greater than zero.");
      return;
    }
    if (feedPlan.some((row) => !Number.isFinite(row.price_per_kg) || row.price_per_kg < 0)) {
      setError("Feed plan prices must be zero or greater.");
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateCycle(cycle.id, {
        harvest_price_points: parsedPrices.points,
        stable_carrying_capacity_kg_per_m2: nullableNumber(stableCapacityDraft),
        final_carrying_capacity_kg_per_m2: nullableNumber(finalCapacityDraft),
        pl_brand: plBrandDraft.trim() || null,
        pl_price_per_piece: nullableNumber(plPriceDraft),
        electricity_kwh_per_day: nullableNumber(electricityKwhDraft),
        electricity_price_per_kwh: nullableNumber(electricityPriceDraft),
        probiotics_cost_per_day: nullableNumber(probioticsDraft),
        disinfection_cost_per_day: nullableNumber(disinfectionDraft),
        liming_cost_per_day: nullableNumber(limingDraft),
        minimum_partial_harvest_biomass_kg: nullableNumber(minimumHarvestDraft),
        feed_plan: feedPlan.sort((a, b) => a.use_until_abw_g - b.use_until_abw_g),
      });
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save prediction settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg bg-white p-4 shadow">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Prediction settings</h3>
          <div className="text-xs text-slate-500">
            {parsedPrices.error ? "Invalid price table" : `${parsedPrices.points.length} price point${parsedPrices.points.length === 1 ? "" : "s"}`}
          </div>
        </div>
        {saved && <div className="text-xs text-emerald-600">Saved</div>}
      </div>

      <form onSubmit={save} className="space-y-3">
        <div className={panelClass}>
          <label className="block text-sm text-slate-700">
            Harvest price table
            <textarea
              value={priceDraft}
              onChange={(e) => setPriceDraft(e.target.value)}
              rows={3}
              disabled={!canManage}
              placeholder="100,54000; 90,56000; 85,57000"
              className={inputClass}
            />
          </label>
        </div>

        <div className={panelClass}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-700">
              Stable carrying capacity (kg/m2)
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={stableCapacityDraft}
                onChange={(e) => setStableCapacityDraft(e.target.value)}
                disabled={!canManage}
                className={inputClass}
              />
            </label>
            <label className="text-sm text-slate-700">
              Final carrying capacity (kg/m2)
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={finalCapacityDraft}
                onChange={(e) => setFinalCapacityDraft(e.target.value)}
                disabled={!canManage}
                className={inputClass}
              />
            </label>
            <label className="text-sm text-slate-700">
              Minimum partial harvest (kg)
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={minimumHarvestDraft}
                onChange={(e) => setMinimumHarvestDraft(e.target.value)}
                disabled={!canManage}
                className={inputClass}
              />
            </label>
          </div>
        </div>

        <div className={panelClass}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-700">
              PL brand
              <input
                value={plBrandDraft}
                onChange={(e) => setPlBrandDraft(e.target.value)}
                disabled={!canManage}
                className={inputClass}
              />
            </label>
            <label className="text-sm text-slate-700">
              PL price/piece
              <input
                type="number"
                step="0.000001"
                min="0"
                value={plPriceDraft}
                onChange={(e) => setPlPriceDraft(e.target.value)}
                disabled={!canManage}
                className={inputClass}
              />
            </label>
            <label className="text-sm text-slate-700">
              Electricity kWh/day
              <input
                type="number"
                step="0.001"
                min="0"
                value={electricityKwhDraft}
                onChange={(e) => setElectricityKwhDraft(e.target.value)}
                disabled={!canManage}
                className={inputClass}
              />
            </label>
            <label className="text-sm text-slate-700">
              Electricity price/kWh
              <input
                type="number"
                step="0.0001"
                min="0"
                value={electricityPriceDraft}
                onChange={(e) => setElectricityPriceDraft(e.target.value)}
                disabled={!canManage}
                className={inputClass}
              />
            </label>
            <label className="text-sm text-slate-700">
              Probiotics cost/day
              <input
                type="number"
                step="0.01"
                min="0"
                value={probioticsDraft}
                onChange={(e) => setProbioticsDraft(e.target.value)}
                disabled={!canManage}
                className={inputClass}
              />
            </label>
            <label className="text-sm text-slate-700">
              Disinfection cost/day
              <input
                type="number"
                step="0.01"
                min="0"
                value={disinfectionDraft}
                onChange={(e) => setDisinfectionDraft(e.target.value)}
                disabled={!canManage}
                className={inputClass}
              />
            </label>
            <label className="text-sm text-slate-700">
              Liming cost/day
              <input
                type="number"
                step="0.01"
                min="0"
                value={limingDraft}
                onChange={(e) => setLimingDraft(e.target.value)}
                disabled={!canManage}
                className={inputClass}
              />
            </label>
          </div>
        </div>

        <div className={panelClass}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-slate-700">Feed plan</div>
            {canManage && (
              <button
                type="button"
                onClick={addFeedPlanRow}
                disabled={feedTypes.length === 0}
                className="rounded border border-primary px-3 py-1 text-xs text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                + Feed row
              </button>
            )}
          </div>
          {feedPlanDraft.length === 0 ? (
            <p className="text-sm text-slate-500">No feed plan rows.</p>
          ) : (
            <div className="space-y-2">
              {feedPlanDraft.map((row, index) => (
                <div key={`${row.feed_type_id}-${index}`} className="grid gap-2 rounded border border-slate-200 bg-white p-2 sm:grid-cols-[1fr_120px_auto]">
                  <label className="text-xs text-slate-600">
                    Feed type
                    <select
                      value={row.feed_type_id}
                      onChange={(e) => updateFeedPlanRow(index, selectFeedType(row, feedTypes, e.target.value))}
                      disabled={!canManage}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    >
                      {feedTypes.length === 0 && (
                        <option value={row.feed_type_id}>{formatFeedTypeName(row)}</option>
                      )}
                      {feedTypes.map((feedType) => (
                        <option key={feedType.id} value={feedType.id}>
                          {formatFeedTypeName(feedType)} - {Number(feedType.price_per_kg).toFixed(0)}/kg
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    Until ABW (g)
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      value={row.use_until_abw_g}
                      onChange={(e) => updateFeedPlanRow(index, { ...row, use_until_abw_g: e.target.value })}
                      disabled={!canManage}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </label>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => removeFeedPlanRow(index)}
                      className="self-end rounded border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {error}
          </p>
        )}

        {canManage && (
          <button
            disabled={saving}
            className="rounded bg-primary px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save prediction settings"}
          </button>
        )}
      </form>
    </section>
  );
}
