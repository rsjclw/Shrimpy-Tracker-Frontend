"use client";

import { addDays, format, parseISO } from "date-fns";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { TrendChart } from "@/components/TrendChart";
import { api, type Cycle, type TrendPoint } from "@/lib/api";

const DAILY_METRICS: { key: string; label: string }[] = [
  { key: "daily_feed_kg", label: "Daily feed" },
  { key: "cumulative_feed_start_kg", label: "Cumulative feed (start)" },
  { key: "cumulative_feed_end_kg", label: "Cumulative feed (end)" },
  { key: "abw_g", label: "ABW" },
  { key: "estimated_population", label: "Population" },
  { key: "estimated_biomass_kg", label: "Biomass" },
  { key: "harvest_biomass_kg", label: "Harvest biomass" },
  { key: "fcr", label: "FCR" },
  { key: "sample_fcr", label: "Sample FCR" },
];

const WATER_METRICS: { key: string; label: string }[] = [
  { key: "do_am", label: "DO am" },
  { key: "do_pm", label: "DO pm" },
  { key: "ph_am", label: "pH am" },
  { key: "ph_pm", label: "pH pm" },
  { key: "salinity", label: "Salinity" },
  { key: "tan", label: "TAN" },
  { key: "nitrite", label: "Nitrite" },
  { key: "phosphate", label: "Phosphate" },
  { key: "calcium", label: "Calcium" },
  { key: "magnesium", label: "Magnesium" },
  { key: "alkalinity", label: "Alkalinity" },
];

const METRICS = [...DAILY_METRICS, ...WATER_METRICS];

function todayIso() {
  return format(new Date(), "yyyy-MM-dd");
}

function addDaysIso(iso: string, days: number) {
  return format(addDays(parseISO(iso), days), "yyyy-MM-dd");
}

function minIso(a: string, b: string) {
  return a <= b ? a : b;
}

function maxIso(a: string, b: string) {
  return a >= b ? a : b;
}

export default function TrendsPage() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const search = useSearchParams();
  const router = useRouter();

  const metric = search.get("metric") ?? "daily_feed_kg";
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedFrom, setSelectedFrom] = useState("");
  const [selectedTo, setSelectedTo] = useState("");
  const [points, setPoints] = useState<TrendPoint[]>([]);

  useEffect(() => {
    api.getCycle(cycleId).then((c) => {
      const fullEndDate = maxIso(
        c.start_date,
        c.actual_end_date ?? c.planned_end_date ?? addDaysIso(todayIso(), 30),
      );

      setCycle(c);
      setFrom(c.start_date);
      setTo(fullEndDate);
      setSelectedFrom(c.start_date);
      setSelectedTo(fullEndDate);
    });
  }, [cycleId]);

  const reload = useCallback(async () => {
    if (!from || !to) return;
    const series = await api.getCycleTrend(cycleId, metric, from, to);
    setPoints(series.points);
  }, [cycleId, metric, from, to]);

  useEffect(() => {
    reload();
  }, [reload]);

  function setMetric(m: string) {
    router.replace(`/cycles/${cycleId}/trends?metric=${m}`);
  }

  function pointIndexAtOrAfter(date: string) {
    const index = points.findIndex((point) => point.date >= date);
    return index >= 0 ? index : Math.max(points.length - 1, 0);
  }

  function pointIndexAtOrBefore(date: string) {
    for (let i = points.length - 1; i >= 0; i -= 1) {
      if (points[i].date <= date) return i;
    }
    return 0;
  }

  function applyRangePreset(preset: "all" | "toToday" | "last30" | "next30") {
    if (!from || !to) return;

    const boundedToday = minIso(maxIso(todayIso(), from), to);
    let nextFrom = from;
    let nextTo = to;

    if (preset === "toToday") {
      nextTo = boundedToday;
    }

    if (preset === "last30") {
      nextTo = boundedToday;
      nextFrom = maxIso(from, addDaysIso(nextTo, -29));
    }

    if (preset === "next30") {
      nextFrom = boundedToday;
      nextTo = minIso(to, addDaysIso(nextFrom, 29));
    }

    setSelectedFrom(nextFrom);
    setSelectedTo(nextTo);
  }

  const brushStartIndex = points.length ? pointIndexAtOrAfter(selectedFrom || from) : 0;
  const brushEndIndex = points.length
    ? Math.max(brushStartIndex, pointIndexAtOrBefore(selectedTo || to))
    : 0;

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <Link href={`/cycles/${cycleId}`} className="text-sm text-slate-500 hover:underline">
        &larr; Back to cycle
      </Link>
      <h1 className="text-2xl font-semibold">{cycle?.name ?? "..."} - trends</h1>

      <div className="space-y-3">
        <div>
          <div className="text-xs font-medium text-slate-500 mb-2">Daily metrics</div>
          <div className="flex flex-wrap gap-2">
            {DAILY_METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`text-sm px-3 py-1 rounded border ${
                  metric === m.key
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-slate-700"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-500 mb-2">Water parameters</div>
          <div className="flex flex-wrap gap-2">
            {WATER_METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`text-sm px-3 py-1 rounded border ${
                  metric === m.key
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-slate-700"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => applyRangePreset("all")}
            className="text-sm px-3 py-1 rounded border bg-white text-slate-700 hover:bg-slate-50"
          >
            All
          </button>
          <button
            onClick={() => applyRangePreset("toToday")}
            className="text-sm px-3 py-1 rounded border bg-white text-slate-700 hover:bg-slate-50"
          >
            To today
          </button>
          <button
            onClick={() => applyRangePreset("last30")}
            className="text-sm px-3 py-1 rounded border bg-white text-slate-700 hover:bg-slate-50"
          >
            Last 30
          </button>
          <button
            onClick={() => applyRangePreset("next30")}
            className="text-sm px-3 py-1 rounded border bg-white text-slate-700 hover:bg-slate-50"
          >
            Next 30
          </button>
        </div>
        <div className="text-xs text-slate-500">
          {selectedFrom && selectedTo ? `${selectedFrom} - ${selectedTo}` : "Loading range"}
        </div>
      </div>

      <TrendChart
        metric={METRICS.find((m) => m.key === metric)?.label ?? metric}
        points={points}
        startDate={cycle?.start_date ?? from}
        brushStartIndex={brushStartIndex}
        brushEndIndex={brushEndIndex}
        onRangeChange={(range) => {
          setSelectedFrom(range.startDate);
          setSelectedTo(range.endDate);
        }}
      />
    </main>
  );
}
