"use client";

import { useState } from "react";

import type { DayView } from "@/lib/api";
import { daysBetween, docFor, mediumDate, nowHHMM, shortDate, todayIso } from "@/lib/dates";
import { cumulativeFeed } from "@/lib/feed";
import { fmtDec, fmtInt, num } from "@/lib/num";
import { DetailPanel, type DetailRow, type MiniChartData } from "./DetailPanel";
import { dayFeedKg } from "./model";
import type { Growth } from "./usePondData";

type StatId = "dailyFeed" | "totalFeed" | "abw" | "biomass" | "adg" | "fcr" | "population" | "harvested";
export type LogKind = "sampling" | "harvest" | "population";

const STATS: { id: StatId; label: string; metric: string }[] = [
  { id: "dailyFeed", label: "Daily feed", metric: "daily_feed_kg" },
  { id: "totalFeed", label: "Total feed", metric: "cumulative_feed" },
  { id: "abw", label: "ABW", metric: "abw_g" },
  { id: "biomass", label: "Biomass", metric: "estimated_biomass_kg" },
  { id: "adg", label: "ADG", metric: "adg_g_per_day" },
  { id: "fcr", label: "FCR", metric: "fcr" },
  { id: "population", label: "Population", metric: "estimated_population" },
  { id: "harvested", label: "Harvested", metric: "harvest_biomass_kg" },
];

const ACCENT = "#2DD4BF";

/** The 2x4 grid of growth/feed numbers, each opening a detail panel. */
export function GrowthStats({
  startDate,
  day,
  todayDay,
  growth,
  trendsHref,
  onLog,
  canLog,
}: {
  startDate: string;
  day: DayView;
  /** Today's day view, for the "fed so far" point on the cumulative chart. */
  todayDay: DayView | null;
  growth: Growth | null;
  trendsHref: (metric: string) => string;
  onLog: (kind: LogKind) => void;
  canLog: (kind: LogKind) => boolean;
}) {
  const [open, setOpen] = useState<StatId | null>(null);
  const viewDate = day.date;
  const doc = (iso: string) => docFor(startDate, iso);
  const age = (iso: string) => daysBetween(iso, viewDate);

  const samplings = (growth?.samplings ?? []).filter((s) => s.date <= viewDate);
  const last = samplings.at(-1) ?? null;
  const prev = samplings.at(-2) ?? null;
  const harvests = (growth?.harvests ?? []).filter((h) => h.date <= viewDate);
  const harvested = harvests.reduce((t, h) => t + h.kg, 0);
  const lastHarvest = harvests.at(-1) ?? null;
  const popMap = new Map((growth?.population ?? []).map((p) => [p.date, p.value]));

  const tile = (id: StatId): { value: string; sub: string; age: number | null } => {
    switch (id) {
      case "dailyFeed": {
        const kg = dayFeedKg(day);
        return { value: kg ? `${fmtDec(kg, 1)} kg` : "—", sub: "", age: null };
      }
      case "totalFeed":
        return { value: `${fmtInt(cumulativeFeed(day))} kg`, sub: day.date === todayIso() ? `as of ${nowHHMM()}` : "", age: null };
      case "abw":
        return { value: last ? `${fmtDec(last.abw, 1)} g` : "—", sub: prev ? `${fmtDec(prev.abw, 1)} g` : "", age: last ? age(last.date) : null };
      case "biomass":
        return {
          // No sampling yet means no ABW, so any biomass figure would be a made-up zero.
          value: last && Number.isFinite(num(day.metrics.estimated_biomass_kg)) ? `${fmtInt(day.metrics.estimated_biomass_kg)} kg` : "—",
          sub: "",
          age: last ? age(last.date) : null,
        };
      case "adg":
        return {
          value: last?.adg !== null && last?.adg !== undefined ? `${last.adg.toFixed(2)} g/day` : "—",
          sub: prev?.adg !== null && prev?.adg !== undefined ? `${prev.adg.toFixed(2)} g/day` : "",
          age: last ? age(last.date) : null,
        };
      case "fcr":
        return {
          value: last?.fcr !== null && last?.fcr !== undefined ? last.fcr.toFixed(2) : "—",
          sub: prev?.fcr !== null && prev?.fcr !== undefined ? prev.fcr.toFixed(2) : "",
          age: last ? age(last.date) : null,
        };
      case "population":
        return { value: day.metrics.estimated_population !== null ? fmtInt(day.metrics.estimated_population) : "—", sub: "", age: null };
      case "harvested":
        return { value: `${fmtInt(harvested)} kg`, sub: lastHarvest ? `+${fmtInt(lastHarvest.kg)} kg` : "", age: lastHarvest ? age(lastHarvest.date) : null };
    }
  };

  function detail(id: StatId) {
    const minX = (xs: number[]) => (xs.length ? Math.min(...xs, doc(viewDate) - 1) : doc(viewDate) - 1);
    const chart = (points: { x: number; y: number }[], color = ACCENT, format?: (v: number) => string): MiniChartData => {
      const xMin = minX(points.map((p) => p.x));
      return {
        series: [{ color, points }],
        xMin,
        xMax: doc(viewDate),
        xStart: `D${Math.max(1, xMin)}`,
        xEnd: `D${doc(viewDate)}`,
        format,
      };
    };
    const whenSampled = (iso: string, extra = "") => `Measured ${age(iso) === 0 ? "today" : age(iso) === 1 ? "1 day ago" : `${age(iso)} days ago`} · ${mediumDate(iso)} · DOC ${doc(iso)}${extra}`;
    const row = (iso: string, value: React.ReactNode): DetailRow => ({ key: iso, doc: `D${doc(iso)}`, date: mediumDate(iso), value });

    if (id === "abw" || id === "adg" || id === "fcr" || id === "biomass") {
      const val = (s: (typeof samplings)[number]) =>
        id === "abw" ? s.abw : id === "adg" ? s.adg : id === "fcr" ? s.fcr : popMap.has(s.date) ? (s.abw * (popMap.get(s.date) ?? 0)) / 1000 : null;
      const fmt = (v: number | null) =>
        v === null ? "—" : id === "abw" ? `${v.toFixed(1)} g` : id === "adg" ? `${v.toFixed(2)} g/day` : id === "fcr" ? v.toFixed(2) : `${fmtInt(v)} kg`;
      const withVal = samplings.filter((s) => val(s) !== null).slice(-8);
      const t = tile(id);
      return {
        lines: [{ value: t.value, when: last ? whenSampled(last.date, id === "biomass" ? " · ABW × population" : "") : "No sampling yet" }],
        chart: chart(withVal.map((s) => ({ x: doc(s.date), y: val(s) as number }))),
        legend: [{ label: "Sampling", color: ACCENT }],
        rows: [...samplings].reverse().slice(0, 6).map((s) => row(s.date, fmt(val(s)))),
        action: canLog("sampling") ? { label: "+ Sampling", onClick: () => onLog("sampling") } : undefined,
      };
    }
    if (id === "population") {
      const pts = (growth?.population ?? []).filter((p) => p.date <= viewDate);
      const changes = pts.filter((p, i) => i === 0 || p.value !== pts[i - 1].value);
      return {
        lines: [{ value: tile(id).value, when: changes.length ? `Last changed ${shortDate(changes.at(-1)!.date)} · DOC ${doc(changes.at(-1)!.date)} · counts and harvests` : "No estimate yet" }],
        chart: chart(pts.slice(-30).map((p) => ({ x: doc(p.date), y: p.value })), "#C084FC", (v) => fmtInt(v)),
        legend: [{ label: "Estimate", color: "#C084FC" }],
        rows: [...changes].reverse().slice(0, 6).map((p) => row(p.date, fmtInt(p.value))),
        action: canLog("population") ? { label: "+ Population", onClick: () => onLog("population") } : undefined,
      };
    }
    if (id === "harvested") {
      let cum = 0;
      const pts = harvests.map((h) => ({ x: doc(h.date), y: (cum += h.kg) }));
      return {
        lines: [{ value: tile(id).value, when: lastHarvest ? `${whenSampled(lastHarvest.date).replace("Measured", "Harvested")} · +${fmtInt(lastHarvest.kg)} kg` : "No harvest yet this cycle" }],
        chart: chart(pts, "#FBBF24", (v) => fmtInt(v)),
        legend: [{ label: "Cumulative kg", color: "#FBBF24" }],
        rows: [...harvests].reverse().slice(0, 6).map((h) => row(h.date, `+${fmtInt(h.kg)} kg`)),
        action: canLog("harvest") ? { label: "+ Harvest", onClick: () => onLog("harvest") } : undefined,
      };
    }
    const today = todayIso();
    const src =
      id === "dailyFeed"
        ? growth?.dailyFeed ?? []
        : (growth?.cumulativeFeed ?? []).map((p) => (p.date === today && todayDay ? { ...p, value: cumulativeFeed(todayDay) } : p));
    const pts = src.filter((p) => p.date <= viewDate && p.date >= startDate).slice(-14);
    return {
      lines: [
        {
          value: tile(id).value,
          when:
            id === "dailyFeed"
              ? `Sum of the feed schedule · ${mediumDate(viewDate)} · DOC ${doc(viewDate)}`
              : viewDate === todayIso()
                ? `Fed so far · every feed up to ${nowHHMM()} today · DOC ${doc(viewDate)}`
                : `Cumulative to the end of ${mediumDate(viewDate)} · DOC ${doc(viewDate)}${viewDate > todayIso() ? " · planned" : ""}`,
        },
      ],
      chart: chart(pts.map((p) => ({ x: doc(p.date), y: p.value })), ACCENT, (v) => fmtInt(v)),
      legend: [{ label: id === "dailyFeed" ? "kg per day" : "Cumulative kg", color: ACCENT }],
      rows: [...pts].reverse().slice(0, 6).map((p) => row(p.date, `${fmtInt(p.value)} kg`)),
      action: undefined,
    };
  }

  const openDetail = open ? detail(open) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {STATS.map((s) => {
          const t = tile(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setOpen(open === s.id ? null : s.id)}
              aria-expanded={open === s.id}
              aria-label={`${s.label} details`}
              className={`flex min-w-0 flex-col gap-[3px] rounded-[10px] border bg-ink-850 px-2.5 py-2 text-left ${open === s.id ? "border-accent" : "border-ink-850"}`}
            >
              <div className="text-[10px] uppercase tracking-[0.06em] text-tx-faint">{s.label}</div>
              <div className="truncate font-mono text-sm font-semibold text-tx">{t.value}</div>
              <div className="flex min-h-3 items-center justify-between gap-1.5">
                <span className="truncate font-mono text-[10px] text-tx-faint">{t.sub}</span>
                {t.age ? <Age days={t.age} /> : null}
              </div>
            </button>
          );
        })}
      </div>
      {open && openDetail ? (
        <DetailPanel
          title={STATS.find((s) => s.id === open)!.label}
          lines={openDetail.lines}
          chart={openDetail.chart}
          legend={openDetail.legend}
          rows={openDetail.rows}
          action={openDetail.action}
          loading={!growth}
          fullChartHref={trendsHref(STATS.find((s) => s.id === open)!.metric)}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

/** Clock + "3d": how old the shown reading is relative to the viewed day. */
export function Age({ days }: { days: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-[3px] text-tx-faint" title={`Last reading ${days} day${days === 1 ? "" : "s"} before this day`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </svg>
      <span className="font-mono text-[10px]">{days}d</span>
    </span>
  );
}
