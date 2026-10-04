"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { api, type Cycle, type CycleSummary } from "@/lib/api";
import { closedEndDate, cycleLabel, statusLabel, statusText } from "@/lib/cycles";
import { docFor, hhmm, monthYear, niceDate, shortDate, todayIso } from "@/lib/dates";
import { fmtDec, fmtInt, fmtNum, num, rupiah } from "@/lib/num";
import { crashReasonFromNotes } from "./types";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-px">
      <span className="truncate text-[10px] text-tx-faint">{label}</span>
      <span className="truncate font-mono text-xs font-semibold text-tx">{value}</span>
    </div>
  );
}

const dash = (v: string | number | null, f: (v: string | number) => string) => (v === null ? "—" : f(v));
/** Piece counts: 30k for 30,000; under a thousand as they are. */
const pcs = (n: string | number) => (num(n) >= 1000 ? `${fmtNum(num(n) / 1000, 1)}k` : fmtInt(n));

/** The five numbers every past cycle shows. */
function BasicStats({ s }: { s: CycleSummary }) {
  return (
    <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
      <Stat label="Harvest" value={`${fmtInt(s.total_harvest_kg)} kg`} />
      <Stat label="Feed" value={`${fmtInt(s.total_feed_kg)} kg`} />
      <Stat label="Yield t/1,000 m²" value={dash(s.yield_t_per_1000m2, (v) => fmtDec(v, 2))} />
      <Stat label="FCR" value={dash(s.fcr, (v) => fmtDec(v, 2))} />
      <Stat label="SR" value={dash(s.survival_rate_pct, (v) => `${fmtDec(v, 1)}%`)} />
      <Stat label="Revenue" value={rupiah(s.total_revenue)} />
    </div>
  );
}

/** The rest, on expand: populations, growth, peaks and the harvest list. */
function Details({ s }: { s: CycleSummary }) {
  const atDoc = (v: string | number | null, doc: number | null, f: (v: string | number) => string) => (v === null ? "—" : `${f(v)}${doc !== null ? ` · DOC ${doc}` : ""}`);
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2">
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
        <Stat label="Initial population" value={fmtInt(s.initial_population)} />
        <Stat label="Final population" value={dash(s.final_population, (v) => fmtInt(v))} />
        <Stat label="Final harvest" value={dash(s.final_harvest_kg, (v) => `${fmtDec(v, 1)} kg`)} />
        <Stat label="Average ADG (final ABW ÷ DOC)" value={dash(s.average_adg_g_per_day, (v) => `${fmtDec(v, 2)} g/day`)} />
        <Stat label="Max biomass" value={atDoc(s.max_biomass_kg, s.max_biomass_doc, (v) => `${fmtInt(v)} kg`)} />
        <Stat label="Max carrying capacity" value={dash(s.max_carrying_capacity_kg_m2, (v) => `${fmtDec(v, 2)} kg/m²`)} />
        <Stat label="Highest daily feed" value={atDoc(s.highest_daily_feed_kg, s.highest_daily_feed_doc, (v) => `${fmtDec(v, 1)} kg`)} />
        <Stat label="Max mortality a day" value={atDoc(s.max_mortality, s.max_mortality_doc, (v) => `${pcs(v)} pcs`)} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.06em] text-tx-faint">Harvests {s.harvests.length}</span>
        {s.harvests.length ? (
          s.harvests.map((h) => (
            <div key={`${h.date}-${h.harvest_time}`} className="flex flex-col gap-px rounded-lg bg-ink-800 px-2.5 py-1.5">
              <span className="flex items-center justify-between gap-2 font-mono text-[11px] text-tx-muted">
                <span>
                  D{h.doc} · {shortDate(h.date)} · {hhmm(h.harvest_time)}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {num(h.revenue) > 0 ? <span className="text-tx">{rupiah(h.revenue)}</span> : null}
                  {h.final ? <span className="rounded-full border border-current px-1.5 text-[9px] font-bold uppercase text-warn">Final</span> : null}
                </span>
              </span>
              <span className="font-mono text-xs text-tx">
                {fmtDec(h.biomass_kg, 1)} kg · {fmtDec(h.abw_g, 2)} g{h.size_pcs_per_kg ? ` · size ${h.size_pcs_per_kg}` : ""} · ≈{pcs(h.count)} pcs
              </span>
            </div>
          ))
        ) : (
          <span className="text-[11px] text-tx-faint">No harvests recorded.</span>
        )}
      </div>
    </div>
  );
}

/**
 * Past cycles as result cards, collapsed until opened. Each shows its harvest, feed, yield, FCR
 * and survival rate; tapping one adds the details and its harvests. The newest can be reopened
 * while the pond runs nothing.
 */
export function PastCycles({ past, allowReopen, onReload }: { past: Cycle[]; allowReopen: boolean; onReload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const shown = all ? past : past.slice(0, 5);

  // Results per cycle, fetched once the list opens. Keyed by cycle and end date, so finishing again on another day refetches.
  const [summaries, setSummaries] = useState<Record<string, CycleSummary | "loading" | "error">>({});
  const key = (c: Cycle) => `${c.id}:${closedEndDate(c, todayIso())}`;
  const shownKey = shown.map(key).join(",");
  useEffect(() => {
    if (!open) return;
    shown
      .filter((c) => !(key(c) in summaries))
      .forEach((c) => {
        const k = key(c);
        setSummaries((m) => ({ ...m, [k]: "loading" }));
        api
          .getCycleSummary(c.id)
          .then((s) => setSummaries((m) => ({ ...m, [k]: s })))
          .catch(() => setSummaries((m) => ({ ...m, [k]: "error" })));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shownKey]);

  // Only the newest past cycle, and only while the pond runs nothing: a pond shows one current cycle.
  const reopenable = allowReopen ? (past[0] ?? null) : null;
  const [reopenConfirm, setReopenConfirm] = useState(false);
  const [reopenBusy, setReopenBusy] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  async function doReopen() {
    if (!reopenable) return;
    setReopenBusy(true);
    setReopenError(null);
    try {
      // Send the end date along: the backend clears it on reopen otherwise, and the cycle would run on to today.
      await api.updateCycle(reopenable.id, { status: "active", actual_end_date: closedEndDate(reopenable, todayIso()) });
      setReopenConfirm(false);
      await onReload();
    } catch (err) {
      setReopenError(errorText(err));
    } finally {
      setReopenBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-[10px] border border-line bg-ink-850 px-3 py-2.5 text-left"
      >
        <div className="flex min-w-0 flex-grow flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-[0.08em] text-tx-soft">
            Past cycles <span className="font-mono text-tx-faint">{past.length}</span>
          </span>
          <span className="truncate text-xs text-tx-dim">
            {past.length ? `Last: ${cycleLabel(past[0])}, ${statusLabel(past[0].status).toLowerCase()} ${monthYear(past[0].actual_end_date ?? past[0].planned_end_date ?? past[0].start_date)}` : "None yet"}
          </span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`shrink-0 text-tx-dim transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="flex flex-col gap-1.5">
          {shown.map((c) => {
            const end = c.actual_end_date ?? c.planned_end_date ?? c.start_date;
            const days = docFor(c.start_date, end);
            const reason = c.status === "crashed" ? crashReasonFromNotes(c.notes) : "";
            const canReopen = reopenable?.id === c.id;
            const s = summaries[key(c)];
            const isOpen = expanded === c.id;
            return (
              <div key={c.id} className="flex flex-col gap-1.5">
                <div className="flex flex-col gap-2 rounded-[10px] bg-ink-850 px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-16 shrink-0 text-[13px] font-semibold text-tx">{cycleLabel(c)}</span>
                    <span className="min-w-0 flex-grow truncate text-xs text-tx-dim">
                      {days} days · ended {monthYear(end)}
                      {reason ? ` · ${reason}` : ""}
                    </span>
                    <span className={`shrink-0 text-[11px] font-bold ${statusText(c.status)}`}>{statusLabel(c.status)}</span>
                    {canReopen && !reopenConfirm ? (
                      <button
                        type="button"
                        onClick={() => {
                          setReopenError(null);
                          setReopenConfirm(true);
                        }}
                        className="shrink-0 rounded-full border border-accent px-2.5 py-1 text-[11px] font-bold text-accent"
                      >
                        Reopen
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={`${cycleLabel(c)} details`}
                      onClick={() => setExpanded(isOpen ? null : c.id)}
                      className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center text-tx-dim"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`transition-transform ${isOpen ? "rotate-180" : ""}`}>
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                  {s === undefined || s === "loading" ? (
                    <span className="text-[11px] text-tx-faint">Loading results…</span>
                  ) : s === "error" ? (
                    <span className="text-[11px] text-bad">Couldn&apos;t load this cycle&apos;s results.</span>
                  ) : (
                    <>
                      <BasicStats s={s} />
                      {isOpen ? <Details s={s} /> : null}
                    </>
                  )}
                </div>
                {canReopen && reopenConfirm ? (
                  <div className="flex flex-col gap-2.5 rounded-xl border border-warn/40 bg-warn/[0.07] p-3">
                    <span className="text-[13px] text-tx">
                      Reopen {cycleLabel(c)}? It becomes the active cycle again so you can add missing logs. It keeps its end date,{" "}
                      {niceDate(closedEndDate(c, todayIso()))}. Finish it again when you&apos;re done.
                    </span>
                    {reopenError ? <span className="text-xs text-bad">{reopenError}</span> : null}
                    <div className="flex justify-end gap-1.5">
                      <Button variant="secondary" size="sm" onClick={() => setReopenConfirm(false)} disabled={reopenBusy}>
                        Cancel
                      </Button>
                      <Button variant="primary" size="sm" onClick={doReopen} disabled={reopenBusy}>
                        Reopen cycle
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {past.length > 5 && !all ? (
            <button type="button" onClick={() => setAll(true)} className="self-start px-1 py-2 text-xs font-bold text-accent">
              Show all {past.length}
            </button>
          ) : null}
          {past.length === 0 ? <span className="px-0.5 py-1 text-xs text-tx-dim">No past cycles yet.</span> : null}
        </div>
      ) : null}
    </div>
  );
}
