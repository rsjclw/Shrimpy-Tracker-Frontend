"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { api, type BlindFeedingTemplate, type Cycle } from "@/lib/api";
import { targetDoc } from "@/lib/cycles";
import { addDays, daysBetween, isoForDoc, shortDate, todayIso } from "@/lib/dates";
import { fmtInt, fmtNum, has, num } from "@/lib/num";

type Draft = { start: string; pop: string; abw: string; templateId: string; target: string };

function draftOf(cycle: Cycle): Draft {
  return {
    start: cycle.start_date,
    pop: String(cycle.initial_population),
    abw: String(num(cycle.initial_abw_g)),
    templateId: cycle.blind_feeding_template_id ?? "",
    target: cycle.blind_feeding_target_abw_g === null ? "" : String(num(cycle.blind_feeding_target_abw_g)),
  };
}

/** "1 Sep – 30 Sep": the days a template feeds from `start`. */
function span(start: string, template: BlindFeedingTemplate): string {
  return `${shortDate(start)} – ${shortDate(addDays(start, template.daily_feed_per_100k.length - 1))}`;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Start date, stocking and blind feeding of a running cycle. These are what the blind-feeding
 * plan is built from, so changing one asks whether to recalculate that plan or leave the
 * feedings where they are. Saves on its own, like Finish and Crash, not through the page's save bar.
 */
export function StockingEditor({
  cycle,
  templates,
  blocked,
  onCancel,
  onSaved,
}: {
  cycle: Cycle;
  templates: BlindFeedingTemplate[];
  /** Other unsaved edits on the page: saving here reloads the page and would drop them. */
  blocked: boolean;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [d, setD] = useState<Draft>(() => draftOf(cycle));
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();

  const oldTemplate = templates.find((t) => t.id === cycle.blind_feeding_template_id) ?? null;
  const newTemplate = templates.find((t) => t.id === d.templateId) ?? null;
  const pop = num(d.pop);
  const abw = num(d.abw);
  const target = newTemplate && d.target.trim() ? num(d.target) : null;
  const oldTarget = cycle.blind_feeding_target_abw_g === null ? null : num(cycle.blind_feeding_target_abw_g);
  const keptTargetDoc = targetDoc(cycle);

  const errors: string[] = [];
  if (!d.start || d.start > today) errors.push("Start date must be today or earlier");
  else if (cycle.actual_end_date && d.start > cycle.actual_end_date) errors.push("Start date must be on or before the cycle's end");
  if (!(Number.isInteger(pop) && pop > 0)) errors.push("Stocked population must be a whole number above 0");
  if (!(has(d.abw) && abw >= 0)) errors.push("Initial ABW must be a number");
  if (target !== null && !(target > 0)) errors.push("Target ABW must be above 0");

  const templateChanged = (d.templateId || null) !== cycle.blind_feeding_template_id;
  const changed = {
    start: d.start !== cycle.start_date,
    pop: pop !== cycle.initial_population,
    abw: abw !== num(cycle.initial_abw_g),
    template: templateChanged,
    // Without a template the target means nothing; it only changes with one, or is dropped with it.
    target: newTemplate ? target !== oldTarget : templateChanged && oldTarget !== null,
  };
  const anything = Object.values(changed).some(Boolean);
  // The template and its target are the plan itself: changing them always rewrites it (the backend
  // insists too). Start and population only feed into it, so for those the user picks.
  const planChanged = changed.template || changed.target;
  const askPlan = !planChanged && (changed.start || changed.pop) && !!oldTemplate;
  const onlyStart = changed.start && !changed.pop && !changed.abw;
  const shift = d.start ? Math.abs(daysBetween(cycle.start_date, d.start)) : 0;

  const lines: string[] = [];
  if (changed.start) {
    lines.push(
      `Start date ${shortDate(cycle.start_date)} → ${shortDate(d.start)}: logs keep their dates, their DOC shifts by ${shift} day${shift === 1 ? "" : "s"}${keptTargetDoc ? `, target stays DOC ${keptTargetDoc}` : ""}.`,
    );
  }
  if (changed.pop) lines.push(`Stocked ${fmtInt(cycle.initial_population)} → ${fmtInt(pop)}.`);
  if (changed.abw) lines.push(`Initial ABW ${fmtNum(cycle.initial_abw_g, 3)} → ${fmtNum(abw, 3)} g.`);
  if (changed.template) lines.push(`Blind feeding ${oldTemplate?.name ?? "none"} → ${newTemplate?.name ?? "none"}.`);
  if (changed.target && newTemplate) lines.push(`Target ABW ${oldTarget === null ? "none" : `${fmtNum(oldTarget, 2)} g`} → ${target === null ? "none" : `${fmtNum(target, 2)} g`}.`);

  const recalcText =
    oldTemplate && newTemplate
      ? `Feedings ${span(cycle.start_date, oldTemplate)} are replaced by a fresh ${newTemplate.name} plan for ${span(d.start, newTemplate)}.`
      : oldTemplate
        ? `Blind feeding ${span(cycle.start_date, oldTemplate)} is removed.`
        : newTemplate
          ? `A ${newTemplate.name} plan is written for ${span(d.start, newTemplate)}.`
          : "";

  function submit() {
    if (errors.length || !anything || busy || blocked) return;
    if (planChanged || askPlan || changed.start) setChoosing(true);
    else save(false);
  }

  async function save(recalculate: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.updateCycle(cycle.id, {
        ...(changed.start ? { start_date: d.start } : {}),
        // Keep the target DOC: the planned end moves with the start.
        ...(changed.start && keptTargetDoc ? { planned_end_date: isoForDoc(d.start, keptTargetDoc) } : {}),
        ...(changed.pop ? { initial_population: pop } : {}),
        ...(changed.abw ? { initial_abw_g: abw } : {}),
        ...(changed.template ? { blind_feeding_template_id: d.templateId || null } : {}),
        ...(changed.target ? { blind_feeding_target_abw_g: target } : {}),
        ...(recalculate ? { recalculate_blind_feeding: true } : {}),
      });
      await onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const set = (patch: Partial<Draft>) => setD((cur) => ({ ...cur, ...patch }));

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-accent/40 bg-accent/[0.07] p-3">
      <span className="text-[13px] font-semibold text-tx-strong">Edit stocking &amp; blind feeding</span>
      <div className="flex flex-col gap-1">
        <label htmlFor="s-start" className="field-label">
          Start date (DOC 1)
        </label>
        <input
          id="s-start"
          type="date"
          value={d.start}
          max={cycle.actual_end_date && cycle.actual_end_date < today ? cycle.actual_end_date : today}
          disabled={choosing}
          onChange={(e) => set({ start: e.target.value })}
          className="input font-mono"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="s-pop" className="field-label">
            Stocked population
          </label>
          <input
            id="s-pop"
            type="text"
            inputMode="numeric"
            value={d.pop}
            disabled={choosing}
            onChange={(e) => set({ pop: e.target.value.replace(/[^0-9]/g, "") })}
            className="input font-mono"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="s-abw" className="field-label">
            Initial ABW (g)
          </label>
          <input
            id="s-abw"
            type="text"
            inputMode="decimal"
            value={d.abw}
            disabled={choosing}
            onChange={(e) => set({ abw: e.target.value.replace(/[^0-9.]/g, "") })}
            className="input font-mono"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="s-template" className="field-label">
          Blind feeding template
        </label>
        <select id="s-template" value={d.templateId} disabled={choosing} onChange={(e) => set({ templateId: e.target.value })} className="input-sm">
          <option value="">None</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.daily_feed_per_100k.length} days
            </option>
          ))}
        </select>
      </div>
      {newTemplate ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="s-target" className="field-label">
            Target ABW after blind feeding (g)
          </label>
          <input
            id="s-target"
            type="text"
            inputMode="decimal"
            value={d.target}
            disabled={choosing}
            onChange={(e) => set({ target: e.target.value.replace(/[^0-9.]/g, "") })}
            className="input font-mono"
          />
        </div>
      ) : null}

      {anything && errors.length ? <span className="text-xs text-bad">{errors[0]}</span> : null}
      {blocked ? <span className="text-xs text-warn">Save or discard your other changes on this page first.</span> : null}
      {error ? <span className="text-xs text-bad">{error}</span> : null}

      {!choosing ? (
        <div className="flex justify-end gap-1.5">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={busy || blocked || !anything || errors.length > 0}>
            Save
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 border-t border-accent/25 pt-2.5">
          {lines.map((l) => (
            <span key={l} className="text-[13px] text-tx">
              {l}
            </span>
          ))}
          {planChanged ? (
            <>
              <span className="text-xs text-tx-muted">
                {recalcText ? `${recalcText} ` : ""}Any other feedings logged on those days are replaced too.
              </span>
              <div className="flex justify-end gap-1.5">
                <Button variant="secondary" size="sm" onClick={() => setChoosing(false)} disabled={busy}>
                  Back
                </Button>
                <Button variant="primary" size="sm" onClick={() => save(true)} disabled={busy || blocked}>
                  Rewrite blind feeding
                </Button>
              </div>
            </>
          ) : askPlan ? (
            <>
              <button
                type="button"
                onClick={() => save(true)}
                disabled={busy || blocked}
                className="flex flex-col items-start gap-0.5 rounded-xl border border-accent bg-ink-850 px-3 py-2.5 text-left disabled:opacity-40"
              >
                <span className="text-[13px] font-bold text-accent">Recalculate blind feeding</span>
                <span className="text-xs text-tx-muted">{recalcText} Any other feedings logged on those days are replaced too.</span>
              </button>
              <button
                type="button"
                onClick={() => save(false)}
                disabled={busy || blocked}
                className="flex flex-col items-start gap-0.5 rounded-xl border border-line bg-ink-850 px-3 py-2.5 text-left disabled:opacity-40"
              >
                <span className="text-[13px] font-bold text-tx-strong">{onlyStart ? "Just move the date" : "Keep feedings as they are"}</span>
                <span className="text-xs text-tx-muted">{onlyStart ? "Feedings stay on their dates; only their DOC changes." : "Save the change; no feeding is added, moved or removed."}</span>
              </button>
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={() => setChoosing(false)} disabled={busy}>
                  Back
                </Button>
              </div>
            </>
          ) : (
            <div className="flex justify-end gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => setChoosing(false)} disabled={busy}>
                Back
              </Button>
              <Button variant="primary" size="sm" onClick={() => save(false)} disabled={busy || blocked}>
                Save
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
