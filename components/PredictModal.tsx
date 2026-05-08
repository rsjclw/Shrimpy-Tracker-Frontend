"use client";

import { addDays, differenceInDays, format, parseISO } from "date-fns";
import { useEffect, useMemo, useState } from "react";

import { api, type BatchImportDay, type Cycle, type DayView } from "@/lib/api";

type PredictionDay = {
  date: string;
  doc: number;
  feedingIndex: number;
  dailyFeedKg: number;
  feedings: { feed_time: string; amount_kg: number }[];
};

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function computePrediction(params: {
  startDoc: number;
  targetDoc: number;
  startDate: string;
  baseFI: number;
  feedingIndexIncrement: number;
  maximumFeedingIndex: number | null;
  maximumDailyFeedKg: number | null;
  estimatedPopulation: number;
  startingBiomassKg: number;
  fcrAssumption: number;
}): { days: PredictionDay[]; totalFeedKg: number; finalAbwG: number } {
  const {
    startDoc,
    targetDoc,
    startDate,
    baseFI,
    feedingIndexIncrement,
    maximumFeedingIndex,
    maximumDailyFeedKg,
    estimatedPopulation,
    startingBiomassKg,
    fcrAssumption,
  } = params;
  const days: PredictionDay[] = [];
  let currentFI = baseFI;
  let totalFeedKg = 0;

  for (let doc = startDoc; doc <= targetDoc; doc++) {
    const fi = maximumFeedingIndex !== null
      ? Math.min(currentFI, maximumFeedingIndex)
      : currentFI;

    const rawFeedKg = fi * doc * (estimatedPopulation / 100000);
    const dailyFeedKg = maximumDailyFeedKg !== null
      ? Math.min(rawFeedKg, maximumDailyFeedKg)
      : rawFeedKg;

    const date = format(addDays(parseISO(startDate), doc - 1), "yyyy-MM-dd");

    days.push({
      date,
      doc,
      feedingIndex: fi,
      dailyFeedKg,
      feedings: [
        { feed_time: "06:00", amount_kg: round3(dailyFeedKg * 0.25) },
        { feed_time: "10:00", amount_kg: round3(dailyFeedKg * 0.30) },
        { feed_time: "14:00", amount_kg: round3(dailyFeedKg * 0.30) },
        { feed_time: "18:00", amount_kg: round3(dailyFeedKg * 0.15) },
      ],
    });

    totalFeedKg += dailyFeedKg;
    currentFI = maximumFeedingIndex !== null
      ? Math.min(currentFI + feedingIndexIncrement, maximumFeedingIndex)
      : currentFI + feedingIndexIncrement;
  }

  const biomassGainKg = fcrAssumption > 0 ? totalFeedKg / fcrAssumption : 0;
  const finalBiomassKg = startingBiomassKg + biomassGainKg;
  const finalAbwG = estimatedPopulation > 0
    ? round4((finalBiomassKg / estimatedPopulation) * 1000)
    : 0;

  return { days, totalFeedKg, finalAbwG };
}

export function PredictModal({
  cycle,
  day,
  onClose,
  onComplete,
}: {
  cycle: Cycle;
  day: DayView;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [fcrDraft, setFcrDraft] = useState("1.5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prevDayFI, setPrevDayFI] = useState<number | null>(null);

  const startDoc = day.metrics.doc;
  const estimatedPopulation = day.metrics.estimated_population ?? 0;
  const startingBiomassKg = day.metrics.estimated_biomass_kg
    ? Number(day.metrics.estimated_biomass_kg)
    : 0;
  const totalDailyFeedKg = day.feedings.reduce((sum, f) => sum + Number(f.amount_kg), 0);
  const currentFeedingIndex =
    day.feedings.length > 0 && startDoc >= 1 && estimatedPopulation > 0
      ? (totalDailyFeedKg / (estimatedPopulation / 100000)) / startDoc
      : NaN;

  const feedingIndexIncrement = Number(cycle.feeding_index_increment);

  useEffect(() => {
    if (Number.isFinite(currentFeedingIndex) || startDoc <= 1) return;
    const prevDate = format(addDays(parseISO(cycle.start_date), startDoc - 2), "yyyy-MM-dd");
    api.getCycleDay(cycle.id, prevDate).then((prevDay) => {
      const prevTotal = prevDay.feedings.reduce((s, f) => s + Number(f.amount_kg), 0);
      const prevPop = prevDay.metrics.estimated_population ?? estimatedPopulation;
      if (prevTotal > 0 && prevPop > 0) {
        setPrevDayFI((prevTotal / (prevPop / 100000)) / (startDoc - 1));
      }
    }).catch(() => {});
  }, [currentFeedingIndex, startDoc, cycle.start_date, cycle.id, estimatedPopulation]);

  const baseFI = Number.isFinite(currentFeedingIndex)
    ? currentFeedingIndex
    : prevDayFI !== null
      ? prevDayFI + feedingIndexIncrement
      : feedingIndexIncrement;
  const maximumFeedingIndex = cycle.maximum_feeding_index ? Number(cycle.maximum_feeding_index) : null;
  const maximumDailyFeedKg = cycle.maximum_daily_feed_capacity_kg
    ? Number(cycle.maximum_daily_feed_capacity_kg)
    : null;

  const targetDoc = cycle.planned_end_date
    ? differenceInDays(parseISO(cycle.planned_end_date), parseISO(cycle.start_date)) + 1
    : null;

  const fcr = Number(fcrDraft);

  const preview = useMemo(() => {
    if (targetDoc === null || estimatedPopulation <= 0 || !Number.isFinite(fcr) || fcr <= 0) {
      return null;
    }
    if (targetDoc < startDoc) return null;
    return computePrediction({
      startDoc,
      targetDoc,
      startDate: cycle.start_date,
      baseFI,
      feedingIndexIncrement,
      maximumFeedingIndex,
      maximumDailyFeedKg,
      estimatedPopulation,
      startingBiomassKg,
      fcrAssumption: fcr,
    });
  }, [
    targetDoc,
    startDoc,
    cycle.start_date,
    baseFI,
    feedingIndexIncrement,
    maximumFeedingIndex,
    maximumDailyFeedKg,
    estimatedPopulation,
    startingBiomassKg,
    fcr,
  ]);

  async function generate() {
    if (!preview || preview.days.length === 0) return;
    setError(null);
    setLoading(true);
    try {
      const batchDays: BatchImportDay[] = preview.days.map((d, i) => ({
        date: d.date,
        abw_g: i === preview.days.length - 1 ? preview.finalAbwG : null,
        feedings: d.feedings,
      }));
      await api.batchImportFeedingsAbw(cycle.id, {
        replace_feedings: true,
        abw_sample_time: "05:00",
        days: batchDays,
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate predictions.");
      setLoading(false);
    }
  }

  const canGenerate = preview !== null && preview.days.length > 0 && Number.isFinite(fcr) && fcr > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Predict future feeding</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {targetDoc === null && (
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            No planned end date set for this cycle. Edit the cycle to add one before predicting.
          </p>
        )}

        {targetDoc !== null && targetDoc < startDoc && (
          <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            The planned end date (DOC {targetDoc}) is before the current day (DOC {startDoc}).
          </p>
        )}

        {estimatedPopulation <= 0 && (
          <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            Cannot predict: no estimated population for this day.
          </p>
        )}

        {!Number.isFinite(currentFeedingIndex) && (
          <p className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
            No feedings logged today — prediction will start from the first increment ({feedingIndexIncrement.toFixed(3)}).
          </p>
        )}

        {targetDoc !== null && targetDoc >= startDoc && estimatedPopulation > 0 && (
          <>
            <div className="text-sm text-slate-600">
              Generating DOC <strong>{startDoc}</strong> → DOC <strong>{targetDoc}</strong>
              {" "}({targetDoc - startDoc + 1} days)
            </div>

            <label className="block text-sm">
              FCR assumption
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={fcrDraft}
                onChange={(e) => setFcrDraft(e.target.value)}
                className="mt-1 w-full border rounded px-3 py-2"
                autoFocus
              />
            </label>

            {preview && (
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Total feed</div>
                  <div className="font-semibold">
                    {preview.totalFeedKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Final ABW</div>
                  <div className="font-semibold">{preview.finalAbwG.toFixed(2)} g</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Final FI</div>
                  <div className="font-semibold">
                    {preview.days.length > 0
                      ? preview.days[preview.days.length - 1].feedingIndex.toFixed(3)
                      : "—"}
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-amber-600">
              ⚠ Existing feedings for these dates will be replaced.
            </p>

            {error && (
              <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={generate}
                disabled={!canGenerate || loading}
                className="bg-amber-500 text-white px-4 py-2 rounded text-sm hover:bg-amber-600 disabled:opacity-50"
              >
                {loading ? "Generating…" : "Generate"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="border px-4 py-2 rounded text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {targetDoc === null && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="border px-4 py-2 rounded text-sm hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
