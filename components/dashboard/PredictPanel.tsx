"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Spinner } from "@/components/ui/Field";
import { api, type Cycle, type DayView, type PredictionJob, type PredictionResult } from "@/lib/api";
import { docFor, niceDate } from "@/lib/dates";
import { targetDoc } from "@/lib/cycles";
import { fmtDec, fmtInt, intInput, rupiah } from "@/lib/num";

const POLL_MS = 1500;
const MAX_POLLS = 160; // ~4 minutes

/**
 * Runs the backend predictor from the viewed day to a target DOC, shows the
 * outcome, and only then replaces the feed schedules (two steps, because
 * applying clears every schedule in the range, logged tray times included).
 */
export function PredictPanel({
  cycle,
  day,
  onCancel,
  onApplied,
}: {
  cycle: Cycle;
  day: DayView;
  onCancel: () => void;
  onApplied: () => void;
}) {
  const doc = day.metrics.doc;
  const [target, setTarget] = useState(() => String(Math.max(targetDoc(cycle) ?? 120, doc + 1)));
  const [optimize, setOptimize] = useState(true);
  const [job, setJob] = useState<PredictionJob | null>(null);
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [clearCount, setClearCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const t = parseInt(target, 10);
  const targetError = !Number.isFinite(t)
    ? "Enter the target DOC"
    : t <= doc
      ? `Target DOC must be after DOC ${doc}`
      : t > 250
        ? "Target DOC looks too far out"
        : "";

  if (!cycle.prediction_config) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-warn/50 bg-warn/[0.06] p-3">
        <span className="text-sm font-bold text-tx-strong">Prediction needs targets first</span>
        <span className="text-xs leading-snug text-warn">
          This cycle has no growth targets, feed plan or prices yet. Set them in pond settings, then predict.
        </span>
        <div className="flex justify-end gap-1.5">
          <button type="button" onClick={onCancel} className="rounded-md bg-ink-800 px-3 py-[7px] text-xs font-semibold text-tx-muted">
            Close
          </button>
          <Link href={`/ponds/${cycle.pond_id}/settings`} className="rounded-md bg-accent px-3.5 py-[7px] text-xs font-bold text-accent-ink hover:text-accent-ink">
            Pond settings
          </Link>
        </div>
      </div>
    );
  }

  async function run() {
    if (targetError) return;
    setRunning(true);
    setError(null);
    setJob(null);
    setClearCount(null);
    try {
      let current = await api.startPredictionPreviewJob(cycle.id, { start_date: day.date, target_doc: t, optimize_partial_harvests: optimize });
      for (let i = 0; i < MAX_POLLS && (current.status === "pending" || current.status === "running"); i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (cancelled.current) return;
        current = await api.getPredictionPreviewJob(cycle.id, current.id);
      }
      if (cancelled.current) return;
      if (current.status === "failed") throw new Error(current.error || "The prediction failed.");
      if (current.status !== "completed" || !current.result) throw new Error("The prediction is taking too long. Try again in a minute.");
      setJob(current);
      const end = current.result.summary.final_date;
      const days = await api.listCycleDays(cycle.id, day.date, end);
      if (!cancelled.current) setClearCount(days.filter((d) => Number(d.daily_feed_kg) > 0).length);
    } catch (e) {
      if (!cancelled.current) setError(e instanceof Error ? e.message : "The prediction failed.");
    } finally {
      if (!cancelled.current) setRunning(false);
    }
  }

  async function apply() {
    if (!job) return;
    setApplying(true);
    setError(null);
    try {
      await api.generatePredictionFromJob(cycle.id, job.id);
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Applying the prediction failed.");
      setApplying(false);
    }
  }

  const result: PredictionResult | null = job?.result ?? null;
  const s = result?.summary;
  const span = s ? docFor(day.date, s.final_date) : 0;

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-warn/50 bg-warn/[0.06] p-3">
      <span className="text-sm font-bold text-tx-strong">Predict feed from DOC {doc}</span>
      {!s ? (
        <>
          <span className="text-xs leading-snug text-warn">
            Simulates growth from this day to the target DOC with the cycle's targets and feed plan. You review the result before anything changes.
          </span>
          <div className="flex flex-col gap-1">
            <label htmlFor={`predict-${cycle.id}`} className="text-[10px] uppercase tracking-[0.05em] text-tx-muted">
              Target DOC
            </label>
            <input
              id={`predict-${cycle.id}`}
              inputMode="numeric"
              value={target}
              onChange={(e) => setTarget(intInput(e.target.value))}
              className="h-[42px] w-full rounded-lg border border-line bg-ink-800 px-2.5 font-mono text-[15px] font-semibold text-tx-strong outline-none focus:border-warn"
            />
            <span className="text-[10px] text-tx-faint">Harvest target · now DOC {doc}</span>
          </div>
          <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-xs text-tx-soft">
            <input type="checkbox" checked={optimize} onChange={(e) => setOptimize(e.target.checked)} className="h-[18px] w-[18px] accent-warn" />
            Plan partial harvests for the best profit
          </label>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Fact k="Ends" v={`DOC ${s.final_doc} · ${niceDate(s.final_date)}`} />
            <Fact k="Final ABW" v={`${fmtDec(s.final_abw_g, 1)} g`} />
            <Fact k="Final biomass" v={`${fmtInt(s.final_biomass_kg)} kg`} />
            <Fact k="Partial harvests" v={`${result!.partial_harvests.length} · ${fmtInt(s.total_harvested_biomass_kg)} kg`} />
            <Fact k="Feed to add" v={`${fmtInt(s.simulated_feed_kg)} kg`} />
            <Fact k="Profit" v={rupiah(s.profit)} />
          </div>
          {s.stop_reason ? <span className="text-[11px] text-tx-muted">Stops because: {s.stop_reason}</span> : null}
          <span className="text-xs leading-snug text-warn">
            Applying replaces every feed schedule from DOC {doc} to DOC {s.final_doc} ({span} days) with the prediction
            {clearCount ? `. ${clearCount} day${clearCount === 1 ? " already has" : "s already have"} a schedule that will be cleared, including logged tray times.` : "."}
          </span>
        </div>
      )}
      {targetError && target && !s ? <span className="text-[11px] text-bad">{targetError}</span> : null}
      {error ? <span className="text-[11px] text-bad">{error}</span> : null}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} disabled={applying} className="rounded-md bg-ink-800 px-3 py-[7px] text-xs font-semibold text-tx-muted">
          Cancel
        </button>
        {!s ? (
          <button
            type="button"
            onClick={run}
            disabled={!!targetError || running}
            className="flex items-center gap-2 rounded-md bg-accent px-3.5 py-[7px] text-xs font-bold text-accent-ink disabled:opacity-40"
          >
            {running ? <Spinner size={12} /> : null}
            {running ? "Predicting…" : `Predict ${Number.isFinite(t) && t > doc ? t - doc + 1 : ""} days`}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setJob(null)} disabled={applying} className="rounded-md bg-ink-800 px-3 py-[7px] text-xs font-semibold text-tx-soft">
              Change target
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={applying}
              className={`flex items-center gap-2 rounded-md px-3.5 py-[7px] text-xs font-bold text-accent-ink disabled:opacity-40 ${clearCount ? "bg-warn" : "bg-accent"}`}
            >
              {applying ? <Spinner size={12} /> : null}
              {clearCount ? `Clear ${clearCount} day${clearCount === 1 ? "" : "s"} & apply` : "Apply to schedule"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-ink-800 px-2.5 py-[7px]">
      <span className="text-[9px] uppercase tracking-[0.05em] text-tx-faint">{k}</span>
      <span className="truncate font-mono text-xs font-semibold text-tx">{v}</span>
    </div>
  );
}
