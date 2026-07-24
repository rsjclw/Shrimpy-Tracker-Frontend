"use client";

import Link from "next/link";

import type { DayMetrics } from "@/lib/api";

type Props = {
  cycleId: string;
  metrics: DayMetrics;
};

function fmt(v: string | number | null | undefined, suffix = "") {
  if (v === null || v === undefined) return "—";
  return `${v}${suffix}`;
}

export function DailyMetricsCard({ cycleId, metrics }: Props) {
  const items: { label: string; value: string; metric: string }[] = [
    { label: "Daily feed", value: fmt(metrics.daily_feed_kg, " kg"), metric: "daily_feed_kg" },
    {
      label: "Cumulative feed (start)",
      value: fmt(metrics.cumulative_feed_start_kg, " kg"),
      metric: "cumulative_feed_start_kg",
    },
    {
      label: "Cumulative feed (end)",
      value: fmt(metrics.cumulative_feed_end_kg, " kg"),
      metric: "cumulative_feed_end_kg",
    },
    { label: "ABW", value: fmt(metrics.abw_g, " g"), metric: "abw_g" },
    { label: "ADG (est)", value: fmt(metrics.estimated_adg_g_per_day, " g/day"), metric: "adg_g_per_day" },
    {
      label: "Population (est)",
      value:
        metrics.estimated_population != null
          ? metrics.estimated_population.toLocaleString()
          : "—",
      metric: "estimated_population",
    },
    {
      label: "Biomass (est)",
      value: fmt(metrics.estimated_biomass_kg, " kg"),
      metric: "estimated_biomass_kg",
    },
    {
      label: "Harvest biomass",
      value: fmt(metrics.harvest_biomass_kg, " kg"),
      metric: "harvest_biomass_kg",
    },
    { label: "FCR (overall est)", value: fmt(metrics.fcr), metric: "fcr" },
  ];

  return (
    <section className="bg-white rounded-lg shadow p-4 space-y-3">
      <h3 className="font-medium">Daily metrics</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((it) => (
          <Link
            key={it.metric}
            href={`/trends?cycles=${cycleId}&metrics=${it.metric}`}
            className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition"
          >
            <div className="text-xs text-slate-500">{it.label}</div>
            <div className="text-lg font-semibold">{it.value}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
