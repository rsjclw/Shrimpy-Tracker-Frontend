"use client";

import { useMemo, useState } from "react";

import { Banner } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { api, type Cycle, type DayView, type FeedAdditive, type FeedType, type Feeding, type FeedingAdditiveIn, type FeedingFeedType, type Pond } from "@/lib/api";
import { docFor, hhmm, nowHHMM } from "@/lib/dates";
import { fmtNum, num } from "@/lib/num";
import {
  additiveLabel,
  feedStatuses,
  feedTypeLabel,
  isSlowTray,
  ratiosFromFeedings,
  sessionTimesFor,
  sortFeedings,
  type DayKind,
  type FeedStatus,
} from "./model";
import { FeedEditor, type FeedRow, blankRow, rowFromFeeding } from "./FeedEditor";

const DOT: Record<FeedStatus, string> = {
  done: "bg-good",
  next: "bg-accent",
  missed: "bg-warn",
  notlogged: "bg-tx-ghost",
  upcoming: "bg-tx-off",
  planned: "bg-tx-off",
};

export type FeedPerms = { canAdd: boolean; canManage: boolean };

export function FeedSchedule({
  cycle,
  pond,
  saveContext,
  day,
  history,
  kind,
  feedTypes,
  additives,
  perms,
  onSaved,
}: {
  cycle: Cycle;
  pond: Pond;
  /** "Farm · Pond · DOC n" shown while editing, so nobody saves to the wrong place. */
  saveContext: string;
  day: DayView;
  /** Older days, newest first (not including `day`). */
  history: DayView[];
  kind: DayKind;
  feedTypes: FeedType[];
  additives: FeedAdditive[];
  perms: FeedPerms;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<{ rows: FeedRow[]; mode: "plain" | "fi" | "predict" } | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Dose each additive is on in this cycle as of the viewed day: pre-fills the editor's g/kg boxes.
  const [doses, setDoses] = useState<Record<number, string>>({});

  const feedings = sortFeedings(day.feedings);
  const statuses = feedStatuses(day.feedings, kind, nowHHMM());
  const total = feedings.reduce((t, f) => t + num(f.amount_kg), 0);
  const fi = num(day.metrics.feeding_index);

  const prevFeedDay = history.find((d) => d.feedings.length > 0) ?? null;
  const relLabel = (d: DayView) => (docFor(d.date, day.date) === 2 ? "yesterday" : `DOC ${d.metrics.doc}`);

  const defaultTypes: FeedingFeedType[] = useMemo(() => {
    if (day.default_feed_types.length) return day.default_feed_types;
    const last = prevFeedDay ? sortFeedings(prevFeedDay.feedings).at(-1) : null;
    return last?.feed_types ?? [];
  }, [day.default_feed_types, prevFeedDay]);

  function begin(rows: FeedRow[], mode: "plain" | "fi" | "predict" = "plain") {
    setError(null);
    setEditing({ rows, mode });
    api
      .getAdditiveDoses(cycle.id, day.date)
      .then((list) => setDoses(Object.fromEntries(list.filter((d) => d.dosage_gr_per_kg !== null).map((d) => [d.additive_id, d.dosage_gr_per_kg as string]))))
      .catch(() => setDoses({}));
  }

  const existingRows = () => feedings.map((f) => rowFromFeeding(f, !perms.canManage));

  function copiedRows(): FeedRow[] {
    if (!prevFeedDay) return [];
    return sortFeedings(prevFeedDay.feedings).map((f) => ({
      ...rowFromFeeding(f, false),
      id: undefined,
      original: undefined,
      minutes: "",
      key: crypto.randomUUID(),
    }));
  }

  async function ensureLogId(): Promise<string> {
    if (day.daily_log_id) return day.daily_log_id;
    const created = await api.upsertCycleDay(cycle.id, day.date, {});
    if (!created.daily_log_id) throw new Error("Could not open a log for this day.");
    return created.daily_log_id;
  }

  async function save(rows: FeedRow[]) {
    setSaving(true);
    setError(null);
    try {
      const keep = rows.filter((r) => r.locked || [r.time, r.kg, r.minutes].some((v) => v.trim() !== ""));
      for (const r of keep) {
        if (r.locked) continue;
        if (!/^\d{2}:\d{2}$/.test(r.time)) throw new Error(`Feed at "${r.time || "?"}": enter a 24-hour time like 06:00.`);
        if (!(num(r.kg) > 0)) throw new Error(`Feed at ${r.time}: enter the amount in kg.`);
      }
      const logId = await ensureLogId();
      const keptIds = new Set(keep.map((r) => r.id).filter(Boolean));
      for (const f of feedings) {
        if (!keptIds.has(f.id)) await api.deleteFeeding(f.id);
      }
      for (const r of keep) {
        if (r.locked) continue;
        const payload = {
          feed_time: r.time,
          amount_kg: Math.round(num(r.kg) * 10) / 10,
          duration_min: r.minutes.trim() ? Math.round(num(r.minutes)) : undefined,
          feed_types: feedTypesFor(r, feedTypes),
          additives: additivesFor(r),
        };
        if (r.id && r.original) {
          if (changed(r.original, payload)) {
            await api.updateFeeding(r.id, {
              ...payload,
              amount_kg: String(payload.amount_kg),
              duration_min: payload.duration_min ?? null,
            });
          }
        } else {
          await api.createFeeding(logId, payload);
        }
      }
      setEditing(null);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saving the feed schedule failed.");
    } finally {
      setSaving(false);
    }
  }

  const ratiosDefault = (prevFeedDay && ratiosFromFeedings(prevFeedDay.feedings)) || ["25", "30", "30", "15"];
  const prevFi = history.find((d) => d.feedings.length > 0 && Number.isFinite(num(d.metrics.feeding_index))) ?? null;
  const maxFi = num(cycle.maximum_feeding_index ?? cycle.prediction_config?.growth.maximum_feeding_index ?? null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <div className="eyebrow">Feed schedule</div>
          <div className="font-mono text-[11px] text-tx-muted">
            {total ? `${fmtNum(total, 1)} kg/day${Number.isFinite(fi) ? ` · FI ${fi.toFixed(3)}` : ""}` : ""}
          </div>
        </div>
        {/* Operators may only add to today's or a future schedule; past days are maintainer-only. */}
        {!editing && (perms.canManage || (perms.canAdd && kind !== "past")) && feedings.length > 0 ? (
          <button type="button" onClick={() => begin(existingRows())} aria-label="Edit feed schedule" className="flex items-center gap-1 rounded-md bg-ink-850 px-2 py-1 text-accent">
            <Icon name="pencil" size={12} />
            <span className="text-[11px] font-semibold">Edit</span>
          </button>
        ) : null}
      </div>

      {error ? <Banner onDismiss={() => setError(null)}>{error}</Banner> : null}

      {!editing ? (
        <div className="flex flex-col gap-1.5">
          {feedings.map((f, i) => (
            <FeedRowView key={f.id} feeding={f} status={statuses[i]} open={openRow === f.id} onToggle={() => setOpenRow(openRow === f.id ? null : f.id)} />
          ))}
          {feedings.length === 0 ? (
            <div className="flex flex-col gap-2.5 rounded-[10px] bg-ink-850 p-3">
              <div className="text-xs text-tx-muted">
                {kind === "past" ? "No feeds logged on this day." : kind === "future" ? "Nothing planned for this day yet." : "No feed schedule for today yet."}
              </div>
              {perms.canAdd ? (
                <div className="grid grid-cols-3 gap-1.5">
                  <QuickButton disabled={!prevFeedDay} onClick={() => begin(copiedRows())}>
                    {prevFeedDay ? `Copy ${relLabel(prevFeedDay)}` : "Nothing to copy"}
                  </QuickButton>
                  <QuickButton onClick={() => begin([], "fi")}>Feeding index</QuickButton>
                  <QuickButton onClick={() => begin([blankRow(hhmm(pond.default_feed_time) || "06:00", defaultTypes)])}>Add manually</QuickButton>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <FeedEditor
          cycle={cycle}
          day={day}
          kind={kind}
          saveContext={saveContext}
          initialRows={editing.rows}
          initialMode={editing.mode}
          feedTypes={feedTypes}
          additives={additives}
          defaultTypes={defaultTypes}
          sessionTimes={sessionTimesFor(pond.default_feed_time)}
          copySource={prevFeedDay ? { label: `Copy ${relLabel(prevFeedDay)}`, rows: copiedRows } : null}
          prevFi={prevFi ? { label: `${relLabel(prevFi)} ${num(prevFi.metrics.feeding_index).toFixed(3)}`, value: num(prevFi.metrics.feeding_index).toFixed(3) } : null}
          defaultRatios={ratiosDefault}
          maxFi={Number.isFinite(maxFi) ? maxFi : null}
          doses={doses}
          canManage={perms.canManage}
          saving={saving}
          onCancel={() => {
            setEditing(null);
            setError(null);
          }}
          onSave={save}
          onPredicted={() => {
            setEditing(null);
            onSaved();
          }}
        />
      )}
    </div>
  );
}

function QuickButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-line bg-ink-800 px-1.5 py-2.5 text-center text-xs font-semibold text-tx disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function FeedRowView({ feeding: f, status, open, onToggle }: { feeding: Feeding; status: FeedStatus; open: boolean; onToggle: () => void }) {
  const done = status === "done";
  const slow = isSlowTray(f);
  const tag = status === "next" ? "NEXT" : status === "missed" ? "MISSED" : status === "notlogged" ? "NOT LOGGED" : "";
  const detail = [feedTypeLabel(f.feed_types), additiveLabel(f.additives)].filter(Boolean).join(" · ");
  return (
    <div className={`rounded-[10px] border ${status === "next" ? "border-accent/35 bg-accent/[0.08]" : "border-ink-850 bg-ink-850"}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-2.5 px-[11px] py-[9px] text-left">
        <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${DOT[status]}`} />
        <div className="flex min-w-0 flex-grow flex-col gap-[3px]">
          <div className="flex items-baseline gap-2">
            <span className={`w-11 shrink-0 font-mono text-sm font-semibold ${status === "next" ? "text-accent" : status === "upcoming" || status === "planned" ? "text-tx-muted" : "text-tx-strong"}`}>
              {hhmm(f.feed_time)}
            </span>
            <span className={`flex-grow text-[9px] font-bold tracking-[0.08em] ${status === "next" ? "text-accent" : status === "missed" ? "text-warn" : "text-tx-faint"}`}>{tag}</span>
            <span className="text-right font-mono text-[13px] font-semibold text-tx">{fmtNum(f.amount_kg, 1)} kg</span>
            <span className={`w-[58px] shrink-0 text-right font-mono text-xs ${slow ? "text-warn" : done ? "text-tx" : "text-tx-faint"}`}>
              {done ? `${f.duration_min} min` : "— min"}
            </span>
          </div>
          <div className={`pl-[52px] text-[11px] text-tx-muted ${open ? "" : "truncate"}`}>{detail || "—"}</div>
        </div>
      </button>
      {open && (f.notes || f.updated_by) ? (
        <div className="flex flex-col gap-1 px-[11px] pb-2.5 pl-[70px] text-[11px] leading-snug">
          {f.notes ? <p className="whitespace-pre-line text-tx-soft">{f.notes}</p> : null}
          {f.updated_by ? <p className="text-tx-faint">Last updated by {f.updated_by}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

// ---- payload helpers ----

export function feedTypesFor(r: FeedRow, catalog: FeedType[]): FeedingFeedType[] {
  if (r.feedTypeId === "__keep") return r.original?.feed_types ?? [];
  const t = catalog.find((x) => x.id === r.feedTypeId);
  if (!t) return [];
  return [{ feed_type_id: t.id, brand: t.brand, type: t.type, price_per_kg: t.price_per_kg, percentage: "100", notes: t.notes }];
}

export function additivesFor(r: FeedRow): FeedingAdditiveIn[] {
  if (r.additive === "__keep") {
    return (r.original?.additives ?? []).map((a) =>
      a.additive_id !== null ? { additive_id: a.additive_id, dosage_gr_per_kg: num(a.dosage_gr_per_kg) } : { name: a.name, dosage_gr_per_kg: num(a.dosage_gr_per_kg) },
    );
  }
  if (!r.additive) return [];
  const dose = num(r.dose);
  // A blank dose is left out so the server applies the cycle's last dose (or the farm default).
  return [{ additive_id: Number(r.additive), ...(Number.isFinite(dose) ? { dosage_gr_per_kg: dose } : {}) }];
}

function changed(
  f: Feeding,
  p: { feed_time: string; amount_kg: number; duration_min?: number; feed_types: FeedingFeedType[]; additives: FeedingAdditiveIn[] },
) {
  const types = (x: FeedingFeedType[]) => x.map((t) => `${t.feed_type_id}:${num(t.percentage)}`).sort().join("|");
  const before = f.additives.map((a) => `${a.additive_id ?? a.name}:${num(a.dosage_gr_per_kg)}`).sort().join("|");
  const after = p.additives.map((a) => `${a.additive_id ?? a.name}:${a.dosage_gr_per_kg ?? "auto"}`).sort().join("|");
  return (
    hhmm(f.feed_time) !== p.feed_time ||
    Math.abs(num(f.amount_kg) - p.amount_kg) > 0.001 ||
    (f.duration_min ?? undefined) !== p.duration_min ||
    types(f.feed_types) !== types(p.feed_types) ||
    before !== after
  );
}
