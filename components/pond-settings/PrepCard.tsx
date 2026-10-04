"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { api, type BlindFeedingTemplate, type Cycle } from "@/lib/api";
import { cycleLabel, prepDay } from "@/lib/cycles";
import { addDays, daysBetween, niceDate, todayIso } from "@/lib/dates";
import { StockForm } from "./StockForm";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** "in 8 days" / "today" / "3 days ago" for the planned stocking day. */
export function stockingDue(planned: string, today: string): string {
  const until = daysBetween(today, planned);
  if (until === 0) return "today";
  return until > 0 ? `in ${until} day${until === 1 ? "" : "s"}` : `${-until} day${until === -1 ? "" : "s"} overdue`;
}

/** A pond being prepared: its preparation day, the planned stocking day, and the way to stock it or call it off. */
export function PrepCard({
  cycle,
  templates,
  readOnly,
  autoStock,
  onReload,
}: {
  cycle: Cycle;
  templates: BlindFeedingTemplate[];
  readOnly: boolean;
  /** Open the stocking form straight away (the dashboard's Stock pond link). */
  autoStock: boolean;
  onReload: () => Promise<void>;
}) {
  const today = todayIso();
  const prepStart = cycle.prep_start_date ?? cycle.start_date;
  const [planned, setPlanned] = useState(cycle.start_date);
  const [prepDraft, setPrepDraft] = useState(prepStart);
  const [stocking, setStocking] = useState(autoStock && !readOnly);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const moved = planned !== cycle.start_date;
  const prepMoved = prepDraft !== prepStart;
  const dateError = !prepDraft || prepDraft > today
    ? "Preparation starts today or earlier"
    : !planned || planned < prepDraft
    ? "The planned stocking day can't be before preparation starts"
    : null;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onReload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  // Moving the planned day keeps the target DOC: the planned end moves with it.
  const saveDates = () =>
    run(() =>
      api.updateCycle(cycle.id, {
        ...(prepMoved ? { prep_start_date: prepDraft } : {}),
        ...(moved
          ? {
              start_date: planned,
              ...(cycle.planned_end_date ? { planned_end_date: addDays(cycle.planned_end_date, daysBetween(cycle.start_date, planned)) } : {}),
            }
          : {}),
      }),
    );

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-ink-850 p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-bold text-tx-strong">{cycleLabel(cycle)}</span>
          <span className="text-xs font-bold text-violet">Preparing</span>
        </div>
        <span className="text-xs text-tx-muted">
          Prep day {prepDay(cycle, today)} · started {niceDate(prepStart)} · stocking {stockingDue(cycle.start_date, today)}
        </span>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="prep-start" className="field-label">
              Preparation started
            </label>
            <input
              id="prep-start"
              type="date"
              value={prepDraft}
              max={planned && planned < today ? planned : today}
              disabled={readOnly || busy}
              onChange={(e) => setPrepDraft(e.target.value)}
              className="input min-w-0 font-mono"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="prep-planned" className="field-label">
              Planned stocking day
            </label>
            <input
              id="prep-planned"
              type="date"
              value={planned}
              min={prepDraft}
              disabled={readOnly || busy}
              onChange={(e) => setPlanned(e.target.value)}
              className="input min-w-0 font-mono"
            />
          </div>
        </div>
        {(moved || prepMoved) && !readOnly ? (
          <div className="flex items-center justify-end gap-2">
            {dateError ? <span className="mr-auto text-xs text-bad">{dateError}</span> : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setPlanned(cycle.start_date);
                setPrepDraft(prepStart);
              }}
              disabled={busy}
            >
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={saveDates} disabled={busy || !!dateError}>
              Save
            </Button>
          </div>
        ) : null}
        <span className="text-[11px] text-tx-faint">Water and treatments are logged on the pond card while preparing. Feed, sampling and harvests start once the pond is stocked.</span>
      </div>

      {error ? <span className="text-xs text-bad">{error}</span> : null}

      {!readOnly && !stocking && !cancelConfirm ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" onClick={() => setStocking(true)}>
            Stock pond
          </Button>
          <Button variant="outline-danger" onClick={() => setCancelConfirm(true)}>
            Cancel preparation
          </Button>
        </div>
      ) : null}

      {stocking ? <StockForm cycle={cycle} templates={templates} onCancel={() => setStocking(false)} onStocked={onReload} /> : null}

      {cancelConfirm ? (
        <div className="flex flex-col gap-2.5 rounded-xl border border-bad/45 bg-bad/[0.07] p-3">
          <span className="text-[13px] text-bad-soft">
            Cancel the preparation of {cycleLabel(cycle)}? It moves to past cycles as cancelled; the water and treatments logged stay with it.
          </span>
          <div className="flex justify-end gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => setCancelConfirm(false)} disabled={busy}>
              Keep preparing
            </Button>
            <Button variant="danger-solid" size="sm" onClick={() => run(() => api.updateCycle(cycle.id, { status: "cancelled" }))} disabled={busy}>
              Cancel preparation
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
