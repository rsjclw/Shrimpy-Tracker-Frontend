"use client";

import { differenceInDays, parseISO } from "date-fns";
import { useEffect, useState } from "react";

import { api, type Cycle, type DayView, type PredictionResult } from "@/lib/api";

function money(value: string | number) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function kg(value: string | number) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
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
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PredictionResult | null>(null);
  const [optimizePartialHarvests, setOptimizePartialHarvests] = useState(true);
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
  const canPreview = !Number.isNaN(targetDoc) && targetDoc >= startDoc;

  useEffect(() => {
    if (!canPreview) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setError(null);
    api.previewPrediction(cycle.id, {
      start_date: day.date,
      target_doc: targetDoc,
      optimize_partial_harvests: optimizePartialHarvests,
    })
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setPreview(null);
          setError(err instanceof Error ? err.message : "Failed to preview prediction.");
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canPreview, cycle.id, day.date, optimizePartialHarvests, targetDoc]);

  async function generate() {
    if (!preview || !canPreview) return;
    setError(null);
    setLoading(true);
    try {
      await api.generatePrediction(cycle.id, {
        start_date: day.date,
        target_doc: targetDoc,
        optimize_partial_harvests: optimizePartialHarvests,
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate prediction.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Predict future feeding</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
          >
            x
          </button>
        </div>

        {defaultTargetDoc === "" && (
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            No planned end date set for this cycle. Enter a target DOC to predict.
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

        <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
          <label className="block text-sm">
            Target DOC
            <input
              type="number"
              step="1"
              min={startDoc}
              value={targetDocDraft}
              onChange={(e) => setTargetDocDraft(e.target.value)}
              placeholder="DOC"
              className="mt-1 w-full border rounded px-3 py-2"
              autoFocus
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm border rounded px-3 py-2">
            <input
              type="checkbox"
              checked={optimizePartialHarvests}
              onChange={(e) => setOptimizePartialHarvests(e.target.checked)}
            />
            Optimize partial harvests
          </label>
        </div>

        <div className="text-sm text-slate-600">
          Prediction starts at DOC <strong>{startDoc}</strong>
          {canPreview && (
            <>
              {" "}to DOC <strong>{targetDoc}</strong>
              {" "}({targetDoc - startDoc + 1} days)
            </>
          )}
        </div>

        {previewLoading && (
          <p className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
            Loading preview...
          </p>
        )}

        {preview && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Total feed</div>
                <div className="font-semibold">{kg(preview.summary.simulated_feed_kg)} kg</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Final ABW</div>
                <div className="font-semibold">{Number(preview.summary.final_abw_g).toFixed(2)} g</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Final biomass</div>
                <div className="font-semibold">{kg(preview.summary.final_biomass_kg)} kg</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Stop</div>
                <div className="font-semibold">{preview.summary.stop_reason}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Profit/day</div>
                <div className="font-semibold">{money(preview.summary.profit_per_day)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Total revenue</div>
                <div className="font-semibold">{money(preview.summary.total_revenue)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Final DOC</div>
                <div className="font-semibold">{preview.summary.final_doc}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Partials</div>
                <div className="font-semibold">{preview.partial_harvests.length}</div>
              </div>
            </div>

            {preview.partial_harvests.length > 0 && (
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-1">DOC</th>
                    <th>Date</th>
                    <th>Biomass</th>
                    <th>ABW</th>
                    <th>Total price</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.partial_harvests.map((harvest) => (
                    <tr key={`${harvest.date}-${harvest.biomass_kg}`} className="border-t">
                      <td className="py-2">{harvest.doc}</td>
                      <td>{harvest.date}</td>
                      <td>{kg(harvest.biomass_kg)} kg</td>
                      <td>{Number(harvest.sampled_abw_g).toFixed(2)} g</td>
                      <td>{money(harvest.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="rounded border border-slate-200">
              <div className="grid grid-cols-[70px_1fr_90px_90px] gap-2 px-3 py-2 text-xs font-medium text-slate-500">
                <span>DOC</span>
                <span>Feed</span>
                <span>kg/day</span>
                <span>ABW</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {preview.daily_rows.map((row) => (
                  <div key={row.date} className="grid grid-cols-[70px_1fr_90px_90px] gap-2 border-t px-3 py-2 text-sm">
                    <span>{row.doc}</span>
                    <span>{row.feed_name || "Harvest day"}</span>
                    <span>{kg(row.actual_feed_kg)}</span>
                    <span>{Number(row.ending_abw_g).toFixed(2)} g</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <p className="text-xs text-amber-600">
          Existing daily data from DOC {startDoc} onward will be cleared before prediction is written.
          {canPreview && <> DOC {targetDoc} is treated as harvest day, so no feed will be added that day.</>}
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
            disabled={!preview || !canPreview || loading || previewLoading}
            className="bg-amber-500 text-white px-4 py-2 rounded text-sm hover:bg-amber-600 disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="border px-4 py-2 rounded text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
