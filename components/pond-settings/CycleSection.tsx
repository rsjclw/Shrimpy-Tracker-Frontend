"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { CollapsibleSection } from "@/components/ui/Section";
import { api, type BlindFeedingTemplate, type Cycle, type FeedType, type Pond } from "@/lib/api";
import { normalizeConfig, pastCycles, statusLabel, statusText, todayDoc, cycleLabel, nextCycleName } from "@/lib/cycles";
import { addDays, docFor, isoForDoc, niceDate, monthYear, todayIso } from "@/lib/dates";
import { fmtInt, fmtNum } from "@/lib/num";
import { crashReasonFromNotes, type CycleDraft, has, num } from "./types";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function CycleSection({
  pond,
  cycle,
  cycles,
  draft,
  onChangeDraft,
  feedTypes,
  templates,
  open,
  onToggle,
  readOnly,
  onReload,
}: {
  pond: Pond;
  cycle: Cycle | null;
  cycles: Cycle[];
  draft: CycleDraft | null;
  onChangeDraft: (next: CycleDraft) => void;
  feedTypes: FeedType[];
  templates: BlindFeedingTemplate[];
  open: boolean;
  onToggle: () => void;
  readOnly: boolean;
  onReload: () => Promise<void>;
}) {
  const past = pastCycles(cycles, pond.id);
  const prevCycle = past[0] ?? null;

  // ----- end-cycle actions (immediate) -----
  const [confirm, setConfirm] = useState<"finish" | "crash" | null>(null);
  const [crashReason, setCrashReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function doFinish() {
    if (!cycle) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await api.updateCycle(cycle.id, { status: "completed", actual_end_date: todayIso() });
      setConfirm(null);
      await onReload();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function doCrash() {
    if (!cycle || !crashReason.trim()) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const notes = (cycle.notes ? `${cycle.notes}\n` : "") + `Crashed: ${crashReason.trim()}`;
      await api.updateCycle(cycle.id, { status: "crashed", actual_end_date: todayIso(), notes });
      setConfirm(null);
      setCrashReason("");
      await onReload();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setActionBusy(false);
    }
  }

  // ----- start new cycle -----
  const suggestedName = nextCycleName(cycles, pond.id);
  const [newName, setNewName] = useState(suggestedName);
  // The start form reappears whenever a cycle ends; offer the name that fits the cycles as they are now.
  useEffect(() => {
    if (!cycle) setNewName(suggestedName);
  }, [cycle, suggestedName]);
  const [newStart, setNewStart] = useState(todayIso());
  const [newPop, setNewPop] = useState("");
  const [newAbw, setNewAbw] = useState("0");
  const [newPrep, setNewPrep] = useState("14");
  const [newTemplateId, setNewTemplateId] = useState("");
  const [newTargetAbw, setNewTargetAbw] = useState("");
  const [copyTargets, setCopyTargets] = useState(true);
  // Preparation days live inside the prediction settings, so they only apply when settings are copied.
  const copying = copyTargets && !!prevCycle?.prediction_config;
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Refresh the "start next cycle" suggestions whenever the active cycle just
  // ended (finish/crash reload), rather than only once at first mount.
  const hadCycle = useRef(!!cycle);
  useEffect(() => {
    if (hadCycle.current && !cycle) {
      setNewName(suggestedName);
      setNewStart(todayIso());
      setNewPop("");
      setNewAbw("0");
      setNewPrep("14");
    }
    hadCycle.current = !!cycle;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle]);

  const startErrors: string[] = [];
  if (!newName.trim()) startErrors.push("Cycle name is empty");
  if (!newStart || newStart > todayIso()) startErrors.push("Start date must be today or earlier");
  if (!(Number.isInteger(num(newPop)) && num(newPop) > 0)) startErrors.push("Stocked population must be a whole number above 0");
  if (!(has(newAbw) && num(newAbw) >= 0)) startErrors.push("Initial ABW must be a number");
  if (copying && !/^\d+$/.test(newPrep || "")) startErrors.push("Preparation days must be a whole number");

  async function startCycle() {
    if (startErrors.length) return;
    setStartBusy(true);
    setStartError(null);
    try {
      const prepDays = Math.trunc(num(newPrep)) || 0;
      // Only carry settings the farmer already chose. Without a previous cycle to copy, the new cycle
      // starts with none and pond settings shows the defaults until they are saved.
      const config = copying && prevCycle?.prediction_config
        ? (() => {
            const c = normalizeConfig(prevCycle.prediction_config);
            return { ...c, cycle: { ...c.cycle, preparation_day: prepDays } };
          })()
        : null;
      let plannedEndDate: string | undefined;
      if (copying && prevCycle?.planned_end_date) {
        const doc = docFor(prevCycle.start_date, prevCycle.planned_end_date);
        plannedEndDate = isoForDoc(newStart, doc);
      }
      await api.createCycle({
        pond_id: pond.id,
        name: newName.trim(),
        start_date: newStart,
        initial_population: Math.trunc(num(newPop)),
        initial_abw_g: num(newAbw),
        ...(newTemplateId ? { blind_feeding_template_id: newTemplateId } : {}),
        ...(newTemplateId && newTargetAbw.trim() ? { blind_feeding_target_abw_g: num(newTargetAbw) } : {}),
        ...(config ? { feeding_index_increment: config.growth.feeding_index_increment, maximum_feeding_index: config.growth.maximum_feeding_index } : {}),
        ...(plannedEndDate ? { planned_end_date: plannedEndDate } : {}),
        ...(config && config.feed_plan.length >= 1 ? { prediction_config: config } : {}),
      });
      setNewName("");
      setNewStart(todayIso());
      setNewPop("");
      setNewAbw("0");
      setNewPrep("14");
      setNewTemplateId("");
      setNewTargetAbw("");
      setCopyTargets(true);
      await onReload();
    } catch (err) {
      setStartError(errorText(err));
    } finally {
      setStartBusy(false);
    }
  }

  // ----- past cycles -----
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyAll, setHistoryAll] = useState(false);
  const shown = historyAll ? past : past.slice(0, 5);

  const summary = cycle
    ? `${cycleLabel({ name: draft?.name || cycle.name })} · DOC ${todayDoc(cycle)}${draft?.finalDoc ? ` of ${draft.finalDoc}` : ""} · ${draft?.prepDays ?? "0"}d prep · started ${niceDate(cycle.start_date)}`
    : `${prevCycle ? `${cycleLabel(prevCycle)} ${statusLabel(prevCycle.status).toLowerCase()}` : "No cycles yet"}${suggestedName ? ` · ready for ${cycleLabel({ name: suggestedName })}` : ""}`;

  const finalDocNum = draft?.finalDoc && draft.finalDoc.trim() ? Math.trunc(num(draft.finalDoc)) : null;
  const doc = cycle ? todayDoc(cycle) : 0;
  const progressPct = finalDocNum && finalDocNum > 0 ? Math.max(2, Math.min(100, (doc / finalDocNum) * 100)) : 0;

  return (
    <CollapsibleSection title="Cycle" summary={summary} open={open} onToggle={onToggle}>
      <div className="flex flex-col gap-3.5 px-0.5 py-1">
        {cycle && draft ? (
          <>
            <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-ink-850 p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold text-tx-strong">{cycleLabel({ name: draft.name || cycle.name })}</span>
                <span className="text-xs font-bold text-accent">Active</span>
              </div>
              <span className="text-xs text-tx-muted">
                Started {niceDate(cycle.start_date)}
                {finalDocNum ? ` · ${Math.max(0, finalDocNum - doc)} days to target` : ""}
              </span>
              <div className="flex flex-col gap-1">
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="flex justify-between font-mono text-[11px] text-tx-dim">
                  <span>DOC {doc}</span>
                  <span>{finalDocNum ? `Target DOC ${finalDocNum}` : "No target DOC set"}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="c-name" className="field-label">
                  Cycle name
                </label>
                <input
                  id="c-name"
                  type="text"
                  value={draft.name}
                  disabled={readOnly}
                  onChange={(e) => onChangeDraft({ ...draft, name: e.target.value })}
                  className={`input font-mono font-semibold ${!draft.name.trim() ? "input-error" : ""}`}
                />
              </div>
              <div className="grid grid-cols-[1.4fr_1fr] gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="field-label">Start date</span>
                  <span className="input flex items-center font-mono text-tx-muted opacity-70">{niceDate(cycle.start_date)}</span>
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor="c-prep" className="field-label">
                    Preparation days
                  </label>
                  <input
                    id="c-prep"
                    type="text"
                    inputMode="numeric"
                    value={draft.prepDays}
                    disabled={readOnly}
                    onChange={(e) => onChangeDraft({ ...draft, prepDays: e.target.value.replace(/[^0-9]/g, "") })}
                    className={`input font-mono ${!/^\d+$/.test(draft.prepDays || "") ? "input-error" : ""}`}
                  />
                </div>
              </div>
              <span className="font-mono text-[11px] text-accent">
                {(() => {
                  const n = Math.trunc(num(draft.prepDays));
                  if (!Number.isFinite(n)) return "";
                  if (n === 0) return "No preparation period";
                  return `Preparation ${niceDate(addDays(cycle.start_date, -n))} → ${niceDate(cycle.start_date)} (${n} days)`;
                })()}
              </span>
              <div className="flex gap-4 pt-1 font-mono text-xs text-tx-dim">
                <span>Stocked {fmtInt(cycle.initial_population)}</span>
                <span>Initial ABW {fmtNum(cycle.initial_abw_g, 3)} g</span>
              </div>
            </div>

            {!readOnly && !confirm ? (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setConfirm("finish")} className="!text-accent !border-accent">
                  Finish cycle
                </Button>
                <Button variant="outline-danger" onClick={() => setConfirm("crash")}>
                  Crash cycle
                </Button>
              </div>
            ) : null}

            {confirm === "finish" ? (
              <div className="flex flex-col gap-2.5 rounded-xl border border-accent/40 bg-accent/[0.07] p-3">
                <span className="text-[13px] text-tx">
                  Finish {cycleLabel(cycle)} today at DOC {doc}? Logging stops for this cycle and it moves to past cycles.
                </span>
                {actionError ? <span className="text-xs text-bad">{actionError}</span> : null}
                <div className="flex justify-end gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => setConfirm(null)} disabled={actionBusy}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" onClick={doFinish} disabled={actionBusy}>
                    Finish cycle
                  </Button>
                </div>
              </div>
            ) : null}

            {confirm === "crash" ? (
              <div className="flex flex-col gap-2.5 rounded-xl border border-bad/45 bg-bad/[0.07] p-3">
                <span className="text-[13px] text-bad-soft">
                  Crash {cycleLabel(cycle)} at DOC {doc}? Use this when the crop is lost early. It can&apos;t be undone here.
                </span>
                <div className="flex flex-col gap-1">
                  <label htmlFor="c-reason" className="field-label">
                    What happened?
                  </label>
                  <input
                    id="c-reason"
                    type="text"
                    placeholder="e.g. White spot, mass mortality"
                    value={crashReason}
                    onChange={(e) => setCrashReason(e.target.value)}
                    className="input"
                  />
                </div>
                {actionError ? <span className="text-xs text-bad">{actionError}</span> : null}
                <div className="flex justify-end gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => setConfirm(null)} disabled={actionBusy}>
                    Cancel
                  </Button>
                  <Button variant="danger-solid" size="sm" onClick={doCrash} disabled={actionBusy || !crashReason.trim()}>
                    Crash cycle
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {!cycle && !readOnly ? (
          <div className="flex flex-col gap-2.5 rounded-2xl border border-dashed border-line-dash bg-ink-850 p-3.5">
            <span className="text-[15px] font-bold text-tx-strong">Start {newName.trim() ? newName.trim() : "new cycle"}</span>
            <div className="flex flex-col gap-1">
              <label htmlFor="c-new-name" className="field-label">
                Cycle name
              </label>
              <input id="c-new-name" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="input font-mono font-semibold" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="c-new-start" className="field-label">
                Start date
              </label>
              <input id="c-new-start" type="date" value={newStart} max={todayIso()} onChange={(e) => setNewStart(e.target.value)} className="input font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor="c-new-pop" className="field-label">
                  Stocked population
                </label>
                <input id="c-new-pop" type="text" inputMode="numeric" value={newPop} onChange={(e) => setNewPop(e.target.value.replace(/[^0-9]/g, ""))} className="input font-mono" />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor="c-new-abw" className="field-label">
                  Initial ABW (g)
                </label>
                <input id="c-new-abw" type="text" inputMode="decimal" value={newAbw} onChange={(e) => setNewAbw(e.target.value.replace(/[^0-9.]/g, ""))} className="input font-mono" />
              </div>
            </div>
            {copying ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="c-new-prep" className="field-label">
                Preparation days
              </label>
              <input id="c-new-prep" type="text" inputMode="numeric" value={newPrep} onChange={(e) => setNewPrep(e.target.value.replace(/[^0-9]/g, ""))} className="input font-mono" />
              <span className="font-mono text-[11px] text-accent">
                {(() => {
                  const n = Math.trunc(num(newPrep));
                  if (!newStart || !Number.isFinite(n)) return "";
                  if (n === 0) return "No preparation period";
                  return `Preparation starts ${niceDate(addDays(newStart, -n))}`;
                })()}
              </span>
            </div>
            ) : (
              <span className="text-[11px] text-tx-faint">Preparation days, targets and the feed plan are set in the sections below once the cycle starts.</span>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="c-new-template" className="field-label">
                Blind feeding template
              </label>
              <select id="c-new-template" value={newTemplateId} onChange={(e) => setNewTemplateId(e.target.value)} className="input-sm">
                <option value="">None</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            {newTemplateId ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="c-new-target-abw" className="field-label">
                  Target ABW after blind feeding (g)
                </label>
                <input
                  id="c-new-target-abw"
                  type="text"
                  inputMode="decimal"
                  value={newTargetAbw}
                  onChange={(e) => setNewTargetAbw(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="input font-mono"
                />
              </div>
            ) : null}
            {prevCycle ? (
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-tx-soft">
                <input type="checkbox" checked={copyTargets} onChange={(e) => setCopyTargets(e.target.checked)} className="h-[18px] w-[18px] accent-accent" />
                Copy targets and feeding program from {cycleLabel(prevCycle)}
              </label>
            ) : null}
            {startErrors.length ? <span className="text-xs text-bad">{startErrors[0]}</span> : null}
            {startError ? <span className="text-xs text-bad">{startError}</span> : null}
            <Button variant="primary" size="lg" block onClick={startCycle} disabled={startBusy || startErrors.length > 0}>
              Start new cycle
            </Button>
          </div>
        ) : null}
        {!cycle && readOnly ? <span className="text-xs text-tx-dim">No active cycle.</span> : null}

        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((v) => !v)}
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`shrink-0 text-tx-dim transition-transform ${historyOpen ? "rotate-180" : ""}`}>
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {historyOpen ? (
            <div className="flex flex-col gap-1.5">
              {shown.map((c) => {
                const end = c.actual_end_date ?? c.planned_end_date ?? c.start_date;
                const days = docFor(c.start_date, end);
                const reason = c.status === "crashed" ? crashReasonFromNotes(c.notes) : "";
                return (
                  <div key={c.id} className="flex items-center gap-2.5 rounded-[10px] bg-ink-850 px-3 py-2.5">
                    <span className="w-16 shrink-0 text-[13px] font-semibold text-tx">{cycleLabel(c)}</span>
                    <span className="min-w-0 flex-grow truncate text-xs text-tx-dim">
                      {days} days · ended {monthYear(end)}
                      {reason ? ` · ${reason}` : ""}
                    </span>
                    <span className={`shrink-0 text-[11px] font-bold ${statusText(c.status)}`}>{statusLabel(c.status)}</span>
                  </div>
                );
              })}
              {past.length > 5 && !historyAll ? (
                <button type="button" onClick={() => setHistoryAll(true)} className="self-start px-1 py-2 text-xs font-bold text-accent">
                  Show all {past.length}
                </button>
              ) : null}
              {past.length === 0 ? <span className="px-0.5 py-1 text-xs text-tx-dim">No past cycles yet.</span> : null}
            </div>
          ) : null}
        </div>
      </div>
    </CollapsibleSection>
  );
}
