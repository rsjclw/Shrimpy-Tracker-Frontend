"use client";

import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DocTrendChart, type ChartSeries } from "@/components/DocTrendChart";
import { api, type Cycle, type Farm, type Grid, type Pond } from "@/lib/api";
import { METRIC_DEFS, METRIC_GROUPS, metricDef, type MetricGroup } from "@/lib/metrics";
import { getSupabase } from "@/lib/supabase";

const CYCLE_COLORS = [
  "#0ea5a4",
  "#6366f1",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#0891b2",
  "#65a30d",
  "#db2777",
];
const METRIC_DASHES: (string | undefined)[] = [undefined, "6 3", "2 3", "10 4 2 4", "1 3"];

const PRESETS: { label: string; metrics: string[] }[] = [
  { label: "pH am vs pm", metrics: ["ph_am", "ph_pm"] },
  { label: "DO am vs pm", metrics: ["do_am", "do_pm"] },
  { label: "Clarity am vs pm", metrics: ["water_clarity_am", "water_clarity_pm"] },
  { label: "Growth", metrics: ["abw_g", "adg_g_per_day"] },
  { label: "Feed vs FCR", metrics: ["daily_feed_kg", "fcr"] },
  { label: "Air temp min/avg/max", metrics: ["temp_min_c", "temp_mean_c", "temp_max_c"] },
  { label: "Sun vs rain", metrics: ["shortwave_radiation_sum_mj", "precipitation_mm"] },
];

/**
 * Weather is cached 16 days ahead, so the trend window has to reach past today
 * for an open cycle - otherwise the forecast half of the series is fetched but
 * never asked for.
 */
const FORECAST_HORIZON_DAYS = 16;

const SMOOTH_OPTIONS = [
  { value: 1, label: "Raw" },
  { value: 3, label: "3-day" },
  { value: 7, label: "7-day" },
];

type DocPoint = { doc: number; value: number; isFuture: boolean };
type DocRange = { from: number; to: number };
type DocRangeDraft = { from: string; to: string };

const FARM_STORAGE_KEY = "trends-last-farm";

function todayIso() {
  return format(new Date(), "yyyy-MM-dd");
}

function horizonIso() {
  return format(addDays(new Date(), FORECAST_HORIZON_DAYS), "yyyy-MM-dd");
}

/** Last date worth asking for: a finished cycle stops, an open one looks ahead. */
function trendEndDate(cycle: Cycle) {
  if (cycle.actual_end_date) return cycle.actual_end_date;
  if (cycle.status !== "active") {
    return minIso(cycle.planned_end_date ?? todayIso(), todayIso());
  }
  return maxIso(cycle.planned_end_date ?? todayIso(), horizonIso());
}

function maxIso(a: string, b: string) {
  return a >= b ? a : b;
}

function minIso(a: string, b: string) {
  return a <= b ? a : b;
}

function seriesKey(cycleId: string, metric: string) {
  return `${cycleId}:${metric}`;
}

function parseList(value: string | null): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

function parseDocBound(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export default function TrendsComparePage() {
  return (
    <Suspense fallback={<main className="p-6 text-sm text-slate-500">Loading...</main>}>
      <TrendsCompare />
    </Suspense>
  );
}

function TrendsCompare() {
  const router = useRouter();
  const search = useSearchParams();

  const [authChecked, setAuthChecked] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmId, setFarmId] = useState("");
  const [grids, setGrids] = useState<Grid[]>([]);
  const [ponds, setPonds] = useState<Pond[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const farmInitialized = useRef(false);
  const scrolledToSelection = useRef(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const [selectedCycleIds, setSelectedCycleIds] = useState<string[]>(() =>
    parseList(search.get("cycles")),
  );
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(() => {
    const fromUrl = parseList(search.get("metrics"));
    return fromUrl.length ? fromUrl : ["daily_feed_kg"];
  });

  const [pointsByKey, setPointsByKey] = useState<Record<string, DocPoint[]>>({});
  const [loadingKeys, setLoadingKeys] = useState<string[]>([]);
  const inFlight = useRef(new Set<string>());

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  // Keep what the user is typing separate from the last valid chart range.
  // This lets an input be temporarily blank (or otherwise invalid) without
  // snapping it to a fallback value or sending a bad domain to Recharts.
  const [docRange, setDocRange] = useState<DocRange | null>(null);
  const [docRangeDraft, setDocRangeDraft] = useState<DocRangeDraft | null>(null);
  const [smoothWindow, setSmoothWindow] = useState(1);
  const [normalize, setNormalize] = useState(false);
  const [connectNulls, setConnectNulls] = useState(true);
  // On by default: the weather forecast is only ever future, so hiding it would
  // make the Weather group look empty for the days that matter most.
  const [includePredicted, setIncludePredicted] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [cycleFilter, setCycleFilter] = useState("");
  const [openMetricGroups, setOpenMetricGroups] = useState<MetricGroup[]>([...METRIC_GROUPS]);

  useEffect(() => {
    getSupabase()
      .auth.getSession()
      .then(async ({ data }) => {
        if (!data.session) {
          router.replace("/login");
          return;
        }
        setFarms(await api.listFarms());
        setAuthChecked(true);
      });
  }, [router]);

  // Everything the account can see is loaded once, unfiltered. The farm
  // selector then only filters the picker, so a deep link to a cycle resolves
  // no matter which farm it belongs to.
  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    Promise.all([api.listGrids(), api.listPonds(), api.listCycles()]).then(([g, p, c]) => {
      if (cancelled) return;
      setGrids(g);
      setPonds(p);
      setCycles(c);
      setDataLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [authChecked]);

  // Keep the URL in sync so a comparison can be bookmarked or shared.
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCycleIds.length) params.set("cycles", selectedCycleIds.join(","));
    if (selectedMetrics.length) params.set("metrics", selectedMetrics.join(","));
    const query = params.toString();
    router.replace(query ? `/trends?${query}` : "/trends", { scroll: false });
  }, [selectedCycleIds, selectedMetrics, router]);

  const cycleById = useMemo(() => new Map(cycles.map((c) => [c.id, c])), [cycles]);
  const pondById = useMemo(() => new Map(ponds.map((p) => [p.id, p])), [ponds]);
  const gridById = useMemo(() => new Map(grids.map((g) => [g.id, g])), [grids]);

  const farmIdOfCycle = useCallback(
    (cycleId: string) => {
      const pond = pondById.get(cycleById.get(cycleId)?.pond_id ?? "");
      return pond ? gridById.get(pond.grid_id)?.farm_id : undefined;
    },
    [cycleById, pondById, gridById],
  );

  // Land on the farm that actually holds the selected cycle, then on the farm
  // last used on this page. farms[0] is only the final fallback.
  useEffect(() => {
    if (farmInitialized.current || !dataLoaded || !farms.length) return;
    farmInitialized.current = true;

    const known = (id: string | null | undefined) => Boolean(id && farms.some((f) => f.id === id));
    const fromSelection = selectedCycleIds.map(farmIdOfCycle).find(known);
    const remembered = window.localStorage.getItem(FARM_STORAGE_KEY);

    setFarmId(known(fromSelection) ? fromSelection! : known(remembered) ? remembered! : farms[0].id);
  }, [dataLoaded, farms, selectedCycleIds, farmIdOfCycle]);

  useEffect(() => {
    if (farmId) window.localStorage.setItem(FARM_STORAGE_KEY, farmId);
  }, [farmId]);

  // Bring the deep-linked cycle into view inside the scrollable picker.
  useEffect(() => {
    if (scrolledToSelection.current || !farmId || !selectedCycleIds.length) return;
    const target = pickerRef.current?.querySelector(`[data-cycle-id="${selectedCycleIds[0]}"]`);
    if (!target) return;
    scrolledToSelection.current = true;
    target.scrollIntoView({ block: "nearest" });
  }, [farmId, selectedCycleIds, cycles]);

  // Fetch every missing (cycle, metric) pair. Results are cached by key so
  // toggling a metric off and back on does not refetch.
  useEffect(() => {
    const wanted: string[] = [];
    for (const cycleId of selectedCycleIds) {
      if (!cycleById.has(cycleId)) continue;
      for (const metric of selectedMetrics) {
        const key = seriesKey(cycleId, metric);
        if (!(key in pointsByKey) && !inFlight.current.has(key)) wanted.push(key);
      }
    }
    if (!wanted.length) return;

    wanted.forEach((key) => inFlight.current.add(key));
    setLoadingKeys(Array.from(inFlight.current));

    wanted.forEach(async (key) => {
      const [cycleId, metric] = key.split(":");
      try {
        const cycle = cycleById.get(cycleId);
        if (!cycle) throw new Error("Cycle went away");

        const from = cycle.start_date;
        const to = maxIso(from, trendEndDate(cycle));

        const result = await api.getCycleTrend(cycleId, metric, from, to);
        const start = parseISO(from);
        const points: DocPoint[] = [];
        for (const point of result.points) {
          if (point.value === null) continue;
          const value = Number(point.value);
          if (!Number.isFinite(value)) continue;
          points.push({
            doc: differenceInCalendarDays(parseISO(point.date), start) + 1,
            value,
            isFuture: point.is_future,
          });
        }
        setPointsByKey((current) => ({ ...current, [key]: points }));
      } catch {
        setPointsByKey((current) => ({ ...current, [key]: [] }));
      } finally {
        inFlight.current.delete(key);
        setLoadingKeys(Array.from(inFlight.current));
      }
    });
  }, [selectedCycleIds, selectedMetrics, cycleById, pointsByKey]);

  const cycleLabels = useMemo(() => {
    const labels = new Map<string, string>();
    const counts = new Map<string, number>();

    for (const cycleId of selectedCycleIds) {
      const cycle = cycleById.get(cycleId);
      if (!cycle) continue;
      const pond = pondById.get(cycle.pond_id);
      const short = `${pond?.name ?? "Pond"} - ${cycle.name}`;
      counts.set(short, (counts.get(short) ?? 0) + 1);
    }

    for (const cycleId of selectedCycleIds) {
      const cycle = cycleById.get(cycleId);
      if (!cycle) continue;
      const pond = pondById.get(cycle.pond_id);
      const grid = pond ? gridById.get(pond.grid_id) : undefined;
      const short = `${pond?.name ?? "Pond"} - ${cycle.name}`;
      labels.set(cycleId, (counts.get(short) ?? 0) > 1 ? `${grid?.name ?? "?"}/${short}` : short);
    }

    return labels;
  }, [selectedCycleIds, cycleById, pondById, gridById]);

  const series = useMemo<ChartSeries[]>(() => {
    const multiCycle = selectedCycleIds.length > 1;
    const multiMetric = selectedMetrics.length > 1;
    const list: ChartSeries[] = [];

    selectedCycleIds.forEach((cycleId, cycleIndex) => {
      if (!cycleById.has(cycleId)) return;
      selectedMetrics.forEach((metric, metricIndex) => {
        const def = metricDef(metric);
        const key = seriesKey(cycleId, metric);
        const values = new Map<number, number>();
        let futureFromDoc: number | null = null;
        for (const point of pointsByKey[key] ?? []) {
          if (point.isFuture) {
            if (!includePredicted) continue;
            if (futureFromDoc == null || point.doc < futureFromDoc) futureFromDoc = point.doc;
          }
          values.set(point.doc, point.value);
        }

        // One cycle: colour tells the metrics apart. One metric: colour tells
        // the cycles apart. Both: colour is the cycle, dash is the metric.
        const colorIndex = multiCycle ? cycleIndex : metricIndex;
        const dash = multiCycle && multiMetric ? METRIC_DASHES[metricIndex % METRIC_DASHES.length] : undefined;

        list.push({
          id: key,
          cycleLabel: cycleLabels.get(cycleId) ?? "Cycle",
          metricLabel: def.label,
          unit: def.unit,
          axisGroup: def.axisGroup,
          color: CYCLE_COLORS[colorIndex % CYCLE_COLORS.length],
          dash,
          values,
          futureFromDoc,
        });
      });
    });

    return list;
  }, [selectedCycleIds, selectedMetrics, cycleById, pointsByKey, includePredicted, cycleLabels]);

  const maxDoc = useMemo(() => {
    let max = 0;
    for (const s of series) {
      if (hidden.has(s.id)) continue;
      for (const doc of s.values.keys()) if (doc > max) max = doc;
    }
    return max;
  }, [series, hidden]);

  const docFrom = docRange?.from ?? (maxDoc > 0 ? 1 : 0);
  const docTo = docRange?.to ?? Math.max(maxDoc, docFrom);
  const docRangeInputs = docRangeDraft ?? {
    from: String(docFrom),
    to: String(docTo),
  };
  const draftFrom = parseDocBound(docRangeInputs.from);
  const draftTo = parseDocBound(docRangeInputs.to);
  const docRangeInvalid =
    draftFrom == null ||
    draftTo == null ||
    draftFrom > draftTo ||
    draftTo > maxDoc;
  const sliderMax = Math.max(maxDoc, docTo, 1);

  function updateDocRangeInputs(next: DocRangeDraft) {
    setDocRangeDraft(next);
    const from = parseDocBound(next.from);
    const to = parseDocBound(next.to);
    if (from == null || to == null || from > to || to > maxDoc) return;
    setDocRange({ from, to });
  }

  function updateDocRange(from: number, to: number) {
    setDocRangeDraft({ from: String(from), to: String(to) });
    setDocRange({ from, to });
  }

  function resetDocRange() {
    setDocRangeDraft(null);
    setDocRange(null);
  }

  const toggleCycle = useCallback((cycleId: string) => {
    setSelectedCycleIds((current) =>
      current.includes(cycleId)
        ? current.filter((id) => id !== cycleId)
        : [...current, cycleId],
    );
  }, []);

  const toggleMetric = useCallback((metric: string) => {
    setSelectedMetrics((current) =>
      current.includes(metric) ? current.filter((m) => m !== metric) : [...current, metric],
    );
  }, []);

  const toggleSeries = useCallback((id: string) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function toggleMetricGroup(group: MetricGroup) {
    setOpenMetricGroups((current) =>
      current.includes(group) ? current.filter((g) => g !== group) : [...current, group],
    );
  }

  const gridSections = useMemo(() => {
    const needle = cycleFilter.trim().toLowerCase();
    return grids
      .filter((grid) => grid.farm_id === farmId)
      .map((grid) => {
        const gridPonds = ponds
          .filter((pond) => pond.grid_id === grid.id)
          .map((pond) => ({
            pond,
            cycles: cycles.filter((cycle) => {
              if (cycle.pond_id !== pond.id) return false;
              if (!needle) return true;
              return `${grid.name} ${pond.name} ${cycle.name}`.toLowerCase().includes(needle);
            }),
          }))
          .filter((entry) => entry.cycles.length > 0);
        return { grid, ponds: gridPonds };
      })
      .filter((section) => section.ponds.length > 0);
  }, [grids, ponds, cycles, cycleFilter, farmId]);

  if (!authChecked) return <main className="p-6 text-sm text-slate-500">Loading...</main>;

  const loading = loadingKeys.length > 0;

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <Link href="/" className="text-sm text-slate-500 hover:underline">
        &larr; Farm
      </Link>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Trend comparison</h1>
        {farms.length > 1 ? (
          <select
            value={farmId}
            onChange={(e) => setFarmId(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            {farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <section className="bg-white rounded-lg shadow">
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="font-medium">
            Cycles
            <span className="ml-2 text-sm font-normal text-slate-500">
              {selectedCycleIds.length} selected
            </span>
          </span>
          <span className="text-slate-400 text-sm">{pickerOpen ? "hide" : "show"}</span>
        </button>

        {pickerOpen ? (
          <div className="px-4 pb-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <input
                value={cycleFilter}
                onChange={(e) => setCycleFilter(e.target.value)}
                placeholder="Filter grid, pond or cycle"
                className="flex-1 min-w-[12rem] border rounded px-3 py-1.5 text-sm"
              />
              {selectedCycleIds.length ? (
                <button
                  onClick={() => setSelectedCycleIds([])}
                  className="text-sm border px-3 py-1.5 rounded text-slate-600"
                >
                  Clear
                </button>
              ) : null}
            </div>

            {gridSections.length === 0 ? (
              <p className="text-sm text-slate-500">No cycles match.</p>
            ) : (
              <div ref={pickerRef} className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {gridSections.map(({ grid, ponds: gridPonds }) => (
                  <div key={grid.id}>
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">
                      {grid.name}
                    </div>
                    <div className="space-y-1.5">
                      {gridPonds.map(({ pond, cycles: pondCycles }) => (
                        <div key={pond.id} className="pl-2 border-l-2 border-slate-100">
                          <div className="text-xs text-slate-500 mb-1">{pond.name}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {pondCycles.map((cycle) => {
                              const active = selectedCycleIds.includes(cycle.id);
                              return (
                                <button
                                  key={cycle.id}
                                  data-cycle-id={cycle.id}
                                  onClick={() => toggleCycle(cycle.id)}
                                  title={`${cycle.start_date} - ${cycle.actual_end_date ?? cycle.planned_end_date ?? "open"}`}
                                  className={`text-sm px-2.5 py-1 rounded border ${
                                    active
                                      ? "bg-primary text-white border-primary"
                                      : "bg-white text-slate-700 hover:bg-slate-50"
                                  }`}
                                >
                                  {cycle.name}
                                  <span
                                    className={`ml-1.5 text-xs ${active ? "text-teal-100" : "text-slate-400"}`}
                                  >
                                    {cycle.start_date.slice(0, 7)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section className="bg-white rounded-lg shadow p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium mr-1">Parameters</span>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => setSelectedMetrics(preset.metrics)}
              className="text-xs px-2 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {METRIC_GROUPS.map((group) => {
          const open = openMetricGroups.includes(group);
          const groupMetrics = METRIC_DEFS.filter((m) => m.group === group);
          const selectedInGroup = groupMetrics.filter((m) =>
            selectedMetrics.includes(m.key),
          ).length;

          return (
            <div key={group}>
              <button
                onClick={() => toggleMetricGroup(group)}
                className="w-full flex items-center justify-between text-left text-xs font-medium text-slate-500 mb-1.5"
              >
                <span>
                  {group}
                  {selectedInGroup ? (
                    <span className="ml-1.5 text-primary">({selectedInGroup})</span>
                  ) : null}
                </span>
                <span className="text-slate-400">{open ? "-" : "+"}</span>
              </button>
              {open ? (
                <div className="flex flex-wrap gap-1.5">
                  {groupMetrics.map((m) => {
                    const active = selectedMetrics.includes(m.key);
                    return (
                      <button
                        key={m.key}
                        onClick={() => toggleMetric(m.key)}
                        className={`text-sm px-2.5 py-1 rounded border ${
                          active
                            ? "bg-primary text-white border-primary"
                            : "bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </section>

      <section className="bg-white rounded-lg shadow p-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-slate-500">DOC</span>
          <input
            type="number"
            aria-label="First day of cycle"
            aria-invalid={docRangeInvalid}
            min={0}
            max={maxDoc}
            step={1}
            value={docRangeInputs.from}
            onChange={(e) =>
              updateDocRangeInputs({ ...docRangeInputs, from: e.target.value })
            }
            className={`w-16 border rounded px-2 py-1 ${
              docRangeInvalid ? "border-amber-400" : ""
            }`}
          />
          <span className="text-slate-400">to</span>
          <input
            type="number"
            aria-label="Last day of cycle"
            aria-invalid={docRangeInvalid}
            min={0}
            max={maxDoc}
            step={1}
            value={docRangeInputs.to}
            onChange={(e) =>
              updateDocRangeInputs({ ...docRangeInputs, to: e.target.value })
            }
            className={`w-16 border rounded px-2 py-1 ${
              docRangeInvalid ? "border-amber-400" : ""
            }`}
          />
          {docRange || docRangeDraft ? (
            <button
              onClick={resetDocRange}
              className="text-xs text-primary hover:underline"
            >
              reset
            </button>
          ) : null}
          {docRangeInvalid ? (
            <span className="text-xs text-amber-600">
              Chart remains at DOC {docFrom}-{docTo} until the range is valid.
            </span>
          ) : null}
        </div>

        <label className="flex items-center gap-1.5">
          <span className="text-slate-500">Smoothing</span>
          <select
            value={smoothWindow}
            onChange={(e) => setSmoothWindow(Number(e.target.value))}
            className="border rounded px-2 py-1"
          >
            {SMOOTH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={normalize}
            onChange={(e) => setNormalize(e.target.checked)}
          />
          <span className="text-slate-600">Normalize</span>
        </label>

        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={connectNulls}
            onChange={(e) => setConnectNulls(e.target.checked)}
          />
          <span className="text-slate-600">Connect gaps</span>
        </label>

        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={includePredicted}
            onChange={(e) => setIncludePredicted(e.target.checked)}
          />
          <span className="text-slate-600">Include forecast</span>
        </label>

        <span className="ml-auto text-xs text-slate-400">
          {loading ? "Loading..." : maxDoc ? `DOC 1-${maxDoc} with data` : "No data"}
        </span>

        <div className="basis-full grid gap-x-5 gap-y-1 border-t border-slate-100 pt-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-9">Start</span>
            <input
              type="range"
              aria-label="First day of cycle slider"
              min={0}
              max={Math.max(docTo, 0)}
              step={1}
              value={docFrom}
              disabled={maxDoc === 0}
              onChange={(e) => updateDocRange(Number(e.target.value), docTo)}
              className="min-w-0 flex-1 accent-teal-600"
            />
            <span className="w-8 text-right tabular-nums text-slate-700">{docFrom}</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-9">End</span>
            <input
              type="range"
              aria-label="Last day of cycle slider"
              min={docFrom}
              max={sliderMax}
              step={1}
              value={docTo}
              disabled={maxDoc === 0}
              onChange={(e) => updateDocRange(docFrom, Number(e.target.value))}
              className="min-w-0 flex-1 accent-teal-600"
            />
            <span className="w-8 text-right tabular-nums text-slate-700">{docTo}</span>
          </label>
        </div>
      </section>

      <DocTrendChart
        series={series}
        docFrom={docFrom}
        docTo={docTo}
        smoothWindow={smoothWindow}
        normalize={normalize}
        connectNulls={connectNulls}
        hidden={hidden}
        onToggleSeries={toggleSeries}
      />
    </main>
  );
}
