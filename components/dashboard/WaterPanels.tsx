"use client";

import { useState } from "react";

import { Banner } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { api, type DayView, type WaterParameterSourceKey, type WaterParametersUpsert } from "@/lib/api";
import { daysBetween, docFor, isoForDoc, mediumDate } from "@/lib/dates";
import { decimalInput, fmtInt, fmtNum, num } from "@/lib/num";
import { outOfRange, shareTooHigh } from "@/lib/thresholds";
import { Age } from "./GrowthStats";
import { DetailPanel } from "./DetailPanel";
import {
  BACTERIA_FIELDS,
  PLANKTON_DEFS,
  VIBRIO_DEFS,
  WATER_FIELDS,
  WATER_TILES,
  latestReading,
  latestSampleDay,
  sumKeys,
} from "./model";

type Ctx = {
  cycleId: string;
  startDate: string;
  /** Viewed day first, then older days. */
  days: DayView[];
  canEdit: boolean;
  saveContext: string;
  trendsHref: (metrics: string) => string;
  ensureLogId: () => Promise<string>;
  onSaved: () => void;
};

const AM = "#2DD4BF";
const PM = "#C084FC";

function SectionHead({
  title,
  age,
  editing,
  canEdit,
  onEdit,
  onClear,
  onCancel,
  onSave,
  saving,
}: {
  title: string;
  age?: number | null;
  editing: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onClear: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="eyebrow">{title}</div>
        {age ? <Age days={age} /> : null}
      </div>
      {!editing && canEdit ? (
        <button type="button" onClick={onEdit} aria-label={`Edit ${title}`} className="flex items-center gap-1 rounded-md bg-ink-850 px-2 py-1 text-accent">
          <Icon name="pencil" size={12} />
          <span className="text-[11px] font-semibold">Edit</span>
        </button>
      ) : null}
      {editing ? (
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onClear} className="rounded-md bg-ink-850 px-2.5 py-1 text-[11px] font-semibold text-bad">
            Clear all
          </button>
          <button type="button" onClick={onCancel} className="rounded-md bg-ink-850 px-2.5 py-1 text-[11px] font-semibold text-tx-muted">
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={saving} className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-ink disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Edit/draft/save plumbing shared by the three sections. */
function useSectionEdit(ctx: Ctx, keys: WaterParameterSourceKey[]) {
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = ctx.days[0];

  function start() {
    const d: Record<string, string> = {};
    keys.forEach((k) => {
      const v = today?.water?.[k];
      d[k] = v === null || v === undefined ? "" : String(Number(v));
    });
    setError(null);
    setDraft(d);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const payload: WaterParametersUpsert = {};
      keys.forEach((k) => {
        const n = num(draft[k]);
        payload[k] = Number.isFinite(n) ? n : null;
      });
      const logId = await ctx.ensureLogId();
      await api.upsertWater(logId, payload);
      setDraft(null);
      ctx.onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saving failed.");
    } finally {
      setSaving(false);
    }
  }

  return {
    draft,
    saving,
    error,
    setError,
    start,
    save,
    cancel: () => setDraft(null),
    clear: () => setDraft(Object.fromEntries(keys.map((k) => [k, ""]))),
    set: (k: string, v: string) => setDraft((d) => (d ? { ...d, [k]: decimalInput(v) } : d)),
  };
}

function EditGrid({ ctx, fields, edit }: { ctx: Ctx; fields: { key: WaterParameterSourceKey; label: string }[]; edit: ReturnType<typeof useSectionEdit> }) {
  return (
    <>
      <div className="px-0.5 font-mono text-[10px] text-tx-muted">Saving to {ctx.saveContext}</div>
      <div className="grid grid-cols-3 gap-2">
        {fields.map((f) => {
          const id = `${ctx.cycleId}-${f.key}`;
          return (
            <div key={f.key} className="flex flex-col gap-1 rounded-[10px] bg-ink-850 px-2.5 py-[9px]">
              <label htmlFor={id} className="truncate text-[10px] uppercase tracking-[0.05em] text-tx-faint">
                {f.label}
              </label>
              <input id={id} inputMode="decimal" value={edit.draft?.[f.key] ?? ""} onChange={(e) => edit.set(f.key, e.target.value)} className="input-xs" />
            </div>
          );
        })}
      </div>
    </>
  );
}

function historyRows(ctx: Ctx, keys: WaterParameterSourceKey[], format: (d: DayView) => string) {
  return ctx.days
    .filter((d) => keys.some((k) => Number.isFinite(num(d.water?.[k]))))
    .slice(0, 6)
    .map((d) => ({ key: d.date, doc: `D${docFor(ctx.startDate, d.date)}`, date: mediumDate(d.date), value: format(d) }));
}

function whenText(ctx: Ctx, iso: string | null) {
  if (!iso) return "No reading in the last two weeks";
  const a = daysBetween(iso, ctx.days[0].date);
  return `Measured ${a === 0 ? "today" : a === 1 ? "1 day ago" : `${a} days ago`} · ${mediumDate(iso)} · DOC ${docFor(ctx.startDate, iso)}`;
}

function chartFor(ctx: Ctx, series: { key: WaterParameterSourceKey | ((d: DayView) => number); color: string }[]) {
  const viewDoc = docFor(ctx.startDate, ctx.days[0].date);
  const built = series.map((s) => ({
    color: s.color,
    points: ctx.days
      .map((d) => ({ x: docFor(ctx.startDate, d.date), y: typeof s.key === "function" ? s.key(d) : num(d.water?.[s.key]) }))
      .filter((p) => Number.isFinite(p.y) && (typeof s.key !== "function" || p.y > 0))
      .reverse(),
  }));
  const xs = built.flatMap((s) => s.points.map((p) => p.x));
  const xMin = xs.length ? Math.min(...xs, viewDoc - 1) : viewDoc - 1;
  return {
    series: built,
    xMin,
    xMax: viewDoc,
    xStart: `D${Math.max(1, xMin)}`,
    xEnd: `D${viewDoc}`,
    xLabel: (x: number) => `DOC ${x} · ${mediumDate(isoForDoc(ctx.startDate, x))}`,
  };
}

// ---------------- Water quality ----------------

export function WaterQuality({ ctx }: { ctx: Ctx }) {
  const edit = useSectionEdit(ctx, WATER_FIELDS.map((f) => f.key));
  const [open, setOpen] = useState<string | null>(null);
  const viewDate = ctx.days[0].date;
  const tile = WATER_TILES.find((t) => t.id === open);

  return (
    <div className="flex flex-col gap-2">
      <SectionHead
        title="Water quality"
        editing={!!edit.draft}
        canEdit={ctx.canEdit}
        onEdit={edit.start}
        onClear={edit.clear}
        onCancel={edit.cancel}
        onSave={edit.save}
        saving={edit.saving}
      />
      {edit.error ? <Banner onDismiss={() => edit.setError(null)}>{edit.error}</Banner> : null}
      {!edit.draft ? (
        <div className="grid grid-cols-3 gap-2">
          {WATER_TILES.map((t) => {
            const readings = t.keys.map((k) => latestReading(ctx.days, k));
            const dates = readings.filter(Boolean).map((r) => r!.date);
            const oldest = dates.length ? dates.sort()[0] : null;
            const age = oldest ? daysBetween(oldest, viewDate) : null;
            const bad = t.keys.some((k, i) => outOfRange(k, readings[i]?.value));
            const value = readings.map((r) => (r ? fmtNum(r.value, 2) : "—")).join(" / ");
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setOpen(open === t.id ? null : t.id)}
                aria-expanded={open === t.id}
                aria-label={`${t.label} details`}
                className={`flex min-w-0 flex-col gap-[3px] rounded-[10px] border bg-ink-850 px-[9px] py-2 text-left ${open === t.id ? "border-accent" : "border-ink-850"}`}
              >
                <div className="truncate text-[10px] uppercase tracking-[0.05em] text-tx-faint">{t.label}</div>
                <div className={`truncate font-mono text-[13px] font-semibold ${bad ? "text-bad" : "text-tx"}`}>
                  {value}
                  {t.unit && readings.some(Boolean) && t.keys.length === 1 ? <span className="ml-1 text-[10px] font-normal text-tx-faint">{t.unit}</span> : null}
                </div>
                <div className="flex min-h-3 items-center">{age ? <Age days={age} /> : null}</div>
              </button>
            );
          })}
        </div>
      ) : (
        <EditGrid ctx={ctx} fields={WATER_FIELDS} edit={edit} />
      )}
      {tile && !edit.draft ? (
        <DetailPanel
          title={tile.label}
          lines={tile.keys.map((k, i) => {
            const r = latestReading(ctx.days, k);
            return {
              label: tile.keys.length === 2 ? (i === 0 ? "AM" : "PM") : "",
              value: r ? `${fmtNum(r.value, 2)}${tile.unit ? ` ${tile.unit}` : ""}` : "—",
              when: whenText(ctx, r?.date ?? null),
              color: i === 0 ? AM : PM,
            };
          })}
          chart={chartFor(ctx, tile.keys.map((k, i) => ({ key: k, color: i === 0 ? AM : PM })))}
          legend={tile.keys.length === 2 ? [{ label: "AM", color: AM }, { label: "PM", color: PM }] : undefined}
          rows={historyRows(ctx, tile.keys, (d) => tile.keys.map((k) => (Number.isFinite(num(d.water?.[k])) ? fmtNum(d.water?.[k], 2) : "—")).join(" / "))}
          fullChartHref={ctx.trendsHref(tile.keys.join(","))}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

// ---------------- Plankton ----------------

const PLANKTON_KEYS = PLANKTON_DEFS.map((d) => d.key);

export function Plankton({ ctx }: { ctx: Ctx }) {
  const edit = useSectionEdit(ctx, PLANKTON_KEYS);
  const [open, setOpen] = useState(false);
  const sample = latestSampleDay(ctx.days, PLANKTON_KEYS);
  const age = sample ? daysBetween(sample.date, ctx.days[0].date) : null;
  const total = sumKeys(sample, PLANKTON_KEYS);
  const present = PLANKTON_DEFS.filter((d) => Number.isFinite(num(sample?.water?.[d.key])) || ["plankton_ga", "plankton_bga", "plankton_dino", "plankton_diatom", "plankton_protozoa", "plankton_zoo"].includes(d.key));

  return (
    <div className="flex flex-col gap-2">
      <SectionHead
        title="Plankton · cells/mL"
        age={age}
        editing={!!edit.draft}
        canEdit={ctx.canEdit}
        onEdit={edit.start}
        onClear={edit.clear}
        onCancel={edit.cancel}
        onSave={edit.save}
        saving={edit.saving}
      />
      {edit.error ? <Banner onDismiss={() => edit.setError(null)}>{edit.error}</Banner> : null}
      {!edit.draft ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Plankton sample details"
          className={`flex w-full flex-col gap-2.5 rounded-[10px] border bg-ink-850 px-3 py-[11px] text-left ${open ? "border-accent" : "border-ink-850"}`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.05em] text-tx-faint">Total plankton</span>
            <span className={`font-mono text-[15px] font-semibold ${outOfRange("total_plankton", total || NaN) ? "text-bad" : "text-tx-strong"}`}>{total ? fmtInt(total) : "—"}</span>
          </div>
          <SegmentBar day={sample} defs={present} total={total} />
          <div className="grid grid-cols-2 gap-x-3.5 gap-y-1.5">
            {present.map((d) => {
              const v = num(sample?.water?.[d.key]);
              const over = shareTooHigh(d.key, v, total);
              return (
                <div key={d.key} className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: d.color }} />
                  <span className="min-w-0 flex-grow truncate text-[11px] text-tx-muted">{d.label}</span>
                  <span className={`font-mono text-[11px] font-semibold ${over ? "text-bad" : "text-tx"}`}>{Number.isFinite(v) ? fmtInt(v) : "—"}</span>
                  <span className={`w-7 text-right font-mono text-[10px] ${over ? "text-bad" : "text-tx-faint"}`}>{total && Number.isFinite(v) ? `${Math.round((v / total) * 100)}%` : "—"}</span>
                </div>
              );
            })}
          </div>
        </button>
      ) : (
        <EditGrid ctx={ctx} fields={PLANKTON_DEFS.map((d) => ({ key: d.key, label: d.label }))} edit={edit} />
      )}
      {open && !edit.draft ? (
        <DetailPanel
          title="Plankton sample"
          lines={[{ value: "", when: whenText(ctx, sample?.date ?? null) }]}
          chart={chartFor(ctx, [{ key: (d) => sumKeys(d, PLANKTON_KEYS), color: "#4ADE80" }])}
          legend={[{ label: "Total plankton", color: "#4ADE80" }]}
          rows={historyRows(ctx, PLANKTON_KEYS, (d) => {
            const t = sumKeys(d, PLANKTON_KEYS);
            const pc = (k: WaterParameterSourceKey) => (t ? `${Math.round(((num(d.water?.[k]) || 0) / t) * 100)}%` : "—");
            return `${fmtInt(t)} · GA ${pc("plankton_ga")} · BGA ${pc("plankton_bga")}`;
          })}
          fullChartHref={ctx.trendsHref("total_plankton,plankton_ga,plankton_bga")}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

// ---------------- Bacteria & vibrio ----------------

const BACTERIA_KEYS = BACTERIA_FIELDS.map((f) => f.key);
const VIBRIO_KEYS = VIBRIO_DEFS.map((d) => d.key);

export function Bacteria({ ctx }: { ctx: Ctx }) {
  const edit = useSectionEdit(ctx, BACTERIA_KEYS);
  const [open, setOpen] = useState(false);
  const sample = latestSampleDay(ctx.days, BACTERIA_KEYS);
  const age = sample ? daysBetween(sample.date, ctx.days[0].date) : null;
  const vTotal = sumKeys(sample, VIBRIO_KEYS);
  const tbc = num(sample?.water?.tbc);
  const pct = Number.isFinite(tbc) && tbc > 0 ? (vTotal / tbc) * 100 : Number.NaN;
  const high = outOfRange("vibrio_percentage", pct);

  return (
    <div className="flex flex-col gap-2">
      <SectionHead
        title="Bacteria & vibrio · cfu/mL"
        age={age}
        editing={!!edit.draft}
        canEdit={ctx.canEdit}
        onEdit={edit.start}
        onClear={edit.clear}
        onCancel={edit.cancel}
        onSave={edit.save}
        saving={edit.saving}
      />
      {edit.error ? <Banner onDismiss={() => edit.setError(null)}>{edit.error}</Banner> : null}
      {!edit.draft ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Bacteria sample details"
          className={`flex w-full flex-col gap-2.5 rounded-[10px] border bg-ink-850 px-3 py-[11px] text-left ${open ? "border-accent" : "border-ink-850"}`}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-[0.05em] text-tx-faint">TBC</span>
              <span className="font-mono text-[15px] font-semibold text-tx-strong">{Number.isFinite(tbc) ? fmtInt(tbc) : "—"}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-[0.05em] text-tx-faint">Total vibrio</span>
              <div className="flex items-baseline gap-[5px]">
                <span className={`font-mono text-[15px] font-semibold ${high ? "text-bad" : "text-tx-strong"}`}>{sample ? fmtInt(vTotal) : "—"}</span>
                <span className={`font-mono text-[11px] ${high ? "text-bad" : "text-tx-faint"}`}>{Number.isFinite(pct) ? `${fmtNum(pct, 1)}% of TBC` : ""}</span>
              </div>
            </div>
          </div>
          <SegmentBar day={sample} defs={VIBRIO_DEFS} total={vTotal} />
          <div className="grid grid-cols-3 gap-x-2.5 gap-y-1.5">
            {VIBRIO_DEFS.map((d) => {
              const v = num(sample?.water?.[d.key]);
              return (
                <div key={d.key} className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-[5px]">
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: d.color }} />
                    <span className="text-[11px] text-tx-muted">{d.label}</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className={`font-mono text-xs font-semibold ${outOfRange(d.key, v) ? "text-bad" : "text-tx"}`}>{Number.isFinite(v) ? fmtInt(v) : "—"}</span>
                    <span className="font-mono text-[10px] text-tx-faint">{vTotal && Number.isFinite(v) ? `${Math.round((v / vTotal) * 100)}%` : "—"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </button>
      ) : (
        <EditGrid ctx={ctx} fields={BACTERIA_FIELDS} edit={edit} />
      )}
      {open && !edit.draft ? (
        <DetailPanel
          title="Bacteria & vibrio sample"
          lines={[{ value: "", when: whenText(ctx, sample?.date ?? null) }]}
          chart={chartFor(ctx, [{ key: (d) => sumKeys(d, VIBRIO_KEYS), color: "#FACC15" }])}
          legend={[{ label: "Total vibrio", color: "#FACC15" }]}
          rows={historyRows(ctx, BACTERIA_KEYS, (d) => {
            const vt = sumKeys(d, VIBRIO_KEYS);
            const t = num(d.water?.tbc);
            return `Vibrio ${fmtInt(vt)} · ${Number.isFinite(t) && t > 0 ? `${Math.round((vt / t) * 100)}% of TBC` : "—"}`;
          })}
          fullChartHref={ctx.trendsHref("total_vibrio_count,vibrio_percentage,tbc")}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function SegmentBar({ day, defs, total }: { day: DayView | null; defs: { key: WaterParameterSourceKey; color: string }[]; total: number }) {
  return (
    <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-[5px] bg-ink-800">
      {total
        ? defs.map((d) => {
            const v = num(day?.water?.[d.key]);
            if (!Number.isFinite(v) || v <= 0) return null;
            return <div key={d.key} className="h-full" style={{ width: `${((v / total) * 100).toFixed(2)}%`, background: d.color }} />;
          })
        : null}
    </div>
  );
}

export type WaterCtx = Ctx;
