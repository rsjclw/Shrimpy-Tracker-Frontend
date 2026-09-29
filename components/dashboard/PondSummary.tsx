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

/** One figure in a summary line: an optional name, its value (an AM/PM pair flags each reading on its own) and its age. */
type Item = { id: string; name?: string; values: { text: string; bad?: boolean }[]; age?: number | null };

const plain = (text: string) => [{ text }];

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="w-12 shrink-0 text-[10px] uppercase tracking-[0.06em] text-tx-faint">{label}</span>
      {children}
    </div>
  );
}

// Items wrap whole onto the next line on narrow phones, so there is no separator to leave dangling.
function Items({ items }: { items: Item[] }) {
  return (
    <span className="flex min-w-0 flex-grow flex-wrap items-baseline gap-x-3.5 font-mono text-[13px] leading-5">
      {items.map((it) => (
        <span key={it.id} className="inline-flex items-baseline gap-1 whitespace-nowrap">
          {it.name ? <span className="font-sans text-[11px] text-tx-faint">{it.name}</span> : null}
          <span>
            {it.values.map((v, i) => (
              <Fragment key={i}>
                {i ? <span className="text-tx-faint">/</span> : null}
                <span className={v.bad ? "text-bad" : "text-tx"}>{v.text}</span>
              </Fragment>
            ))}
          </span>
          {it.age ? <Age days={it.age} /> : null}
        </span>
      ))}
    </span>
  );
}

/**
 * Today at a glance on a collapsed pond card: the day's feeds in one line and the
 * numbers people would otherwise open the card for, as plain lines rather than the
 * open card's tiles. Figures are taken the same way the open card takes them.
 * `days` is today first, then the older days of the loaded window.
 */
export function PondSummary({ days, growth, today, now }: { days: DayView[]; growth: Growth | null; today: string; now: string }) {
  const day = days[0]?.date === today ? days[0] : null;
  const feedings = day ? sortFeedings(day.feedings) : [];
  const statuses = day ? feedStatuses(day.feedings, "today", now) : [];
  const last = (growth?.samplings ?? []).filter((s) => s.date <= today).at(-1) ?? null;

  const water = (id: "ph" | "do", name: string): Item => {
    const t = WATER_TILES.find((w) => w.id === id)!;
    const readings = t.keys.map((k) => latestReading(days, k));
    const oldest = readings.flatMap((r) => (r ? [r.date] : [])).sort()[0];
    return {
      id,
      name,
      values: readings.some(Boolean) ? readings.map((r, i) => (r ? { text: fmtNum(r.value, 2), bad: outOfRange(t.keys[i], r.value) } : { text: "—" })) : plain("—"),
      age: oldest ? daysBetween(oldest, today) : null,
    };
  };

  // No sampling yet means no ABW, so any biomass figure would be a made-up zero.
  const biomass = day && last && Number.isFinite(num(day.metrics.estimated_biomass_kg)) ? `${fmtInt(day.metrics.estimated_biomass_kg)} kg` : "—";

  return (
    <div className="flex flex-col gap-1">
      <Line label="Feed">
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
      </Line>
      <Line label="Total">
        <Items
          items={[
            { id: "feed", values: plain(day ? `${fmtInt(cumulativeFeed(day))} kg` : "—") },
            { id: "fcr", name: "FCR", values: plain(last?.fcr !== null && last?.fcr !== undefined ? last.fcr.toFixed(2) : "—") },
          ]}
        />
      </Line>
      <Line label="Shrimp">
        <Items
          items={[
            { id: "abw", name: "ABW", values: plain(last ? `${fmtDec(last.abw, 1)} g` : "—"), age: last ? daysBetween(last.date, today) : null },
            { id: "biomass", name: "Biomass", values: plain(biomass) },
          ]}
        />
      </Line>
      <Line label="Water">
        <Items items={[water("ph", "pH"), water("do", "DO")]} />
      </Line>
    </div>
  );
}
