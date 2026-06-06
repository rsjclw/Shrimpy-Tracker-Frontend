"use client";

import { differenceInDays, parseISO } from "date-fns";
import { useState } from "react";

import { api, type Cycle, type DayView, type PredictionJob } from "@/lib/api";

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

export function PredictModal({
  cycle,
  day,
  onClose,
  onStarted,
}: {
  cycle: Cycle;
  day: DayView;
  onClose: () => void;
  onStarted: (job: PredictionJob) => void;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  function requestBody() {
    return {
      start_date: day.date,
      target_doc: targetDoc,
      optimize_partial_harvests: optimizePartialHarvests,
    };
  }

  async function startPrediction() {
    if (!canPreview || starting) return;
    setStarting(true);
    setError(null);
    try {
      const started = await api.startPredictionPreviewJob(cycle.id, requestBody());
      onStarted(started);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start prediction.");
      setStarting(false);
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
            disabled={starting}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none disabled:opacity-40"
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

        <p className="text-xs text-amber-600">
          Existing daily data from DOC {startDoc} onward will be cleared before prediction is written.
          {canPreview && <> DOC {targetDoc} is treated as harvest day, so no feed will be added that day.</>}
        </p>

        {error && (
          <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startPrediction}
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
      </div>
    </div>
  );
}
