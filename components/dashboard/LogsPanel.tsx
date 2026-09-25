"use client";

import { useEffect, useState } from "react";

import { Banner, ConfirmStrip } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { api, type DayView, type Harvest, type Product, type Treatment, type WarehouseInventory } from "@/lib/api";
import { load, peek, put } from "@/lib/cache";
import { daysBetween, docFor, fmt24, hhmm, nowHHMM, valid24 } from "@/lib/dates";
import { decimalInput, fmtDec, fmtInt, intInput, num, rupiah, signed } from "@/lib/num";
import { expandLines, factorToBase, stockByProduct, unitsFor } from "@/lib/products";
import type { LogKind } from "./GrowthStats";
import type { Growth } from "./usePondData";

type Perms = { canAdd: boolean; canManage: boolean };

export type LogsCtx = {
  cycleId: string;
  startDate: string;
  day: DayView;
  growth: Growth | null;
  perms: Perms;
  gridId: string;
  saveContext: string;
  userEmail: string;
  /** The farm's product catalog, so a treatment can take stock out directly. */
  products: Product[];
  ensureLogId: () => Promise<string>;
  onSaved: () => void;
};

const KIND = {
  sampling: { label: "Sampling", text: "text-accent", border: "border-accent/50" },
  harvest: { label: "Harvest", text: "text-warn", border: "border-warn/50" },
  population: { label: "Population", text: "text-violet", border: "border-violet/50" },
};

type Form = { kind: LogKind; editId?: string; fields: Record<string, string> };

export function canLogKind(perms: Perms, kind: LogKind) {
  // The backend lets operators add harvests and population counts; the ABW sample lives on the day log, which needs a maintainer.
  return kind === "sampling" ? perms.canManage : perms.canAdd;
}

/** Sampling & harvest log for the viewed day. `requested` opens a form from a quick-stat "+" action. */
export function SamplingHarvestLog({ ctx, requested, onRequestHandled }: { ctx: LogsCtx; requested: LogKind | null; onRequestHandled: () => void }) {
  const { day, growth, perms } = ctx;
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Row id waiting for a delete confirmation, and whether a population save is waiting for one.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);

  useEffect(() => {
    if (!requested) return;
    // Opened from a quick-stat "+" action: expand and start that form once.
    setOpen(true);
    startForm(requested);
    onRequestHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  const doc = (iso: string) => docFor(ctx.startDate, iso);
  const samplings = (growth?.samplings ?? []).filter((s) => s.date <= day.date);
  const lastSampling = samplings.at(-1) ?? null;
  const prevSampling = samplings.filter((s) => s.date < day.date).at(-1) ?? null;
  const popSeries = growth?.population ?? [];
  const popIdx = popSeries.findIndex((p) => p.date === day.date);
  const popBefore = popIdx > 0 ? popSeries[popIdx - 1].value : null;
  const popToday = popIdx >= 0 ? popSeries[popIdx].value : null;
  const harvestedSoFar = (growth?.harvests ?? []).filter((h) => h.date <= day.date).reduce((t, h) => t + h.kg, 0);

  type Row = { id: string; kind: LogKind; time: string; summary: string; details: [string, string][]; harvest?: Harvest };
  const rows: Row[] = [];
  if (day.abw_g !== null) {
    const s = day.sampling;
    rows.push({
      id: "sampling",
      kind: "sampling",
      time: hhmm(day.abw_sample_time) || "—",
      summary: `ABW ${fmtDec(day.abw_g, 1)} g${s.adg_g_per_day ? ` · ADG ${fmtDec(s.adg_g_per_day, 2)}` : ""}`,
      details: [
        ["Since last sampling", prevSampling ? `${daysBetween(prevSampling.date, day.date)} days (DOC ${doc(prevSampling.date)})` : "First sampling"],
        ["ABW change", s.abw_gain_g ? `${signed(num(s.abw_gain_g), 2)} g` : "—"],
        ["ADG", s.adg_g_per_day ? `${fmtDec(s.adg_g_per_day, 2)} g/day` : "—"],
        ["FCR", s.sample_fcr ? fmtDec(s.sample_fcr, 2) : "—"],
        ["Feed since last", s.feed_since_previous_sample_kg ? `${fmtInt(s.feed_since_previous_sample_kg)} kg` : "—"],
        ["Biomass", day.metrics.estimated_biomass_kg ? `${fmtInt(day.metrics.estimated_biomass_kg)} kg` : "—"],
      ],
    });
  }
  day.harvests.forEach((h) => {
    const kg = num(h.biomass_kg);
    const abw = num(h.sampled_abw_g);
    rows.push({
      id: h.id,
      kind: "harvest",
      harvest: h,
      time: hhmm(h.harvest_time) || "—",
      summary: `${fmtInt(kg)} kg · ABW ${fmtDec(abw, 1)} g`,
      details: [
        ["Revenue", rupiah(h.total_price)],
        ["Avg price", kg > 0 ? `${rupiah(num(h.total_price) / kg)} /kg` : "—"],
        ["Size", abw > 0 ? `${Math.round(1000 / abw)} pcs/kg` : "—"],
        ["Pieces (est.)", `≈ ${fmtInt(h.estimated_count)}`],
        ["Population after", day.metrics.estimated_population !== null ? fmtInt(day.metrics.estimated_population) : "—"],
        ["Harvested so far", `${fmtInt(harvestedSoFar)} kg`],
      ],
    });
  });
  if (popToday !== null && popBefore !== null && popToday !== popBefore && day.harvests.length === 0) {
    rows.push({
      id: "population",
      kind: "population",
      time: "—",
      summary: `${fmtInt(popToday)} (${signed(popToday - popBefore)})`,
      details: [
        ["Previous estimate", fmtInt(popBefore)],
        ["Change", `${signed(popToday - popBefore)} (${signed(((popToday - popBefore) / popBefore) * 100, 1)}%)`],
      ],
    });
  }

  function startForm(kind: LogKind, editRow?: Row) {
    setError(null);
    const f: Record<string, string> = { time: nowHHMM() };
    if (kind === "sampling") {
      f.time = hhmm(day.abw_sample_time) || nowHHMM();
      f.abw = day.abw_g !== null ? String(num(day.abw_g)) : "";
    } else if (kind === "harvest") {
      const h = editRow?.harvest;
      Object.assign(f, h ? { time: hhmm(h.harvest_time), kg: String(num(h.biomass_kg)), abw: String(num(h.sampled_abw_g)), revenue: String(num(h.total_price)) } : { kg: "", abw: lastSampling ? String(lastSampling.abw) : "", revenue: "" });
    } else {
      f.pop = popToday !== null && editRow ? String(popToday) : "";
    }
    setConfirmSave(false);
    setForm({ kind, editId: editRow?.id, fields: f });
  }

  const setField = (k: string, v: string) => {
    setConfirmSave(false);
    setForm((fm) => (fm ? { ...fm, fields: { ...fm.fields, [k]: v } } : fm));
  };
  const valid = (fm: Form | null) => {
    if (!fm) return false;
    const f = fm.fields;
    if (fm.kind !== "population" && !valid24(f.time)) return false;
    if (fm.kind === "sampling") return num(f.abw) > 0;
    if (fm.kind === "harvest") return num(f.kg) > 0 && num(f.abw) > 0 && num(f.revenue) >= 0;
    return num(f.pop) > 0;
  };

  async function save() {
    if (!form || !valid(form)) return;
    setBusy(true);
    setError(null);
    const f = form.fields;
    try {
      if (form.kind === "sampling") {
        await api.upsertCycleDay(ctx.cycleId, day.date, { abw_g: num(f.abw), abw_sample_time: f.time });
      } else if (form.kind === "harvest") {
        const body = { harvest_time: f.time, biomass_kg: num(f.kg), sampled_abw_g: num(f.abw), total_price: num(f.revenue) || 0 };
        if (form.editId) await api.updateHarvest(form.editId, body);
        else await api.createHarvest(await ctx.ensureLogId(), body);
      } else {
        await api.createSample(ctx.cycleId, { date: day.date, population: Math.round(num(f.pop)) });
      }
      setForm(null);
      setConfirmSave(false);
      ctx.onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saving failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: Row) {
    setBusy(true);
    setError(null);
    try {
      if (r.kind === "sampling") await api.upsertCycleDay(ctx.cycleId, day.date, { abw_g: null, abw_sample_time: null });
      else if (r.kind === "harvest") await api.deleteHarvest(r.id);
      setRow(null);
      setConfirmDelete(null);
      ctx.onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deleting failed.");
    } finally {
      setBusy(false);
    }
  }

  // Live preview of what the entry will mean, like the mockup.
  const preview: string[] = [];
  if (form && valid(form)) {
    const f = form.fields;
    if (form.kind === "sampling") {
      if (prevSampling) {
        const d = daysBetween(prevSampling.date, day.date);
        const gain = num(f.abw) - prevSampling.abw;
        preview.push(`${signed(gain, 1)} g in ${d} days → ADG ${(gain / d).toFixed(2)} g/day`);
      } else preview.push("First sampling of the cycle");
    } else if (form.kind === "harvest") {
      const pieces = (num(f.kg) * 1000) / num(f.abw);
      preview.push(`Size ${Math.round(1000 / num(f.abw))} pcs/kg · ≈ ${fmtInt(pieces)} pcs`);
      if (num(f.revenue) > 0) preview.push(`Avg price ${rupiah(num(f.revenue) / num(f.kg))} /kg`);
      const before = popBefore ?? popToday;
      if (before) preview.push(`Population ${fmtInt(before)} → ${fmtInt(Math.max(0, before - pieces))}`);
    } else {
      const before = popBefore ?? popToday;
      const n = num(f.pop);
      preview.push(before ? `${fmtInt(before)} → ${fmtInt(n)} (${signed(n - before)}, ${signed(((n - before) / before) * 100, 1)}%)` : "First population estimate");
    }
  }

  const summary = [
    lastSampling ? `sampling ${daysBetween(lastSampling.date, day.date) === 0 ? "today" : `${daysBetween(lastSampling.date, day.date)}d ago`}` : "no sampling yet",
    harvestedSoFar ? `${fmtInt(harvestedSoFar)} kg harvested` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const addable = (["sampling", "harvest", "population"] as LogKind[]).filter((k) => canLogKind(perms, k));

  return (
    <div className="flex flex-col gap-2">
      <LogHeader
        icon="scale"
        tone="warn"
        title="Sampling & harvest"
        summary={summary}
        count={rows.length}
        open={open}
        onToggle={() => setOpen((o) => !o)}
      />
      {open ? (
        <div className="flex flex-col gap-1.5">
          {error ? <Banner onDismiss={() => setError(null)}>{error}</Banner> : null}
          {rows.map((r) => {
            const isOpen = row === r.id;
            const k = KIND[r.kind];
            const editable = perms.canManage;
            return (
              <div key={r.id} className={`rounded-[10px] border bg-ink-850 ${isOpen ? k.border : "border-ink-850"}`}>
                <button type="button" onClick={() => setRow(isOpen ? null : r.id)} aria-expanded={isOpen} aria-label={`${k.label} details`} className="flex w-full items-center gap-2 px-[11px] py-[9px] text-left">
                  <span className={`shrink-0 rounded-full border border-current px-[7px] py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] ${k.text}`}>{k.label}</span>
                  <span className="shrink-0 font-mono text-xs text-tx-muted">{r.time}</span>
                  <span className="min-w-0 flex-grow truncate text-right font-mono text-xs font-semibold text-tx">{r.summary}</span>
                  <Icon name="chevron" size={14} strokeWidth={2.2} className={`shrink-0 text-tx-faint transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen ? (
                  <div className="flex flex-col gap-2 px-[11px] pb-[11px]">
                    <div className="grid grid-cols-2 gap-1.5">
                      {r.details.map(([dk, dv]) => (
                        <div key={dk} className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-ink-800 px-[9px] py-[7px]">
                          <span className="text-[9px] uppercase tracking-[0.05em] text-tx-faint">{dk}</span>
                          <span className="truncate font-mono text-xs font-semibold text-tx">{dv}</span>
                        </div>
                      ))}
                    </div>
                    {editable && confirmDelete === r.id ? (
                      <ConfirmStrip
                        message={
                          r.kind === "sampling"
                            ? `Delete this sampling (${r.time} · ${r.summary})? ABW, ADG and FCR from this day on will be recalculated.`
                            : `Delete this harvest (${r.time} · ${r.summary})? Population, biomass and FCR from this day on will be recalculated.`
                        }
                        onCancel={() => setConfirmDelete(null)}
                        onConfirm={() => remove(r)}
                        busy={busy}
                      />
                    ) : editable ? (
                      <div className="flex justify-end gap-1.5">
                        {r.kind !== "population" ? (
                          <button type="button" disabled={busy} onClick={() => setConfirmDelete(r.id)} className="rounded-md bg-ink-800 px-2.5 py-[5px] text-[11px] font-semibold text-bad">
                            Delete
                          </button>
                        ) : null}
                        <button type="button" onClick={() => startForm(r.kind, r)} className="rounded-md bg-ink-800 px-2.5 py-[5px] text-[11px] font-semibold text-accent">
                          Edit
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {rows.length === 0 && !form ? <div className="px-0.5 py-1 text-xs text-tx-faint">Nothing logged on this day.</div> : null}

          {form ? (
            <div className="flex flex-col gap-2.5 rounded-xl border border-accent bg-ink-850 p-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-bold text-tx-strong">
                  {form.editId ? "Edit" : "New"} {KIND[form.kind].label.toLowerCase()}
                </span>
                <span className="font-mono text-[10px] text-tx-muted">Saving to {ctx.saveContext}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {form.kind !== "population" ? <FormField cycleId={ctx.cycleId} id="time" label="Time" value={form.fields.time} mode="numeric" placeholder="HH:MM" onChange={(v) => setField("time", fmt24(v))} /> : null}
                {form.kind === "sampling" ? <FormField cycleId={ctx.cycleId} id="abw" label="ABW (g)" value={form.fields.abw} mode="decimal" placeholder="0.0" onChange={(v) => setField("abw", decimalInput(v, 2))} /> : null}
                {form.kind === "harvest" ? (
                  <>
                    <FormField cycleId={ctx.cycleId} id="kg" label="Biomass (kg)" value={form.fields.kg} mode="decimal" placeholder="0" onChange={(v) => setField("kg", decimalInput(v, 1))} />
                    <FormField cycleId={ctx.cycleId} id="abw" label="ABW (g)" value={form.fields.abw} mode="decimal" placeholder="0.0" onChange={(v) => setField("abw", decimalInput(v, 2))} />
                    <FormField cycleId={ctx.cycleId} id="revenue" label="Revenue (Rp)" value={form.fields.revenue} mode="numeric" placeholder="0" onChange={(v) => setField("revenue", intInput(v))} />
                  </>
                ) : null}
                {form.kind === "population" ? <FormField cycleId={ctx.cycleId} id="pop" label="New population" value={form.fields.pop} mode="numeric" placeholder="0" onChange={(v) => setField("pop", intInput(v))} /> : null}
              </div>
              {preview.length ? (
                <div className="flex flex-col gap-[3px]">
                  {preview.map((p) => (
                    <span key={p} className="font-mono text-[11px] text-accent">
                      {p}
                    </span>
                  ))}
                </div>
              ) : null}
              {confirmSave ? (
                <ConfirmStrip
                  message={`Set the population to ${fmtInt(num(form.fields.pop))}? Biomass, feeding index and FCR from this day on will be recalculated.`}
                  confirmLabel={busy ? "Saving…" : "Set population"}
                  onCancel={() => setConfirmSave(false)}
                  onConfirm={save}
                  busy={busy}
                />
              ) : (
                <div className="flex justify-end gap-1.5">
                  <button type="button" onClick={() => setForm(null)} className="rounded-md bg-ink-800 px-3 py-1.5 text-xs font-semibold text-tx-muted">
                    Cancel
                  </button>
                  <button
                    type="button"
                    // A population count rescales every later day, so it asks first.
                    onClick={() => (form.kind === "population" ? setConfirmSave(true) : save())}
                    disabled={!valid(form) || busy}
                    className="rounded-md bg-accent px-3.5 py-1.5 text-xs font-bold text-accent-ink disabled:opacity-40"
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {!form && addable.length ? (
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${addable.length}, minmax(0, 1fr))` }}>
              {addable.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => startForm(k)}
                  className={`rounded-lg border border-dashed border-line-dash px-1 py-[9px] text-center text-xs font-semibold ${k === "sampling" ? "text-accent" : k === "harvest" ? "text-warn" : "text-violet"}`}
                >
                  + {KIND[k].label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FormField({ cycleId, id, label, value, mode, placeholder, onChange }: { cycleId: string; id: string; label: string; value: string; mode: "numeric" | "decimal"; placeholder: string; onChange: (v: string) => void }) {
  const fid = `${cycleId}-log-${id}`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={fid} className="text-[10px] uppercase tracking-[0.05em] text-tx-faint">
        {label}
      </label>
      <input
        id={fid}
        inputMode={mode}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line bg-ink-800 px-2 py-[7px] font-mono text-[13px] font-semibold text-tx-strong outline-none focus:border-accent"
      />
    </div>
  );
}

// ---------------- Treatments ----------------

type TreatLine = { productId: string; amount: string; unit: string };
type TreatForm = {
  editId?: string;
  text: string;
  time: string;
  worker: string;
  warehouseId: string;
  lines: TreatLine[];
};

export function TreatmentsLog({ ctx, kindLabel }: { ctx: LogsCtx; kindLabel: "today" | "on this day" }) {
  const { day, perms, products, gridId } = ctx;
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState<string | null>(null);
  const [form, setForm] = useState<TreatForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseInventory[] | null>(null);

  const list = [...day.treatments].sort((a, b) => a.treatment_time.localeCompare(b.treatment_time));
  const lastWorker = [...list].reverse().find((t) => t.worker)?.worker ?? ctx.userEmail;
  // Anything a worker can apply: stocked products and the mixtures made from them.
  const usable = products.filter((p) => p.active && p.tracked);

  // The grid's warehouses, fetched once the first form opens - the picker needs them.
  useEffect(() => {
    if (!form || warehouses || !usable.length) return;
    const key = `inventory:${gridId}`;
    const hit = peek<WarehouseInventory[]>(key);
    if (hit) setWarehouses(hit.value);
    if (hit?.fresh) return;
    load(key, () => api.getGridInventory(gridId))
      .then(setWarehouses)
      .catch(() => setWarehouses((cur) => cur ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, gridId]);

  /** Stock moved, so the grid inventory this and the inventory page share is stale. */
  async function refreshStock() {
    try {
      const fresh = await api.getGridInventory(gridId);
      put(`inventory:${gridId}`, fresh);
      setWarehouses(fresh);
    } catch {
      // A stale on-hand hint is not worth failing a save that already went through.
    }
  }

  function start(t?: Treatment) {
    setError(null);
    const lines = (t?.items ?? []).map((i) => ({ productId: i.product_id, amount: String(num(i.amount)), unit: i.unit }));
    setForm(
      t
        ? { editId: t.id, text: t.action, time: hhmm(t.treatment_time), worker: t.worker ?? "", warehouseId: t.warehouse_id ?? "", lines }
        : { text: "", time: nowHHMM(), worker: lastWorker, warehouseId: "", lines: [] },
    );
  }

  /** Lines that are filled in enough to send, converted to base units for the preview. */
  const readyLines = (form?.lines ?? []).filter((l) => l.productId && num(l.amount) > 0);
  const warehouse = warehouses?.find((w) => w.id === form?.warehouseId) ?? null;
  // Expand against the whole catalog, not just what is selectable: a recipe may
  // reach an inactive product, and the preview must show what the server will take.
  const preview = expandLines(
    products,
    readyLines.map((l) => {
      const product = usable.find((p) => p.id === l.productId);
      const factor = product ? factorToBase(product, l.unit) : null;
      return { productId: l.productId, baseAmount: num(l.amount) * (factor ?? 0) };
    }),
  );
  const onHand = stockByProduct(warehouse?.items ?? []);
  const short = warehouse ? preview.filter((p) => (onHand.get(p.product.id) ?? 0) < p.amount) : [];

  const canSave =
    !!form &&
    valid24(form.time) &&
    (form.text.trim() !== "" || readyLines.length > 0) &&
    (readyLines.length === 0 || !!form.warehouseId);

  async function save() {
    if (!form || !canSave) return;
    setBusy(true);
    setError(null);
    try {
      const items = readyLines.map((l) => ({ product_id: l.productId, amount: num(l.amount), unit: l.unit || null }));
      const body = {
        treatment_time: form.time,
        // Blank is fine when products are given: the server writes the summary line.
        action: form.text.trim() || undefined,
        worker: form.worker.trim() || undefined,
        warehouse_id: items.length ? form.warehouseId : null,
        items,
      };
      if (form.editId) await api.updateTreatment(form.editId, { ...body, action: body.action ?? "", worker: body.worker ?? null });
      else await api.createTreatment(await ctx.ensureLogId(), body);
      setForm(null);
      if (items.length) await refreshStock();
      ctx.onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saving failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const had = list.find((t) => t.id === id)?.items.length;
      await api.deleteTreatment(id);
      setRow(null);
      // Deleting puts the stock back, so the on-hand figures move too.
      if (had) await refreshStock();
      ctx.onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deleting failed.");
    } finally {
      setBusy(false);
    }
  }

  const summary = list.length
    ? `${list.length} treatment${list.length === 1 ? "" : "s"} ${kindLabel} · last ${hhmm(list.at(-1)!.treatment_time)}`
    : `Nothing logged ${kindLabel}`;

  return (
    <div className="flex flex-col gap-2">
      <LogHeader icon="flask" tone="accent" title="Treatments" summary={summary} count={list.length} open={open} onToggle={() => setOpen((o) => !o)} />
      {open ? (
        <div className="flex flex-col gap-2 px-0.5 pt-1">
          {error ? <Banner onDismiss={() => setError(null)}>{error}</Banner> : null}
          <div className="flex flex-col">
            {list.map((t, i) => {
              const isOpen = row === t.id;
              return (
                <div key={t.id} className="flex items-stretch gap-2.5">
                  <span className="w-10 shrink-0 pt-px font-mono text-xs font-semibold text-tx-muted">{hhmm(t.treatment_time)}</span>
                  <div className="flex w-2.5 shrink-0 flex-col items-center">
                    <span className="mt-1 h-[9px] w-[9px] shrink-0 rounded-full bg-accent shadow-[0_0_0_3px_rgba(45,212,191,0.15)]" />
                    {i < list.length - 1 ? <span className="mt-1 w-0.5 flex-grow bg-line" /> : null}
                  </div>
                  <div className="flex min-w-0 flex-grow flex-col gap-1.5 pb-3.5">
                    <button type="button" onClick={() => setRow(isOpen ? null : t.id)} aria-expanded={isOpen} aria-label="Treatment details" className="flex min-w-0 flex-col gap-[3px] text-left">
                      <span className={`text-[13px] leading-snug text-tx ${isOpen ? "" : "line-clamp-2"}`}>{t.action}</span>
                      <span className="text-[11px] text-tx-faint">
                        {t.worker ? `by ${t.worker}` : "No worker noted"}
                        {t.items.length ? ` · ${t.items.length} product${t.items.length === 1 ? "" : "s"} taken from stock` : ""}
                      </span>
                      {isOpen && t.items.length ? (
                        <span className="flex flex-col gap-px pt-0.5">
                          {t.items.map((i) => (
                            <span key={i.product_id} className="font-mono text-[11px] text-tx-soft">
                              {i.name} {fmtDec(i.amount, 3)} {i.unit}
                            </span>
                          ))}
                        </span>
                      ) : null}
                      {isOpen && t.notes ? <span className="whitespace-pre-line text-[11px] text-tx-soft">{t.notes}</span> : null}
                    </button>
                    {isOpen && perms.canManage ? (
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => start(t)} className="rounded-md bg-ink-850 px-2.5 py-1 text-[11px] font-semibold text-accent">
                          Edit
                        </button>
                        <button type="button" disabled={busy} onClick={() => remove(t.id)} className="rounded-md bg-ink-850 px-2.5 py-1 text-[11px] font-semibold text-bad">
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {!list.length && !form ? <div className="p-0.5 text-xs text-tx-faint">No treatments logged {kindLabel}.</div> : null}
          {form ? (
            <div className="flex flex-col gap-2.5 rounded-xl border border-accent bg-ink-850 p-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-bold text-tx-strong">{form.editId ? "Edit treatment" : "New treatment"}</span>
                <span className="font-mono text-[10px] text-tx-muted">Saving to {ctx.saveContext}</span>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${ctx.cycleId}-treat-text`} className="text-[10px] uppercase tracking-[0.05em] text-tx-faint">
                  Treatment {readyLines.length ? "(optional — products are listed below)" : ""}
                </label>
                <textarea
                  id={`${ctx.cycleId}-treat-text`}
                  rows={2}
                  placeholder={readyLines.length ? "Anything the products do not say" : "e.g. Probiotic 2 kg + molasses 5 L"}
                  value={form.text}
                  onChange={(e) => setForm({ ...form, text: e.target.value })}
                  className="w-full resize-y rounded-md border border-line bg-ink-800 px-2 py-[7px] text-[13px] text-tx-strong outline-none focus:border-accent"
                />
              </div>

              {usable.length ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase tracking-[0.05em] text-tx-faint">Products used (takes them out of stock)</span>
                  {form.lines.map((line, i) => {
                    const product = usable.find((p) => p.id === line.productId);
                    const setLine = (patch: Partial<TreatLine>) =>
                      setForm({ ...form, lines: form.lines.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                    return (
                      <div key={i} className="flex items-center gap-1.5">
                        <select
                          aria-label={`Product ${i + 1}`}
                          value={line.productId}
                          onChange={(e) => {
                            const next = usable.find((p) => p.id === e.target.value);
                            setLine({ productId: e.target.value, unit: next?.base_unit ?? "" });
                          }}
                          className="min-w-0 flex-grow rounded-md border border-line bg-ink-800 px-2 py-[7px] text-[13px] text-tx-strong outline-none focus:border-accent"
                        >
                          <option value="">Choose…</option>
                          {/* Grouped rather than suffixed: a worker reaches for a
                              formula first, and falls back to a raw product. */}
                          <optgroup label="Treatment formulas">
                            {usable
                              .filter((p) => p.kind === "formula")
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </optgroup>
                          <optgroup label="Products">
                            {usable
                              .filter((p) => p.kind === "product")
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </optgroup>
                        </select>
                        <input
                          aria-label={`Amount ${i + 1}`}
                          inputMode="decimal"
                          placeholder="0"
                          value={line.amount}
                          onChange={(e) => setLine({ amount: decimalInput(e.target.value, 3) })}
                          className="w-16 shrink-0 rounded-md border border-line bg-ink-800 px-2 py-[7px] text-right font-mono text-[13px] text-tx-strong outline-none focus:border-accent"
                        />
                        <select
                          aria-label={`Unit ${i + 1}`}
                          value={line.unit}
                          disabled={!product}
                          onChange={(e) => setLine({ unit: e.target.value })}
                          className="w-16 shrink-0 rounded-md border border-line bg-ink-800 px-1 py-[7px] text-[12px] text-tx-strong outline-none focus:border-accent disabled:opacity-40"
                        >
                          {(product ? unitsFor(product) : [""]).map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          aria-label={`Remove product ${i + 1}`}
                          onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-tx-faint hover:text-tx-strong"
                        >
                          <Icon name="close" size={11} strokeWidth={2.6} />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, lines: [...form.lines, { productId: "", amount: "", unit: "" }] })}
                    className="self-start rounded-md bg-ink-800 px-2.5 py-1 text-[11px] font-semibold text-accent"
                  >
                    + Product
                  </button>

                  {readyLines.length ? (
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`${ctx.cycleId}-treat-wh`} className="text-[10px] uppercase tracking-[0.05em] text-tx-faint">
                        Taken from
                      </label>
                      <select
                        id={`${ctx.cycleId}-treat-wh`}
                        value={form.warehouseId}
                        onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
                        className="w-full rounded-md border border-line bg-ink-800 px-2 py-[7px] text-[13px] text-tx-strong outline-none focus:border-accent"
                      >
                        <option value="">Pick a warehouse…</option>
                        {(warehouses ?? []).map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {preview.length ? (
                    <div className="flex flex-col gap-0.5 rounded-md bg-ink-800 px-2.5 py-2">
                      <span className="text-[10px] uppercase tracking-[0.05em] text-tx-faint">Comes out of stock</span>
                      {preview.map((p) => {
                        const have = onHand.get(p.product.id);
                        const enough = !warehouse || (have ?? 0) >= p.amount;
                        return (
                          <span key={p.product.id} className={`font-mono text-[11px] ${enough ? "text-tx-soft" : "text-warn"}`}>
                            {p.product.name} {fmtDec(p.amount, 3)} {p.product.base_unit}
                            {warehouse ? ` · ${have === undefined ? "not stocked here" : `${fmtDec(have, 3)} on hand`}` : ""}
                          </span>
                        );
                      })}
                      {short.length ? (
                        <span className="text-[11px] text-warn">
                          More than is on hand — this will save and leave the stock below zero. Do a stock count to correct it.
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor={`${ctx.cycleId}-treat-time`} className="text-[10px] uppercase tracking-[0.05em] text-tx-faint">
                    Time
                  </label>
                  <input
                    id={`${ctx.cycleId}-treat-time`}
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="HH:MM"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: fmt24(e.target.value) })}
                    className="w-full rounded-md border border-line bg-ink-800 px-2 py-[7px] font-mono text-[13px] font-semibold text-tx-strong outline-none focus:border-accent"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor={`${ctx.cycleId}-treat-worker`} className="text-[10px] uppercase tracking-[0.05em] text-tx-faint">
                    Worker
                  </label>
                  <input
                    id={`${ctx.cycleId}-treat-worker`}
                    placeholder="Name or email"
                    value={form.worker}
                    onChange={(e) => setForm({ ...form, worker: e.target.value })}
                    className="w-full rounded-md border border-line bg-ink-800 px-2 py-[7px] text-[13px] text-tx-strong outline-none focus:border-accent"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setForm(null)} className="rounded-md bg-ink-800 px-3 py-1.5 text-xs font-semibold text-tx-muted">
                  Cancel
                </button>
                <button type="button" onClick={save} disabled={!canSave || busy} className="rounded-md bg-accent px-3.5 py-1.5 text-xs font-bold text-accent-ink disabled:opacity-40">
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : null}
          {!form && perms.canAdd ? (
            <button type="button" onClick={() => start()} className="rounded-lg border border-dashed border-line-dash p-[9px] text-center text-xs font-semibold text-accent">
              + Treatment
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LogHeader({
  icon,
  tone,
  title,
  summary,
  count,
  open,
  onToggle,
}: {
  icon: "scale" | "flask";
  tone: "warn" | "accent";
  title: string;
  summary: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  const t = tone === "warn" ? { bg: "bg-warn/[0.07] border-warn/[0.07] border-l-warn", text: "text-warn", badge: "bg-warn" } : { bg: "bg-accent/[0.07] border-accent/[0.07] border-l-accent", text: "text-accent", badge: "bg-accent" };
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`flex w-full items-center gap-2.5 rounded-[10px] border border-l-[3px] py-[11px] pl-[11px] pr-3 text-left ${t.bg}`}
    >
      <Icon name={icon} size={18} strokeWidth={1.8} className={`shrink-0 ${t.text}`} />
      <div className="flex min-w-0 flex-grow flex-col gap-0.5">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-tx">{title}</span>
        <span className="truncate text-[11px] text-tx-muted">{summary}</span>
      </div>
      {count > 0 ? (
        <span className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-bold text-accent-ink ${t.badge}`}>{count}</span>
      ) : null}
      <Icon name="chevron" size={14} strokeWidth={2.2} className={`shrink-0 text-tx-muted transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}
