"use client";

import { useMemo, useState } from "react";

import type { Cycle, DayView, Feeding, FeedingAdditive, FeedingFeedType, Product } from "@/lib/api";
import { fmt24, hhmm } from "@/lib/dates";
import { decimalInput, fmtInt, intInput, num } from "@/lib/num";
import { feedSlot, feedTypeLabel, type DayKind } from "./model";
import { PredictPanel } from "./PredictPanel";

export type FeedRow = {
  key: string;
  id?: string;
  original?: Feeding;
  time: string;
  kg: string;
  minutes: string;
  /** Feed type id, "" for none, "__keep" for the mix in `mix`. */
  feedTypeId: string;
  /** The feed types the row came with: the mix behind "__keep", and the label of an id the catalog no longer lists. */
  mix: FeedingFeedType[];
  /**
   * No feed type of its own: it shows the pond's previous feed and is saved without
   * one, so it keeps following that feed (a change reported later included) until
   * someone picks a feed on it.
   */
  inherited: boolean;
  /** Catalog entry id, "" for none, "__keep" for the additives in `adds`. */
  additive: string;
  /** The additives the row came with: what "__keep" saves, and the label of an id the list does not offer. */
  adds: FeedingAdditive[];
  /** Dose for the chosen additive, in its own unit; blank uses the cycle's last dose. */
  dose: string;
  /** Existing feed an operator may not change (the backend only lets them add). */
  locked: boolean;
};

/**
 * How a row shows a set of additives: one by its id and dose, two or more (or one
 * logged before the catalogs merged, with no id) as "__keep".
 */
function additiveChoice(adds: FeedingAdditive[]): Pick<FeedRow, "additive" | "dose" | "adds"> {
  if (adds.length === 1 && adds[0].product_id !== null) return { additive: adds[0].product_id, dose: String(num(adds[0].dose_per_kg)), adds };
  return { additive: adds.length ? "__keep" : "", dose: "", adds };
}

/** How a row shows a set of feed types: one feed by its id, a mix as "__keep". */
function typeChoice(types: FeedingFeedType[]): Pick<FeedRow, "feedTypeId" | "mix"> {
  if (types.length === 1) return { feedTypeId: types[0].product_id ?? types[0].feed_type_id ?? "", mix: types };
  return { feedTypeId: types.length ? "__keep" : "", mix: types };
}

/**
 * A saved feeding as an editable row. A feeding with no feed type of its own (the
 * forecast writes them that way) was fed the pond's previous feed, `fallback`.
 */
export function rowFromFeeding(f: Feeding, locked: boolean, fallback: FeedingFeedType[] = []): FeedRow {
  return {
    key: f.id,
    id: f.id,
    original: f,
    time: hhmm(f.feed_time),
    kg: String(Math.round(num(f.amount_kg) * 10) / 10),
    minutes: f.duration_min !== null && f.duration_min !== undefined ? String(f.duration_min) : "",
    ...typeChoice(f.feed_types.length ? f.feed_types : fallback),
    inherited: f.feed_types.length === 0,
    ...additiveChoice(f.additives),
    locked,
  };
}

/**
 * A fresh row, seeded from what the pond was last fed (a mix included) and from the
 * additives, with their doses, of the same feed the day before: each feed of the day
 * has its own, so the 06:00 feed takes the 06:00 feed's.
 */
export function blankRow(time: string, types: FeedingFeedType[], adds: FeedingAdditive[] = []): FeedRow {
  return {
    key: crypto.randomUUID(),
    time,
    kg: "",
    minutes: "",
    ...typeChoice(types),
    inherited: true,
    ...additiveChoice(adds),
    locked: false,
  };
}

/** The daily feed panel: a feeding index and the kg/day it means (typing either fills in the other), split by ratio. */
type FiState = { fi: string; kg: string; ratios: string[] };

export function FeedEditor({
  cycle,
  day,
  kind,
  saveContext,
  initialRows,
  initialMode,
  products,
  defaultTypes,
  prevAdditives,
  sessionTimes,
  prevTotal,
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
  /** The last day that had feeds, labelled with its total; picking it copies that day's rows. */
  prevTotal: { label: string; rows: () => FeedRow[] } | null;
  /**
   * That day's feeding index, what its last feeding was fed, and each of its feeds'
   * additives by time slot. Picking it puts that feed on every feed it rebuilds, and
   * each feed's additives on the feed at the same time.
   */
  prevFi: { label: string; value: string; types: FeedingFeedType[]; additives: FeedingAdditive[][] } | null;
  defaultRatios: string[];
  maxFi: number | null;
  /** Dose each entry is currently on in this cycle (catalog id -> amount), for pre-filling. */
  doses: Record<string, string>;
  /** The previous day's additives by time slot (`additivesBySlot`): a new feed starts with its slot's. */
  prevAdditives: FeedingAdditive[][];
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
  const [fiState, setFiState] = useState<FiState | null>(initialMode === "fi" ? { fi: "", kg: "", ratios: [...defaultRatios] } : null);
  const [predictOpen, setPredictOpen] = useState(initialMode === "predict");

  const locked = rows.filter((r) => r.locked);
  /** The additives a feed at `time` had the day before; `fallback` is the slot when there is no time yet. */
  const additivesAt = (bySlot: FeedingAdditive[][], time: string, fallback: number) => bySlot[feedSlot(time, sessionTimes) ?? fallback] ?? [];
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

  // Without a population estimate the two cannot be converted, so the other box is left blank.
  const byFi = (cur: FiState, fi: string): FiState => {
    const kg = num(fi) > 0 && pop > 0 ? Math.round(((num(fi) * doc * pop) / 100000) * 10) / 10 : NaN;
    return { ...cur, fi, kg: Number.isFinite(kg) ? String(kg) : "" };
  };
  const byKg = (cur: FiState, kg: string): FiState => {
    const fi = num(kg) > 0 && pop > 0 && doc > 0 ? (num(kg) * 100000) / (doc * pop) : NaN;
    return { ...cur, kg, fi: Number.isFinite(fi) ? fi.toFixed(3) : "" };
  };

  /**
   * Rebuild unlocked rows from the daily total and per-feed ratios; last feed takes the
   * rounding remainder. With `prev`, every rebuilt row is put on its feed as a feed
   * nobody picked (so it is saved following the previous feed), and gets the additives
   * that day's feed at the same time had.
   */
  function applyDaily(next: FiState, prev?: { types: FeedingFeedType[]; additives: FeedingAdditive[][] }) {
    setFiState(next);
    const daily = Math.round(num(next.kg) * 10) / 10;
    const ratios = next.ratios.map((r) => num(r) || 0);
    const sum = ratios.reduce((t, r) => t + r, 0);
    if (!(daily > 0) || Math.abs(sum - 100) > 0.01 || !ratios.length) return;
    setRows((current) => {
      const editable = current.filter((r) => !r.locked);
      let used = 0;
      const rebuilt = ratios.map((r, i) => {
        const time = sessionTimes[i] ?? "";
        const base = editable[i] ?? blankRow(time, defaultTypes, additivesAt(prevAdditives, time, locked.length + i));
        let kg = i === ratios.length - 1 ? daily - used : Math.round(daily * (r / 100) * 10) / 10;
        kg = Math.max(0, Math.round(kg * 10) / 10);
        used += kg;
        const row = { ...base, time: base.time || sessionTimes[i] || "", kg: String(kg) };
        return prev ? { ...row, ...typeChoice(prev.types), inherited: true, ...additiveChoice(additivesAt(prev.additives, row.time, locked.length + i)) } : row;
      });
      return [...current.filter((r) => r.locked), ...rebuilt];
    });
  }

  const fiNum = num(fiState?.fi ?? "");
  const ratioSum = (fiState?.ratios ?? []).reduce((t, r) => t + (num(r) || 0), 0);
  const ratioOk = Math.abs(ratioSum - 100) < 0.01;

  const chip = "w-full whitespace-nowrap rounded-lg border border-dashed border-line-dash px-2.5 py-[9px] font-mono text-[11px] text-tx-muted";
  const bigInput = "w-full rounded-md border border-line bg-ink-800 px-2.5 py-2 font-mono text-base font-semibold text-tx-strong outline-none focus:border-accent";

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

      <div className={`grid gap-1.5 ${canPredict ? "grid-cols-2" : "grid-cols-1"}`}>
        <button
          type="button"
          onClick={() => {
            setPredictOpen(false);
            setFiState(fiState ? null : { fi: "", kg: "", ratios: [...defaultRatios] });
          }}
          aria-expanded={!!fiState}
          className={`rounded-lg border border-line px-1.5 py-[9px] text-center text-xs font-semibold text-accent ${fiState ? "bg-accent/15" : "bg-ink-850"}`}
        >
          Daily feed {fiState ? "▴" : "▾"}
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
          {/* One grid so both "↺" chips share a width and the two boxes line up. */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-2 gap-y-1">
            <label htmlFor={`fi-${cycle.id}`} className="col-span-2 text-[10px] uppercase tracking-[0.05em] text-tx-faint">
              Feeding index
            </label>
            <input
              id={`fi-${cycle.id}`}
              inputMode="decimal"
              placeholder="0.000"
              value={fiState.fi}
              onChange={(e) => applyDaily(byFi(fiState, decimalInput(e.target.value, 3)))}
              className={bigInput}
            />
            {prevFi ? (
              <button type="button" onClick={() => applyDaily(byFi(fiState, prevFi.value), prevFi)} aria-label="Use previous feeding index" className={chip}>
                {prevFi.label} ↺
              </button>
            ) : (
              <span />
            )}
            <label htmlFor={`kg-${cycle.id}`} className="col-span-2 mt-1.5 text-[10px] uppercase tracking-[0.05em] text-tx-faint">
              Daily feed kg
            </label>
            <input
              id={`kg-${cycle.id}`}
              inputMode="decimal"
              placeholder="0.0"
              value={fiState.kg}
              onChange={(e) => applyDaily(byKg(fiState, decimalInput(e.target.value, 1)))}
              className={bigInput}
            />
            {prevTotal ? (
              <button
                type="button"
                onClick={() => {
                  // The last day's whole schedule - times, amounts, feed and additives - so the total
                  // lands exactly as it was fed rather than re-split through rounded ratios.
                  const copied = prevTotal.rows();
                  const kg = Math.round(copied.reduce((t, r) => t + num(r.kg), 0) * 10) / 10;
                  setRows([...locked, ...copied]);
                  setFiState(byKg({ ...fiState, ratios: [...defaultRatios] }, String(kg)));
                }}
                aria-label="Use previous daily feed"
                className={chip}
              >
                {prevTotal.label} ↺
              </button>
            ) : (
              <span />
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[11px] text-tx-muted">
              = {fiNum > 0 ? fiNum.toFixed(3) : "FI"} × DOC {doc} × {pop ? fmtInt(pop) : "pop"} / 100,000
            </span>
            <span className="text-[10px] text-tx-faint">{pop ? "Estimated population for this day, after harvests." : "No population estimate for this day yet, so only the daily feed can be set."}</span>
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
                        applyDaily({ ...fiState, ratios });
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
                  onClick={() => applyDaily({ ...fiState, ratios: fiState.ratios.slice(0, -1) })}
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-line text-[15px] text-tx-muted disabled:opacity-40"
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label="One more feed"
                  onClick={() => applyDaily({ ...fiState, ratios: [...fiState.ratios, "0"] })}
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
              <select id={`${r.key}-type`} disabled={r.locked} value={r.feedTypeId} onChange={(e) => update(r.key, { feedTypeId: e.target.value, inherited: false })} className="input-xs font-sans">
                <option value="">None</option>
                {r.mix.length > 1 ? <option value="__keep">{feedTypeLabel(r.mix)}</option> : null}
                {r.feedTypeId && r.feedTypeId !== "__keep" && !feeds.some((t) => t.id === r.feedTypeId) ? (
                  <option value={r.feedTypeId}>{feedTypeLabel(r.mix)}</option>
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
                {r.additive === "__keep" ? <option value="__keep">{r.adds.map((a) => a.name).join(", ")}</option> : null}
                {r.additive && r.additive !== "__keep" && !dosables.some((a) => a.id === r.additive) ? (
                  <option value={r.additive}>{r.adds.map((a) => a.name).join(", ")}</option>
                ) : null}
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
          // A new feed continues the feed type of the one above it, a mix included, and takes the
          // additives the next time slot had the day before; the first starts from the previous feed.
          const last = rows.at(-1);
          const after = last ? feedSlot(last.time, sessionTimes) : -1;
          const next = blankRow("", defaultTypes, prevAdditives[after === null ? rows.length : after + 1] ?? []);
          setRows((rs) => [...rs, last ? { ...next, feedTypeId: last.feedTypeId, mix: last.mix, inherited: last.inherited } : next]);
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
