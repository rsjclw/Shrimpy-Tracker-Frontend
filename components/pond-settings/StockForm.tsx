"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { api, type BlindFeedingTemplate, type Cycle } from "@/lib/api";
import { cycleLabel } from "@/lib/cycles";
import { daysBetween, niceDate, todayIso } from "@/lib/dates";
import { has, num } from "@/lib/num";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Stocking a pond that was being prepared: the day the shrimp went in becomes DOC 1, with the
 * stocked population, initial ABW and blind feeding. The preparation days are measured from it.
 */
export function StockForm({
  cycle,
  templates,
  onCancel,
  onStocked,
}: {
  cycle: Cycle;
  templates: BlindFeedingTemplate[];
  onCancel: () => void;
  onStocked: () => Promise<void>;
}) {
  const today = todayIso();
  const prepStart = cycle.prep_start_date ?? cycle.start_date;
  const [day, setDay] = useState(cycle.start_date <= today ? cycle.start_date : today);
  const [pop, setPop] = useState("");
  const [abw, setAbw] = useState("0");
  const [templateId, setTemplateId] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors: string[] = [];
  if (!day || day > today) errors.push("Stocking day must be today or earlier");
  else if (day < prepStart) errors.push("Stocking day can't be before preparation started");
  if (!(Number.isInteger(num(pop)) && num(pop) > 0)) errors.push("Stocked population must be a whole number above 0");
  if (!(has(abw) && num(abw) >= 0)) errors.push("Initial ABW must be a number");
  if (templateId && target.trim() && !(num(target) > 0)) errors.push("Target ABW must be above 0");
  const prepDays = day && day >= prepStart ? daysBetween(prepStart, day) : null;

  async function submit() {
    if (errors.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.stockCycle(cycle.id, {
        start_date: day,
        initial_population: Math.trunc(num(pop)),
        initial_abw_g: num(abw),
        ...(templateId ? { blind_feeding_template_id: templateId } : {}),
        ...(templateId && target.trim() ? { blind_feeding_target_abw_g: num(target) } : {}),
      });
      await onStocked();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-accent/40 bg-accent/[0.07] p-3">
      <span className="text-[13px] font-semibold text-tx-strong">Stock {cycleLabel(cycle)}</span>
      <div className="flex flex-col gap-1">
        <label htmlFor="stock-day" className="field-label">
          Stocking day (DOC 1)
        </label>
        <input id="stock-day" type="date" value={day} min={prepStart} max={today} onChange={(e) => setDay(e.target.value)} className="input font-mono" />
        {prepDays !== null ? (
          <span className="font-mono text-[11px] text-accent">
            Preparation {niceDate(prepStart)} → {niceDate(day)} ({prepDays} days)
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="stock-pop" className="field-label">
            Stocked population
          </label>
          <input id="stock-pop" type="text" inputMode="numeric" value={pop} onChange={(e) => setPop(e.target.value.replace(/[^0-9]/g, ""))} className="input font-mono" />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="stock-abw" className="field-label">
            Initial ABW (g)
          </label>
          <input id="stock-abw" type="text" inputMode="decimal" value={abw} onChange={(e) => setAbw(e.target.value.replace(/[^0-9.]/g, ""))} className="input font-mono" />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="stock-template" className="field-label">
          Blind feeding template
        </label>
        <select id="stock-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="input-sm">
          <option value="">None</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.daily_feed_per_100k.length} days
            </option>
          ))}
        </select>
      </div>
      {templateId ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="stock-target" className="field-label">
            Target ABW after blind feeding (g)
          </label>
          <input id="stock-target" type="text" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))} className="input font-mono" />
        </div>
      ) : null}
      {errors.length && (pop || abw !== "0") ? <span className="text-xs text-bad">{errors[0]}</span> : null}
      {error ? <span className="text-xs text-bad">{error}</span> : null}
      <div className="flex justify-end gap-1.5">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={submit} disabled={busy || errors.length > 0}>
          Stock pond
        </Button>
      </div>
    </div>
  );
}
