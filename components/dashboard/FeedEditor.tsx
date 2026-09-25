"use client";

import { useMemo, useState } from "react";

import type { Cycle, DayView, Feeding, FeedingFeedType, Product } from "@/lib/api";
import { fmt24, hhmm } from "@/lib/dates";
import { decimalInput, fmtInt, intInput, num } from "@/lib/num";
import { feedTypeLabel, type DayKind } from "./model";
import { PredictPanel } from "./PredictPanel";

export type FeedRow = {
  key: string;
  id?: string;
  original?: Feeding;
  time: string;
  kg: string;
  minutes: string;
  /** Feed type id, "" for none, "__keep" to keep an existing multi-type mix. */
  feedTypeId: string;
  /** Catalog entry id, "" for none, "__keep" to keep existing additives unchanged. */
  additive: string;
  /** Dose for the chosen additive, in its own unit; blank uses the cycle's last dose. */
  dose: string;
  /** Existing feed an operator may not change (the backend only lets them add). */
  locked: boolean;
};

export function rowFromFeeding(f: Feeding, locked: boolean): FeedRow {
  return {
    key: f.id,
    id: f.id,
    original: f,
    time: hhmm(f.feed_time),
    kg: String(Math.round(num(f.amount_kg) * 10) / 10),
    minutes: f.duration_min !== null && f.duration_min !== undefined ? String(f.duration_min) : "",
    feedTypeId: f.feed_types.length === 1 ? f.feed_types[0].product_id ?? f.feed_types[0].feed_type_id ?? "" : f.feed_types.length ? "__keep" : "",
    additive: f.additives.length === 1 && f.additives[0].product_id !== null ? f.additives[0].product_id : f.additives.length ? "__keep" : "",
    dose: f.additives.length === 1 ? String(num(f.additives[0].dose_per_kg)) : "",
    locked,
  };
}

/**
 * A fresh row, seeded from what the pond was last fed: the feed, and the additive
 * that went with it. The dose is deliberately left blank - the server fills it
 * from the last dose in this cycle, then the last anywhere on the farm.
 */
export function blankRow(time: string, types: FeedingFeedType[], additive = ""): FeedRow {
  return {
    key: crypto.randomUUID(),
    time,
    kg: "",
    minutes: "",
    feedTypeId: types[0]?.product_id ?? "",
    additive,
    dose: "",
    locked: false,
  };
}

type FiState = { fi: string; ratios: string[] };

export function FeedEditor({
  cycle,
  day,
  kind,
  saveContext,
  initialRows,
  initialMode,
  products,
  defaultTypes,
  defaultAdditive,
  sessionTimes,
  copySource,
  prevFi,
  defaultRatios,
  maxFi,
  doses,
  canManage,
  saving,
  onCancel,
  onSave,
  onPredicted,
}: {
  cycle: Cycle;
  day: DayView;
  kind: DayKind;
  saveContext: string;
  initialRows: FeedRow[];
  initialMode: "plain" | "fi" | "predict";
  products: Product[];
  defaultTypes: FeedingFeedType[];
  sessionTimes: string[];
  copySource: { label: string; rows: () => FeedRow[] } | null;
  prevFi: { label: string; value: string } | null;
  defaultRatios: string[];
  maxFi: number | null;
  /** Dose each entry is currently on in this cycle (catalog id -> amount), for pre-filling. */
  doses: Record<string, string>;
  /** Additive the pond was last fed, seeded onto new rows. */
  defaultAdditive: string;
  canManage: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: (rows: FeedRow[]) => void;
  onPredicted: () => void;
}) {
  const feeds = useMemo(() => products.filter((p) => p.category === "feed"), [products]);
  /**
   * What can go *into* feed: anything in the catalog that is not feed itself and
   * not equipment. Products and formulas both, and whether or not a default dose
   * is set - a dose can always be typed on the row.
   */
  const dosables = useMemo(
    // Not counted means it never leaves a shelf, so there is nothing to dose.
    () => products.filter((p) => p.tracked && p.category !== "feed" && p.category !== "equipment"),
    [products],
  );

  const [rows, setRows] = useState<FeedRow[]>(initialRows);
  const [fiState, setFiState] = useState<FiState | null>(initialMode === "fi" ? { fi: "", ratios: [...defaultRatios] } : null);
  const [predictOpen, setPredictOpen] = useState(initialMode === "predict");

  const locked = rows.filter((r) => r.locked);
  const pop = day.metrics.estimated_population ?? 0;
  const doc = day.metrics.doc;
  const canPredict = kind !== "past" && canManage;

  /** Replace the rows wholesale and close the feeding index / predict helpers. */
  function replaceRows(next: FeedRow[]) {
    setRows(next);
    setFiState(null);
    setPredictOpen(false);
  }

  function update(key: string, patch: Partial<FeedRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  /** Rebuild unlocked rows from a feeding index and per-feed ratios; last feed takes the rounding remainder. */
  function applyFi(next: FiState) {
    setFiState(next);
    const fi = num(next.fi);
    const ratios = next.ratios.map((r) => num(r) || 0);
    const sum = ratios.reduce((t, r) => t + r, 0);
    if (!(fi > 0) || !(pop > 0) || Math.abs(sum - 100) > 0.01 || !ratios.length) return;
    const daily = Math.round(((fi * doc * pop) / 100000) * 10) / 10;
    setRows((current) => {
      const editable = current.filter((r) => !r.locked);
      let used = 0;
      const rebuilt = ratios.map((r, i) => {
        const base = editable[i] ?? blankRow(sessionTimes[i] ?? "", defaultTypes, defaultAdditive);
        let kg = i === ratios.length - 1 ? daily - used : Math.round(daily * (r / 100) * 10) / 10;
        kg = Math.max(0, Math.round(kg * 10) / 10);
        used += kg;
        return { ...base, time: base.time || sessionTimes[i] || "", kg: String(kg) };
      });
      return [...current.filter((r) => r.locked), ...rebuilt];
    });
  }

  const fiNum = num(fiState?.fi ?? "");
  const daily = fiState && fiNum > 0 && pop > 0 ? (fiNum * doc * pop) / 100000 : 0;
  const ratioSum = (fiState?.ratios ?? []).reduce((t, r) => t + (num(r) || 0), 0);
  const ratioOk = Math.abs(ratioSum - 100) < 0.01;

  const helperCols = canPredict ? "grid-cols-3" : "grid-cols-2";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate px-0.5 font-mono text-[10px] text-tx-muted">Saving to {saveContext}</div>
        <div className="flex shrink-0 items-center gap-1.5">
          {rows.some((r) => !r.locked) ? (
            <button type="button" onClick={() => replaceRows(locked)} className="rounded-md bg-ink-850 px-2.5 py-1 text-[11px] font-semibold text-bad">
              Clear all
            </button>
          ) : null}
          <button type="button" onClick={onCancel} className="rounded-md bg-ink-850 px-2.5 py-1 text-[11px] font-semibold text-tx-muted">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(rows)}
            disabled={saving}
            className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-ink disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className={`grid gap-1.5 ${helperCols}`}>
        <button
          type="button"
          disabled={!copySource}
          onClick={() => copySource && replaceRows([...locked, ...copySource.rows()])}
          className="rounded-lg border border-line bg-ink-850 px-1.5 py-[9px] text-center text-xs font-semibold text-tx disabled:opacity-40"
        >
          {copySource?.label ?? "Nothing to copy"}
        </button>
        <button
          type="button"
          onClick={() => {
            setPredictOpen(false);
            setFiState(fiState ? null : { fi: "", ratios: [...defaultRatios] });
          }}
          aria-expanded={!!fiState}
          className={`rounded-lg border border-line px-1.5 py-[9px] text-center text-xs font-semibold text-accent ${fiState ? "bg-accent/15" : "bg-ink-850"}`}
        >
          Feeding index {fiState ? "▴" : "▾"}
        </button>
        {canPredict ? (
          <button
            type="button"
            onClick={() => {
              setFiState(null);
              setPredictOpen((o) => !o);
            }}
            aria-expanded={predictOpen}
            className={`rounded-lg border border-line px-1.5 py-[9px] text-center text-xs font-semibold text-warn ${predictOpen ? "bg-warn/[0.12]" : "bg-ink-850"}`}
          >
            Predict
          </button>
        ) : null}
      </div>

      {predictOpen && canPredict ? (
        <PredictPanel cycle={cycle} day={day} onCancel={() => setPredictOpen(false)} onApplied={onPredicted} />
      ) : null}

      {fiState ? (
        <div className="flex flex-col gap-2.5 rounded-xl border border-accent bg-ink-850 p-3">
          <div className="flex items-end gap-2">
            <div className="flex min-w-0 flex-grow flex-col gap-1">
              <label htmlFor={`fi-${cycle.id}`} className="text-[10px] uppercase tracking-[0.05em] text-tx-faint">
                Feeding index
              </label>
              <input
                id={`fi-${cycle.id}`}
                inputMode="decimal"
                placeholder="0.000"
                value={fiState.fi}
                onChange={(e) => applyFi({ ...fiState, fi: decimalInput(e.target.value, 3) })}
                className="w-full rounded-md border border-line bg-ink-800 px-2.5 py-2 font-mono text-base font-semibold text-tx-strong outline-none focus:border-accent"
              />
            </div>
            {prevFi ? (
              <button
                type="button"
                onClick={() => applyFi({ ...fiState, fi: prevFi.value })}
                aria-label="Use previous feeding index"
                className="shrink-0 whitespace-nowrap rounded-lg border border-dashed border-line-dash px-2.5 py-[9px] font-mono text-[11px] text-tx-muted"
              >
                {prevFi.label} ↺
              </button>
            ) : null}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[11px] text-tx-muted">
              = {fiNum > 0 ? fiNum.toFixed(3) : "FI"} × DOC {doc} × {pop ? fmtInt(pop) : "pop"} / 100,000
            </span>
            <span className="font-mono text-[17px] font-bold text-accent">{daily ? `${(Math.round(daily * 10) / 10).toFixed(1)} kg/day` : "— kg/day"}</span>
            <span className="text-[10px] text-tx-faint">{pop ? "Estimated population for this day, after harvests." : "No population estimate for this day yet."}</span>
            {maxFi !== null && fiNum > maxFi ? <span className="text-[11px] text-warn">Above this cycle's max feeding index ({maxFi.toFixed(3)}).</span> : null}
          </div>
          <div className="flex flex-col gap-1.5 border-t border-line pt-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.05em] text-tx-faint">Ratio per feed</span>
              <span className={`font-mono text-[11px] font-bold ${ratioOk ? "text-good" : "text-bad"}`}>Total {Math.round(ratioSum * 10) / 10}%</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {fiState.ratios.map((r, i) => (
                <div key={i} className="flex w-[54px] flex-col items-center gap-0.5">
                  <div className="relative w-full">
                    <input
                      aria-label={`Feed ${i + 1} ratio`}
                      inputMode="decimal"
                      value={r}
                      onChange={(e) => {
                        const ratios = [...fiState.ratios];
                        ratios[i] = decimalInput(e.target.value, 1);
                        applyFi({ ...fiState, ratios });
                      }}
                      className="input-xs pr-4 text-center"
                    />
                    <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-tx-faint">%</span>
                  </div>
                  <span className="text-[9px] text-tx-ghost">Feed {i + 1}</span>
                </div>
              ))}
              <div className="flex gap-1 self-start">
                <button
                  type="button"
                  aria-label="One feed fewer"
                  disabled={fiState.ratios.length <= 1}
                  onClick={() => applyFi({ ...fiState, ratios: fiState.ratios.slice(0, -1) })}
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-line text-[15px] text-tx-muted disabled:opacity-40"
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label="One more feed"
                  onClick={() => applyFi({ ...fiState, ratios: [...fiState.ratios, "0"] })}
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-line text-[15px] text-tx-muted"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {rows.map((r, i) => (
        <div key={r.key} className="flex flex-col gap-2 rounded-[10px] bg-ink-850 px-[11px] py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-tx-muted">
              Feed {i + 1}
              {r.locked ? <span className="ml-2 font-normal text-tx-faint">· logged, ask a maintainer to change</span> : null}
            </span>
            {!r.locked ? (
              <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove feed ${i + 1}`} className="flex h-6 w-6 items-center justify-center rounded-md text-tx-faint hover:text-tx">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Time" id={`${r.key}-time`}>
              <input id={`${r.key}-time`} disabled={r.locked} inputMode="numeric" maxLength={5} placeholder="HH:MM" value={r.time} onChange={(e) => update(r.key, { time: fmt24(e.target.value) })} className="input-xs" />
            </Mini>
            <Mini label="Amount kg" id={`${r.key}-kg`}>
              <input id={`${r.key}-kg`} disabled={r.locked} inputMode="decimal" value={r.kg} onChange={(e) => update(r.key, { kg: decimalInput(e.target.value, 1) })} className="input-xs" />
            </Mini>
            <Mini label="Tray min" id={`${r.key}-min`}>
              <input id={`${r.key}-min`} disabled={r.locked} inputMode="numeric" value={r.minutes} onChange={(e) => update(r.key, { minutes: intInput(e.target.value) })} className="input-xs" />
            </Mini>
          </div>
          <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_64px] gap-2">
            <Mini label="Feed type" id={`${r.key}-type`}>
              <select id={`${r.key}-type`} disabled={r.locked} value={r.feedTypeId} onChange={(e) => update(r.key, { feedTypeId: e.target.value })} className="input-xs font-sans">
                <option value="">None</option>
                {r.feedTypeId === "__keep" && r.original ? <option value="__keep">{feedTypeLabel(r.original.feed_types)}</option> : null}
                {r.feedTypeId && r.feedTypeId !== "__keep" && !feeds.some((t) => t.id === r.feedTypeId) && r.original ? (
                  <option value={r.feedTypeId}>{feedTypeLabel(r.original.feed_types)}</option>
                ) : null}
                {feeds.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Mini>
            <Mini label="Additive" id={`${r.key}-add`}>
              <select
                id={`${r.key}-add`}
                disabled={r.locked}
                value={r.additive}
                onChange={(e) => {
                  const id = e.target.value;
                  // Only what this cycle has already dosed; a first dose is typed in.
                  const dose = id && id !== "__keep" ? doses[id] ?? "" : "";
                  update(r.key, { additive: id, dose: dose ? String(num(dose)) : "" });
                }}
                className="input-xs font-sans"
              >
                <option value="">None</option>
                {r.additive === "__keep" && r.original ? <option value="__keep">{r.original.additives.map((a) => a.name).join(", ")}</option> : null}
                {dosables.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Mini>
            {/* The dose unit follows what the additive is counted in, so a liquid
                reads mL/kg rather than a meaningless "g". */}
            <Mini
              label={`${dosables.find((a) => a.id === r.additive)?.dose_unit ?? "g"}/kg`}
              id={`${r.key}-dose`}
            >
              <input
                id={`${r.key}-dose`}
                disabled={r.locked || !r.additive || r.additive === "__keep"}
                inputMode="decimal"
                placeholder={r.additive && r.additive !== "__keep" ? "auto" : "—"}
                value={r.dose}
                onChange={(e) => update(r.key, { dose: decimalInput(e.target.value, 3) })}
                className="input-xs"
              />
            </Mini>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const last = rows.at(-1);
          setRows((rs) => [...rs, { ...blankRow("", defaultTypes, defaultAdditive), feedTypeId: last?.feedTypeId === "__keep" ? "" : last?.feedTypeId ?? defaultTypes[0]?.product_id ?? "" }]);
        }}
        className="flex items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-line-dash p-2.5 text-xs font-semibold text-accent"
      >
        + Add feed
      </button>
    </div>
  );
}

function Mini({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[10px] uppercase tracking-[0.05em] text-tx-faint">
        {label}
      </label>
      {children}
    </div>
  );
}
