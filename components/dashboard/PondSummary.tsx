"use client";

import { Fragment } from "react";

import type { DayView } from "@/lib/api";
import { daysBetween } from "@/lib/dates";
import { cumulativeFeed } from "@/lib/feed";
import { fmtDec, fmtInt, fmtNum, fmtPow10, num } from "@/lib/num";
import { outOfRange, shareTooHigh } from "@/lib/thresholds";
import { Age } from "./GrowthStats";
import {
  BACTERIA_FIELDS,
  PLANKTON_DEFS,
  VIBRIO_DEFS,
  WATER_TILES,
  dayFeedKg,
  feedStatuses,
  latestReading,
  latestSampleDay,
  sortFeedings,
  sumKeys,
  type FeedStatus,
} from "./model";
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
const share = (v: number, of: number) => `${Math.round((v / of) * 100)}%`;

const PLANKTON_KEYS = PLANKTON_DEFS.map((d) => d.key);
const BACTERIA_KEYS = BACTERIA_FIELDS.map((f) => f.key);
const VIBRIO_KEYS = VIBRIO_DEFS.map((d) => d.key);

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="w-14 shrink-0 text-[10px] uppercase tracking-[0.06em] text-tx-faint">{label}</span>
      {children}
    </div>
  );
}

// Items wrap whole onto the next line on narrow phones, so there is no separator to leave dangling.
function Items({ items }: { items: Item[] }) {
  // Readings taken together (minerals tested the same day) get one age badge at the end, not the same "3d" after each.
  const aged = items.filter((it) => it.age !== undefined && it.age !== null);
  const shared = aged.length > 1 && aged.every((it) => it.age === aged[0].age) ? aged[0].age : null;
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
          {it.age && shared === null ? <Age days={it.age} /> : null}
        </span>
      ))}
      {shared ? <Age days={shared} /> : null}
    </span>
  );
}

/**
 * Today at a glance on a collapsed pond card: the day's feeds in one line and the
 * numbers people would otherwise open the card for, as plain lines rather than the
 * open card's tiles. Figures are taken the same way the open card takes them.
 * `days` is today first, then the older days of the loaded window.
 */
export function PondSummary({
  days,
  growth,
  today,
  now,
  preparing = false,
}: {
  days: DayView[];
  growth: Growth | null;
  today: string;
  now: string;
  /** No shrimp yet: no feed, total or shrimp lines. */
  preparing?: boolean;
}) {
  const day = days[0]?.date === today ? days[0] : null;
  const feedings = day ? sortFeedings(day.feedings) : [];
  const statuses = day ? feedStatuses(day.feedings, "today", now) : [];
  const last = (growth?.samplings ?? []).filter((s) => s.date <= today).at(-1) ?? null;

  const water = (id: string, name: string): Item => {
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

  // Plankton and bacteria are each one lab sample: the latest day any of their fields was filled, as the open card takes it.
  const plankton = latestSampleDay(days, PLANKTON_KEYS);
  const pTotal = sumKeys(plankton, PLANKTON_KEYS);
  const planktonItems: Item[] =
    pTotal > 0
      ? [
          { id: "total", values: [{ text: fmtPow10(pTotal), bad: outOfRange("total_plankton", pTotal) }], age: daysBetween(plankton!.date, today) },
          // Only each group's share; the counts stay in the open card.
          ...PLANKTON_DEFS.flatMap((d) => {
            const v = num(plankton?.water?.[d.key]);
            return Number.isFinite(v) ? [{ id: d.key, name: d.key === "plankton_zoo" ? "Zoo" : d.label, values: [{ text: share(v, pTotal), bad: shareTooHigh(d.key, v, pTotal) }] }] : [];
          }),
        ]
      : [{ id: "total", values: plain("—") }];

  const bacteria = latestSampleDay(days, BACTERIA_KEYS);
  const tbc = num(bacteria?.water?.tbc);
  // A sample with only TBC filled in must not read as zero vibrio.
  const vibrioCounted = VIBRIO_KEYS.some((k) => Number.isFinite(num(bacteria?.water?.[k])));
  const tvc = sumKeys(bacteria, VIBRIO_KEYS);
  const tvcPct = vibrioCounted && Number.isFinite(tbc) && tbc > 0 ? (tvc / tbc) * 100 : Number.NaN;
  const bacteriaItems: Item[] = [
    { id: "tbc", name: "TBC", values: plain(fmtPow10(tbc)), age: bacteria ? daysBetween(bacteria.date, today) : null },
    { id: "tvcPct", name: "TVC/TBC", values: [{ text: Number.isFinite(tvcPct) ? `${fmtNum(tvcPct, 1)}%` : "—", bad: outOfRange("vibrio_percentage", tvcPct) }] },
  ];
  // Counts in cfu/mL, each colour flagged on its own limit: as a share, a harmless 100 yellow would read "100%".
  const vibrioItems: Item[] = VIBRIO_DEFS.flatMap((d) => {
    const v = num(bacteria?.water?.[d.key]);
    return Number.isFinite(v) ? [{ id: d.key, name: d.label, values: [{ text: fmtInt(v), bad: outOfRange(d.key, v) }] }] : [];
  });

  return (
    <div className="flex flex-col gap-1">
      {!preparing ? (
        <>
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
            // Today's, as the feed schedule header shows it; no feeds yet means none.
            { id: "fi", name: "FI", values: plain(day && Number.isFinite(num(day.metrics.feeding_index)) ? num(day.metrics.feeding_index).toFixed(3) : "—") },
          ]}
        />
      </Line>
      <Line label="Shrimp">
        <Items
          items={[
            { id: "abw", name: "ABW", values: plain(last ? `${fmtDec(last.abw, 1)} g` : "—"), age: last ? daysBetween(last.date, today) : null },
            // ADG between the last two samplings, as the open card's ADG tile; same sampling, so one shared age.
            { id: "adg", name: "ADG", values: plain(last?.adg !== null && last?.adg !== undefined ? `${last.adg.toFixed(2)} g/day` : "—"), age: last ? daysBetween(last.date, today) : null },
          ]}
        />
      </Line>
      <Line label="">
        <Items
          items={[
            { id: "biomass", name: "Biomass", values: plain(biomass) },
            { id: "pop", name: "Pop", values: plain(day && day.metrics.estimated_population !== null ? fmtInt(day.metrics.estimated_population) : "—") },
          ]}
        />
      </Line>
        </>
      ) : null}
      <Line label="Water">
        <Items items={[water("ph", "pH"), water("do", "DO")]} />
      </Line>
      {/* Fixed groups, one line each, so every card breaks in the same place. */}
      <Line label="">
        <Items items={[water("clarity", "Clarity"), water("salinity", "Salinity")]} />
      </Line>
      <Line label="">
        <Items items={[water("tan", "TAN"), water("phosphate", "PO₄"), water("nitrite", "NO₂")]} />
      </Line>
      <Line label="">
        <Items items={[water("alkalinity", "Alk"), water("calcium", "Ca"), water("magnesium", "Mg")]} />
      </Line>
      <Line label="Plankton">
        <Items items={planktonItems} />
      </Line>
      <Line label="Bacteria">
        <Items items={bacteriaItems} />
      </Line>
      {/* Vibrio on its own line, like the water nutrients, so every card breaks in the same place. */}
      {vibrioItems.length ? (
        <Line label="Vibrio">
          <Items items={vibrioItems} />
        </Line>
      ) : null}
    </div>
  );
}
