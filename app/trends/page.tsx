"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { TrendChart, type ChartEvent, type ChartSeries, type Layers, type Pt, type Target } from "@/components/trends/TrendChart";
import { Banner, Loading } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PageColumn, PageHeader } from "@/components/ui/PageHeader";
import { Segmented, Toggle } from "@/components/ui/Section";
import { api, type Cycle, type DayView, type Farm, type Grid, type Pond, type TrendSeries } from "@/lib/api";
import { byStartDesc, currentCycle, cycleLabel, statusLabel, targetDoc } from "@/lib/cycles";
import { addDays, daysBetween, docFor, isoForDoc, longDate, shortDate, todayIso, weekday } from "@/lib/dates";
import { METRIC_DEFS, METRIC_GROUPS, backendMetric, metricDef } from "@/lib/metrics";
import { cumulativeFeed } from "@/lib/feed";
import { moonOn } from "@/lib/moon";
import { num } from "@/lib/num";
import { useRequireUser } from "@/lib/session";

const PALETTE = ["#2DD4BF", "#FBBF24", "#C084FC", "#38BDF8", "#F472B6", "#A3E635", "#FB923C", "#F87171"];
const MAX_PARAMS = 8;
const MAX_COMPARES = 3;
const DEFAULT_METRICS = ["abw_g", "daily_feed_kg", "adg_g_per_day"];
const GROUP_LABEL: Record<string, string> = {
  "Daily metrics": "Feed & growth",
  "Water parameters": "Water",
  "Plankton & Bacteria": "Plankton & bacteria",
  Weather: "Weather",
};
const dashFor = (age: number) => (age <= 0 ? "" : age === 1 ? "6 4" : "2 4");
const opacityFor = (age: number) => (age <= 0 ? 1 : age === 1 ? 0.75 : 0.55);

type Range = "7d" | "30d" | "cycle" | "all";

export default function TrendsPage() {
  const user = useRequireUser();
  const today = todayIso();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [grids, setGrids] = useState<Grid[]>([]);
  const [ponds, setPonds] = useState<Pond[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [compares, setCompares] = useState<string[]>([]);
  const [params, setParams] = useState<string[]>(DEFAULT_METRICS);
  const [axis, setAxis] = useState<"doc" | "date">("doc");
  const [range, setRange] = useState<Range>("cycle");
  const [custom, setCustom] = useState<[number, number] | null>(null);
  const [layers, setLayers] = useState<Layers>({ targets: true, safe: true, events: true, molt: false, gaps: false });
  const [overlay, setOverlay] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [trends, setTrends] = useState<Record<string, TrendSeries>>({});
  // Today's day view per running cycle, for the "fed so far" cumulative feed point.
  const [todayViews, setTodayViews] = useState<Record<string, DayView>>({});
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(new Set<string>());

  // Resolve the farm (URL, the linked cycle's farm, last used, first) and load its ponds and cycles.
  useEffect(() => {
    if (!user) return;
    const q = new URLSearchParams(window.location.search);
    const wantCycle = q.get("cycle");
    const metrics = (q.get("metrics") ?? "").split(",").filter((m) => METRIC_DEFS.some((d) => d.key === m));
    if (metrics.length) setParams(metrics.slice(0, MAX_PARAMS));
    const cmp = (q.get("compare") ?? "").split(",").filter(Boolean).slice(0, MAX_COMPARES);
    (async () => {
      const [list, allGrids] = await Promise.all([api.listFarms(), api.listGrids()]);
      setFarms(list);
      let farmId = q.get("farm");
      if (!farmId && wantCycle) {
        const c = await api.getCycle(wantCycle).catch(() => null);
        const p = c ? await api.getPond(c.pond_id).catch(() => null) : null;
        farmId = allGrids.find((g) => g.id === p?.grid_id)?.farm_id ?? null;
      }
      let last: string | null = null;
      try {
        last = JSON.parse(window.localStorage.getItem("shrimpy.farm") ?? "null");
      } catch {
        // ignore
      }
      const f = list.find((x) => x.id === farmId) ?? list.find((x) => x.id === last) ?? list[0];
      if (!f) return;
      setFarm(f);
      const [ps, cs] = await Promise.all([api.listPonds(undefined, f.id), api.listCycles(f.id)]);
      setGrids(allGrids.filter((g) => g.farm_id === f.id));
      setPonds(ps);
      setCycles(cs);
      const primary = cs.find((c) => c.id === wantCycle) ?? ps.map((p) => currentCycle(cs, p.id)).find(Boolean) ?? [...cs].sort(byStartDesc)[0];
      setPrimaryId(primary?.id ?? null);
      setCompares(cmp.filter((id) => id !== primary?.id && cs.some((c) => c.id === id)));
    })().catch((e: Error) => setError(e.message));
  }, [user]);

  // Mirror the view in the URL so it can be shared.
  useEffect(() => {
    if (!farm || !primaryId) return;
    const q = new URLSearchParams({ farm: farm.id, cycle: primaryId, metrics: params.join(",") });
    if (compares.length) q.set("compare", compares.join(","));
    window.history.replaceState(null, "", `/trends?${q.toString()}`);
  }, [farm, primaryId, params, compares]);

  const pondOrder = useMemo(
    () => [...ponds].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [ponds],
  );
  const pondColor = (pondId: string) => PALETTE[Math.max(0, pondOrder.findIndex((p) => p.id === pondId)) % PALETTE.length];
  const cyclesOf = (pondId: string) => cycles.filter((c) => c.pond_id === pondId).sort(byStartDesc);
  const ageOf = (c: Cycle) => cyclesOf(c.pond_id).findIndex((x) => x.id === c.id);
  const pondName = (id: string) => ponds.find((p) => p.id === id)?.name ?? "?";

  const primary = cycles.find((c) => c.id === primaryId) ?? null;
  const lines = primary ? [primary, ...compares.map((id) => cycles.find((c) => c.id === id)).filter((c): c is Cycle => !!c)] : [];
  const endFor = (c: Cycle) => {
    if (c.actual_end_date) return c.actual_end_date;
    const planned = c.planned_end_date && c.planned_end_date > today ? c.planned_end_date : null;
    const ahead = addDays(today, 16); // predictions and weather forecast reach ahead
    return planned && planned > ahead ? planned : ahead;
  };

  // Fetch every (cycle, metric) pair once.
  useEffect(() => {
    lines.forEach((c) =>
      params.forEach((m) => {
        const key = `${c.id}|${m}`;
        if (requested.current.has(key)) return;
        requested.current.add(key);
        api
          .getCycleTrend(c.id, backendMetric(m), c.start_date, endFor(c))
          .then((t) => setTrends((all) => ({ ...all, [key]: t })))
          .catch(() => requested.current.delete(key));
      }),
    );
    if (params.includes("cumulative_feed")) {
      lines
        .filter((c) => !c.actual_end_date && !todayViews[c.id])
        .forEach((c) => api.getCycleDay(c.id, today).then((d) => setTodayViews((v) => ({ ...v, [c.id]: d }))).catch(() => undefined));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryId, compares.join(","), params.join(",")]);

  if (!user || (!farm && !error)) return <Loading label="Loading trends…" />;

  const xOf = (c: Cycle, iso: string) => (axis === "doc" ? docFor(c.start_date, iso) : daysBetween(today, iso));
  const onePond = new Set(lines.map((c) => c.pond_id)).size === 1;
  const oneCycle = lines.length === 1;

  const series: ChartSeries[] = [];
  params.forEach((m, mi) =>
    lines.forEach((c) => {
      const t = trends[`${c.id}|${m}`];
      const age = ageOf(c);
      const def = metricDef(m);
      const todayView = m === "cumulative_feed" ? todayViews[c.id] : undefined;
      const points: Pt[] = (t?.points ?? [])
        .map((p) => (todayView && p.date === today ? { ...p, value: String(cumulativeFeed(todayView)) } : p))
        .filter((p) => Number.isFinite(num(p.value)))
        .map((p) => ({ x: xOf(c, p.date), v: num(p.value), future: p.is_future, date: p.date, doc: docFor(c.start_date, p.date), sampling: p.is_sampling_day, harvest: p.is_harvest_day }));
      const tag = `${pondName(c.pond_id)} · ${cycleLabel(c)}`;
      const lenDoc = docFor(c.start_date, c.actual_end_date ?? today);
      series.push({
        key: `${c.id}|${m}`,
        metric: m,
        label: `${def.label} · ${tag}`,
        short: onePond && oneCycle ? def.label : `${def.label} · ${tag}`,
        color: onePond && oneCycle ? PALETTE[mi % PALETTE.length] : pondColor(c.pond_id),
        dash: onePond && oneCycle ? "" : dashFor(age),
        opacity: onePond && oneCycle ? 1 : opacityFor(age),
        points,
        loaded: !!t,
        whereAt: (x) => {
          if (axis === "doc") return `${longDate(isoForDoc(c.start_date, x))}${oneCycle ? "" : ` · ${tag}`}`;
          const d = addDays(today, x);
          return `${weekday(d)} · ${x === 0 ? "today" : x < 0 ? `${-x}d ago` : `in ${x}d`}`;
        },
        coverage: (x) => {
          const d = axis === "doc" ? isoForDoc(c.start_date, x) : addDays(today, x);
          const doc = docFor(c.start_date, d);
          if (doc < 1) return "before";
          if (c.actual_end_date && doc > lenDoc) return "after";
          const last = points.at(-1);
          if (!last || d > last.date) return "ahead";
          return "in";
        },
      });
    }),
  );
  // Several metrics on one pond+cycle but multiple lines: keep colours apart within a lane.
  if (!(onePond && oneCycle)) {
    series.forEach((s, i) => {
      const clash = series.slice(0, i).some((o) => o.color === s.color && o.dash === s.dash && metricDef(o.metric).axisGroup === metricDef(s.metric).axisGroup);
      if (clash) s.color = PALETTE[(i + 3) % PALETTE.length];
    });
  }

  // Domain and window.
  let dMin = Infinity;
  let dMax = -Infinity;
  series.forEach((s) => s.points.forEach((p) => ((dMin = Math.min(dMin, p.x)), (dMax = Math.max(dMax, p.x)))));
  lines.forEach((c) => {
    dMin = Math.min(dMin, xOf(c, c.start_date));
    const tdoc = targetDoc(c);
    if (tdoc) dMax = Math.max(dMax, xOf(c, isoForDoc(c.start_date, tdoc)));
  });
  if (!Number.isFinite(dMin)) {
    dMin = axis === "doc" ? 1 : -30;
    dMax = axis === "doc" ? 30 : 0;
  }
  const primaryRecorded = series.filter((s) => s.key.startsWith(primaryId ?? "")).flatMap((s) => s.points.filter((p) => !p.future).map((p) => p.x));
  const anchor = primary ? (primaryRecorded.length ? Math.max(...primaryRecorded) : xOf(primary, primary.actual_end_date ?? today)) : dMax;
  let from: number;
  let to: number;
  if (custom) [from, to] = custom;
  else if (range === "7d") [from, to] = [anchor - 6, anchor];
  else if (range === "30d") [from, to] = [anchor - 29, anchor];
  else if (range === "cycle" && primary) {
    from = xOf(primary, primary.start_date);
    const tdoc = targetDoc(primary);
    to = tdoc ? xOf(primary, isoForDoc(primary.start_date, tdoc)) : Math.max(anchor, xOf(primary, primary.actual_end_date ?? today));
  } else [from, to] = [dMin, dMax];
  from = Math.max(dMin, from);
  to = Math.min(dMax, Math.max(to, from + 1));
  from = Math.round(from);
  to = Math.round(to);

  const xLabel = (x: number) => (axis === "doc" ? `D${x}` : shortDate(addDays(today, x)));
  const dateAtX = (x: number) => (axis === "doc" && primary ? isoForDoc(primary.start_date, x) : addDays(today, x));

  // Targets from the primary cycle's settings.
  const cfg = primary?.prediction_config;
  const targets: Target[] = cfg
    ? [
        { metric: "abw_g", value: Number(cfg.cycle.maximum_shrimp_size_g), label: `max size ${Number(cfg.cycle.maximum_shrimp_size_g)} g` },
        { metric: "adg_g_per_day", value: Number(cfg.growth.maximum_adg_g_per_day), label: `max ADG ${Number(cfg.growth.maximum_adg_g_per_day).toFixed(2)}` },
        { metric: "fcr", value: Number(cfg.growth.target_fcr), label: `target ${Number(cfg.growth.target_fcr).toFixed(2)}` },
        { metric: "sample_fcr", value: Number(cfg.growth.target_fcr), label: `target ${Number(cfg.growth.target_fcr).toFixed(2)}` },
        { metric: "feeding_index", value: Number(cfg.growth.maximum_feeding_index), label: `max FI ${Number(cfg.growth.maximum_feeding_index).toFixed(2)}` },
      ]
    : [];

  // Events on the primary cycle: sampling and harvest days (flags ride on every trend point).
  const events: ChartEvent[] = [];
  if (primary) {
    const src = series.find((s) => s.key.startsWith(primary.id));
    const abwMap = new Map((trends[`${primary.id}|abw_g`]?.points ?? []).map((p) => [p.date, num(p.value)]));
    const hvMap = new Map((trends[`${primary.id}|harvest_biomass_kg`]?.points ?? []).map((p) => [p.date, num(p.value)]));
    (trends[src?.key ?? ""]?.points ?? []).forEach((p) => {
      const x = xOf(primary, p.date);
      if (p.is_sampling_day) events.push({ x, kind: "S", color: "#2DD4BF", text: `Sampling${Number.isFinite(abwMap.get(p.date) ?? NaN) ? ` · ABW ${(abwMap.get(p.date) as number).toFixed(1)} g` : ""}` });
      if (p.is_harvest_day) events.push({ x, kind: "H", color: "#FBBF24", text: `Harvest${(hvMap.get(p.date) ?? 0) > 0 ? ` · ${Math.round(hvMap.get(p.date) as number).toLocaleString("en-US")} kg` : ""}` });
    });
  }

  // Molt windows across the visible range.
  const moltRanges: [number, number][] = [];
  if (layers.molt) {
    let start: number | null = null;
    for (let x = from; x <= to + 1; x++) {
      const on = x <= to && moonOn(dateAtX(x)).window !== null;
      if (on && start === null) start = x;
      if (!on && start !== null) {
        moltRanges.push([start, x - 1]);
        start = null;
      }
    }
  }

  function exportCsv() {
    const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].filter((x) => x >= from && x <= to).sort((a, b) => a - b);
    const head = [axis === "doc" ? "DOC" : "Date", ...series.map((s) => `${s.label}${metricDef(s.metric).unit ? ` (${metricDef(s.metric).unit})` : ""}`)];
    const rows = xs.map((x) => [axis === "doc" ? String(x) : addDays(today, x), ...series.map((s) => {
      const p = s.points.find((q) => q.x === x);
      return p ? String(p.v) : "";
    })]);
    const csv = [head, ...rows].map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `trends-${farm?.name ?? "farm"}-${today}.csv`.replace(/\s+/g, "-");
    a.click();
    URL.revokeObjectURL(url);
  }

  const viewLabel = primary ? `${pondName(primary.pond_id)} · ${cycleLabel(primary)}` : "No cycle";
  const rangeLabel = axis === "doc" ? `DOC ${from} – ${to} · ${to - from + 1} days` : `${shortDate(addDays(today, from))} – ${shortDate(addDays(today, to))}`;
  const chip = (on: boolean) => (on ? "border-accent bg-accent/[0.12] text-tx-strong" : "border-line-strong bg-ink-800 text-tx-soft");

  return (
    <PageColumn className="gap-4">
      <PageHeader
        eyebrow={
          <button type="button" onClick={() => setViewOpen((o) => !o)} aria-expanded={viewOpen} className="inline-flex max-w-full items-center gap-1.5 uppercase">
            <span className="truncate">
              {farm?.name} · {viewLabel}
            </span>
            <Icon name="chevron" size={12} strokeWidth={2.4} className={`shrink-0 transition-transform ${viewOpen ? "rotate-180" : ""}`} />
          </button>
        }
        title="Trends"
        backHref={farm ? `/?farm=${farm.id}` : "/"}
      />
      {error ? <Banner onDismiss={() => setError(null)}>{error}</Banner> : null}

      {viewOpen ? (
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto rounded-2xl border border-line bg-ink-800 p-3">
          {farms.length > 1 ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="trend-farm" className="field-label">Farm</label>
              <select
                id="trend-farm"
                value={farm?.id ?? ""}
                onChange={(e) => window.location.assign(`/trends?farm=${e.target.value}&metrics=${params.join(",")}`)}
                className="input-sm"
              >
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          ) : null}
          {pondOrder.map((p) => (
            <div key={p.id} className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.08em] text-tx-faint">
                {p.name}
                {grids.length > 1 ? ` · ${grids.find((g) => g.id === p.grid_id)?.name ?? ""}` : ""}
              </span>
              {cyclesOf(p.id).map((c, age) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setPrimaryId(c.id);
                    setCompares([]);
                    setCustom(null);
                    setViewOpen(false);
                  }}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${c.id === primaryId ? "bg-accent/[0.12] text-accent" : "text-tx hover:bg-ink-850"}`}
                >
                  <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden>
                    <line x1="1" x2="15" y1="4" y2="4" stroke={pondColor(p.id)} strokeWidth="3" strokeDasharray={dashFor(age)} strokeLinecap="round" />
                  </svg>
                  <span className="text-sm font-semibold">{cycleLabel(c)}</span>
                  <span className="ml-auto font-mono text-[11px] text-tx-faint">
                    {c.status === "active" ? `current · DOC ${docFor(c.start_date, today)}` : `${statusLabel(c.status).toLowerCase()} · ${docFor(c.start_date, c.actual_end_date ?? today)} days`}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <Segmented label="X axis" size="md" value={axis} onChange={(v) => { setAxis(v); setCustom(null); }} options={[{ value: "doc", label: "DOC" }, { value: "date", label: "Date" }]} />
        <Segmented
          label="Range"
          size="sm"
          value={custom ? null : range}
          onChange={(v) => { setRange(v); setCustom(null); }}
          options={[{ value: "7d", label: "7d" }, { value: "30d", label: "30d" }, { value: "cycle", label: "Cycle" }, { value: "all", label: "All" }]}
        />
      </div>

      {!primary ? (
        <div className="rounded-2xl border border-line-soft bg-ink-850 px-4 py-8 text-center text-[13px] text-tx-dim">This farm has no cycles yet.</div>
      ) : series.length === 0 ? (
        <div className="rounded-2xl border border-line-soft bg-ink-850 px-4 py-8 text-center text-[13px] text-tx-dim">No charts yet. Add parameters below.</div>
      ) : (
        <TrendChart
          series={series}
          from={from}
          to={to}
          axis={axis}
          layers={layers}
          targets={targets}
          events={events}
          moltRanges={moltRanges}
          xLabel={xLabel}
          overlay={overlay}
          onToggleOverlay={() => setOverlay((o) => !o)}
        />
      )}

      {compares.length && primary ? (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {lines.map((c, i) => (
            <span key={c.id} className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-line bg-ink-800 pl-2.5 pr-1">
              <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden>
                <line x1="1" x2="15" y1="4" y2="4" stroke={pondColor(c.pond_id)} strokeWidth="3" strokeDasharray={dashFor(ageOf(c))} strokeLinecap="round" />
              </svg>
              <span className="whitespace-nowrap text-xs font-semibold text-tx">{pondName(c.pond_id)} {cycleLabel(c)}</span>
              {i > 0 ? (
                <button type="button" onClick={() => setCompares((cs) => cs.filter((x) => x !== c.id))} aria-label={`Remove ${pondName(c.pond_id)} ${cycleLabel(c)} from comparison`} className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-tx-dim">
                  <Icon name="close" size={10} strokeWidth={2.6} />
                </button>
              ) : (
                <span className="w-1.5" />
              )}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5 rounded-[14px] border border-line bg-ink-800 px-3.5 py-3">
        <div className="flex justify-between text-[11px] text-tx-dim">
          <span>Showing</span>
          <span className="font-mono text-tx">{rangeLabel}</span>
        </div>
        <div className="grid grid-cols-[40px_1fr] items-center gap-2">
          <label htmlFor="rng-from" className="text-[11px] text-tx-dim">From</label>
          <input id="rng-from" type="range" min={Math.round(dMin)} max={Math.round(dMax)} step={1} value={from} onChange={(e) => setCustom([Math.min(Number(e.target.value), to - 1), to])} className="w-full accent-accent" />
          <label htmlFor="rng-to" className="text-[11px] text-tx-dim">To</label>
          <input id="rng-to" type="range" min={Math.round(dMin)} max={Math.round(dMax)} step={1} value={to} onChange={(e) => setCustom([from, Math.max(Number(e.target.value), from + 1)])} className="w-full accent-accent" />
        </div>
      </div>

      <section className="overflow-hidden rounded-[14px] border border-line bg-ink-800">
        <button type="button" onClick={() => setPickerOpen((o) => !o)} aria-expanded={pickerOpen} className="flex w-full items-center gap-2.5 p-3.5 text-left">
          <div className="flex min-w-0 flex-grow flex-col gap-0.5">
            <span className="text-sm font-bold text-tx-strong">Add parameters</span>
            <span className="text-xs text-tx-dim">{params.length} on · tap a parameter to show or hide its chart</span>
          </div>
          <Icon name="chevron" size={15} strokeWidth={2.2} className={`shrink-0 text-tx-dim transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
        </button>
        {pickerOpen ? (
          <div className="flex flex-col gap-3 px-3.5 pb-3.5">
            {METRIC_GROUPS.map((g) => (
              <div key={g} className="flex flex-col gap-1.5">
                <span className="text-[10px] uppercase tracking-[0.08em] text-tx-dim">{GROUP_LABEL[g] ?? g}</span>
                <div className="flex flex-wrap gap-1.5">
                  {METRIC_DEFS.filter((d) => d.group === g).map((d) => {
                    const on = params.includes(d.key);
                    const idx = series.findIndex((s) => s.metric === d.key);
                    const disabled = !on && params.length >= MAX_PARAMS;
                    return (
                      <button
                        key={d.key}
                        type="button"
                        aria-pressed={on}
                        disabled={disabled}
                        onClick={() => setParams((ps) => (on ? ps.filter((x) => x !== d.key) : [...ps, d.key]))}
                        className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold disabled:opacity-40 ${chip(on)}`}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: on && idx >= 0 ? series[idx].color : "#3A4843" }} />
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {params.length >= MAX_PARAMS ? <span className="text-xs text-warn">8 charts max. Turn one off to add another.</span> : null}
          </div>
        ) : null}

        <div className="border-t border-line">
          <button type="button" onClick={() => setCompareOpen((o) => !o)} aria-expanded={compareOpen} className="flex w-full items-center gap-2.5 p-3.5 text-left">
            <div className="flex min-w-0 flex-grow flex-col gap-0.5">
              <span className="text-sm font-bold text-tx-strong">Compare with</span>
              <span className="truncate text-xs text-tx-dim">
                {compares.length
                  ? `${compares.length} on · ${compares.map((id) => { const c = cycles.find((x) => x.id === id); return c ? `${pondName(c.pond_id)} ${cycleLabel(c)}` : ""; }).join(", ")}`
                  : "Off · tap to add other ponds or cycles"}
              </span>
            </div>
            <Icon name="chevron" size={15} strokeWidth={2.2} className={`shrink-0 text-tx-dim transition-transform ${compareOpen ? "rotate-180" : ""}`} />
          </button>
          {compareOpen ? (
            <div className="flex flex-col gap-2.5 px-3.5 pb-3.5">
              {pondOrder.map((p) => (
                <div key={p.id} className="flex items-start gap-2.5">
                  <span className="w-[42px] shrink-0 truncate pt-[9px] text-[13px] font-bold" style={{ color: pondColor(p.id) }}>{p.name}</span>
                  <div className="flex min-w-0 flex-wrap gap-1.5">
                    {cyclesOf(p.id).map((c, age) => {
                      const isView = c.id === primaryId;
                      const on = compares.includes(c.id);
                      const full = !on && !isView && compares.length >= MAX_COMPARES;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={on || isView}
                          disabled={isView || full}
                          onClick={() => setCompares((cs) => (on ? cs.filter((x) => x !== c.id) : [...cs, c.id]))}
                          className={`flex h-9 items-center gap-[7px] rounded-full border px-[11px] ${isView ? "border-tx-off bg-white/[0.04]" : on ? "border-accent bg-accent/[0.12]" : "border-line-strong bg-ink-850"} ${full ? "opacity-40" : ""}`}
                        >
                          <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden>
                            <line x1="1" x2="15" y1="4" y2="4" stroke={pondColor(p.id)} strokeWidth="3" strokeDasharray={dashFor(age)} strokeLinecap="round" />
                          </svg>
                          <span className={`whitespace-nowrap text-xs font-semibold ${isView ? "text-tx-dim" : on ? "text-tx-strong" : "text-tx-soft"}`}>
                            {cycleLabel(c)}
                            {isView ? " · viewing" : c.status === "active" ? " · now" : c.status === "crashed" ? " · crashed" : ""}
                          </span>
                        </button>
                      );
                    })}
                    {cyclesOf(p.id).length === 0 ? <span className="pt-2 text-xs text-tx-faint">No cycles</span> : null}
                  </div>
                </div>
              ))}
              {compares.length >= MAX_COMPARES ? <span className="text-xs text-warn">3 comparisons max. Remove one to add another.</span> : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-[13px] font-bold uppercase tracking-[0.08em] text-tx-soft">Context layers</h2>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["targets", "Targets", "from cycle settings"],
              ["safe", "Safe ranges", "water, vibrio, total plankton"],
              ["events", "Events", "sampling, harvest"],
              ["molt", "Molt windows", "around full & new moon"],
              ["gaps", "Connect gaps", "join missing readings"],
            ] as [keyof Layers, string, string][]
          ).map(([k, label, sub]) => (
            <div key={k} className={`flex items-center gap-2.5 rounded-xl border bg-ink-800 px-3 py-2.5 ${layers[k] ? "border-accent/50" : "border-line"}`}>
              <Toggle on={layers[k]} label={label} onChange={(v) => setLayers((l) => ({ ...l, [k]: v }))} />
              <div className="flex min-w-0 flex-col">
                <span className="text-[13px] font-semibold text-tx">{label}</span>
                <span className="truncate text-[10px] text-tx-faint">{sub}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <button type="button" onClick={exportCsv} disabled={!series.length} className="h-11 rounded-xl border border-line bg-ink-800 text-[13px] font-semibold text-tx disabled:opacity-40">
        Export CSV
      </button>
    </PageColumn>
  );
}
