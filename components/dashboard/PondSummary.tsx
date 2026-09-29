"use client";

import { Fragment } from "react";

import type { DayView } from "@/lib/api";
import { daysBetween } from "@/lib/dates";
import { cumulativeFeed } from "@/lib/feed";
import { fmtDec, fmtInt, fmtNum, num } from "@/lib/num";
import { outOfRange } from "@/lib/thresholds";
import { Age } from "./GrowthStats";
import { WATER_TILES, dayFeedKg, feedStatuses, latestReading, sortFeedings, type FeedStatus } from "./model";
import type { Growth } from "./usePondData";

// Fed amounts read plainly, the next one in accent, later ones dimmed, missed ones amber.
const FEED_TONE: Record<FeedStatus, string> = {
  done: "text-tx",
  inprogress: "font-semibold text-accent",
  next: "font-semibold text-accent",
  missed: "text-warn",
  upcoming: "text-tx-faint",
  planned: "text-tx-faint",
  notlogged: "text-tx-faint",
};

type Tile = { id: string; label: React.ReactNode; value: string; bad?: boolean; age?: number | null };

/**
 * Today at a glance on a collapsed pond card: the day's feeds in one line and the
 * numbers people would otherwise open the card for, taken the same way the open
 * card takes them. `days` is today first, then the older days of the loaded window.
 */
export function PondSummary({ days, growth, today, now }: { days: DayView[]; growth: Growth | null; today: string; now: string }) {
  const day = days[0]?.date === today ? days[0] : null;
  const feedings = day ? sortFeedings(day.feedings) : [];
  const statuses = day ? feedStatuses(day.feedings, "today", now) : [];
  const last = (growth?.samplings ?? []).filter((s) => s.date <= today).at(-1) ?? null;

  const water = (id: "ph" | "do", name: string): Tile => {
    const t = WATER_TILES.find((w) => w.id === id)!;
    const readings = t.keys.map((k) => latestReading(days, k));
    const oldest = readings.flatMap((r) => (r ? [r.date] : [])).sort()[0];
    return {
      id,
      // "AM/PM" only where it fits beside an age badge; the "a/b" value says it is two readings anyway.
      label: (
        <>
          {name}
          <span className="hidden min-[400px]:inline"> AM/PM</span>
        </>
      ),
      value: readings.some(Boolean) ? readings.map((r) => (r ? fmtNum(r.value, 2) : "—")).join("/") : "—",
      bad: t.keys.some((k, i) => outOfRange(k, readings[i]?.value)),
      age: oldest ? daysBetween(oldest, today) : null,
    };
  };

  const tiles: Tile[] = [
    { id: "feed", label: "Total feed", value: day ? `${fmtInt(cumulativeFeed(day))} kg` : "—" },
    // No sampling yet means no ABW, so any biomass figure would be a made-up zero.
    { id: "biomass", label: "Biomass", value: day && last && Number.isFinite(num(day.metrics.estimated_biomass_kg)) ? `${fmtInt(day.metrics.estimated_biomass_kg)} kg` : "—" },
    { id: "abw", label: "ABW", value: last ? `${fmtDec(last.abw, 1)} g` : "—", age: last ? daysBetween(last.date, today) : null },
    { id: "fcr", label: "FCR", value: last?.fcr !== null && last?.fcr !== undefined ? last.fcr.toFixed(2) : "—" },
    water("ph", "pH"),
    water("do", "DO"),
  ];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2.5">
        <span className="w-9 shrink-0 text-[10px] uppercase tracking-[0.06em] text-tx-faint">Feed</span>
        <span className="min-w-0 flex-grow font-mono text-[13px] leading-5">
          {feedings.length ? (
            feedings.map((f, i) => (
              <Fragment key={f.id}>
                {i ? <span className="text-tx-ghost">, </span> : null}
                <span className={`whitespace-nowrap ${FEED_TONE[statuses[i]]}`}>{fmtNum(f.amount_kg, 1)}</span>
              </Fragment>
            ))
          ) : (
            <span className="text-tx-faint">{day ? "None scheduled" : "—"}</span>
          )}
        </span>
        {feedings.length ? <span className="shrink-0 font-mono text-[13px] font-semibold text-tx-strong">{fmtDec(dayFeedKg(day), 1)} kg</span> : null}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {tiles.map((t) => (
          <div key={t.id} className="flex min-w-0 flex-col gap-[3px] rounded-[10px] bg-ink-850 px-2 py-[7px]">
            <div className="flex min-w-0 items-center justify-between gap-1">
              <span className="truncate text-[10px] uppercase tracking-[0.05em] text-tx-faint">{t.label}</span>
              {t.age ? <Age days={t.age} /> : null}
            </div>
            <span className={`truncate font-mono text-[13px] font-semibold ${t.bad ? "text-bad" : "text-tx"}`}>{t.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
