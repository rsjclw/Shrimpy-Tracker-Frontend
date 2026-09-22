"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api, type Cycle, type DayView, type TrendSeries } from "@/lib/api";
import { addDays, daysBetween, todayIso } from "@/lib/dates";
import { num } from "@/lib/num";

/** Days of history loaded behind the viewed day, for "last reading N days ago" and detail rows. */
export const HISTORY_DAYS = 14;

export type Sampling = { date: string; abw: number; adg: number | null; fcr: number | null };
export type HarvestPoint = { date: string; kg: number };

export type Growth = {
  samplings: Sampling[]; // oldest first
  harvests: HarvestPoint[]; // oldest first
  population: { date: string; value: number }[];
  dailyFeed: { date: string; value: number }[];
  cumulativeFeed: { date: string; value: number }[];
};

const GROWTH_METRICS = ["abw_g", "fcr", "harvest_biomass_kg", "estimated_population", "daily_feed_kg", "cumulative_feed_end_kg"];

function valueMap(series: TrendSeries | undefined) {
  const map = new Map<string, number>();
  series?.points.forEach((p) => {
    const v = num(p.value);
    if (Number.isFinite(v)) map.set(p.date, v);
  });
  return map;
}

function toGrowth(all: TrendSeries[], cycle: Cycle): Growth {
  const [abw, fcr, harvest, pop, feed, cum] = all;
  const fcrMap = valueMap(fcr);
  // ADG is the gain between samplings (the first one counts from stocking), not the backend's
  // day-by-day estimate, which jumps on a sampling day.
  let prev = { date: cycle.start_date, abw: num(cycle.initial_abw_g) || 0 };
  const samplings: Sampling[] = abw.points
    .filter((p) => p.is_sampling_day && Number.isFinite(num(p.value)))
    .map((p) => {
      const days = daysBetween(prev.date, p.date);
      const s = { date: p.date, abw: num(p.value), adg: days > 0 ? (num(p.value) - prev.abw) / days : null, fcr: fcrMap.get(p.date) ?? null };
      prev = { date: p.date, abw: s.abw };
      return s;
    });
  const harvests = harvest.points
    .filter((p) => num(p.value) > 0)
    .map((p) => ({ date: p.date, kg: num(p.value) }));
  const series = (s: TrendSeries) =>
    s.points.filter((p) => Number.isFinite(num(p.value))).map((p) => ({ date: p.date, value: num(p.value) }));
  return { samplings, harvests, population: series(pop), dailyFeed: series(feed), cumulativeFeed: series(cum) };
}

/** The viewed day plus up to HISTORY_DAYS older days, newest first, never before the cycle start. */
function windowFor(viewDate: string, startDate: string): string[] {
  const out: string[] = [];
  for (let i = 0; i <= HISTORY_DAYS; i++) {
    const d = addDays(viewDate, -i);
    if (d < startDate) break;
    out.push(d);
  }
  return out;
}

/**
 * Everything one pond card needs for its viewed day. Day views are cached by
 * date so stepping through days only fetches what is new, and once the viewed
 * day is in, the days one step back and one step forward are prefetched so the
 * day navigator never shows a spinner for a single step. Any mutation calls
 * `reload()`, which drops the cache (a change on one day moves the metrics of
 * every later day).
 */
export function usePondData(cycle: Cycle, viewDate: string, maxDate: string, enabled = true) {
  const cache = useRef(new Map<string, DayView>());
  const pending = useRef(new Map<string, Promise<DayView>>());
  const generation = useRef(0);
  const [version, setVersion] = useState(0);
  const [days, setDays] = useState<DayView[]>([]); // viewed day first, then older
  const [growth, setGrowth] = useState<Growth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dropCache = useCallback(() => {
    generation.current += 1;
    cache.current = new Map();
    pending.current = new Map();
  }, []);

  useEffect(() => {
    dropCache();
    setGrowth(null);
  }, [cycle.id, dropCache]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    // Shares in-flight requests, so a prefetch and a real step never fetch the same day twice.
    const fetchDay = (d: string): Promise<DayView> => {
      const hit = cache.current.get(d);
      if (hit) return Promise.resolve(hit);
      const inFlight = pending.current.get(d);
      if (inFlight) return inFlight;
      const gen = generation.current;
      const req = api.getCycleDay(cycle.id, d).then((v) => {
        if (gen === generation.current) cache.current.set(d, v);
        return v;
      });
      req.finally(() => pending.current.get(d) === req && pending.current.delete(d)).catch(() => {});
      pending.current.set(d, req);
      return req;
    };

    const prefetchNeighbours = () => {
      const next = addDays(viewDate, 1);
      const around = [...windowFor(addDays(viewDate, -1), cycle.start_date), ...(next <= maxDate ? [next] : [])];
      around.forEach((d) => void fetchDay(d).catch(() => {}));
    };

    const wanted = windowFor(viewDate, cycle.start_date);
    const show = () => setDays(wanted.map((d) => cache.current.get(d)).filter((d): d is DayView => !!d));
    const missing = wanted.filter((d) => !cache.current.has(d));
    if (!missing.length) {
      // Everything is cached (usually a prefetched step): swap in the same render, no spinner.
      show();
      setLoading(false);
      setError(null);
      prefetchNeighbours();
      return;
    }
    setLoading(true);
    Promise.all(missing.map(fetchDay))
      .then(() => {
        if (cancelled) return;
        show();
        setError(null);
        prefetchNeighbours();
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [cycle.id, cycle.start_date, viewDate, maxDate, version, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const to = viewDate > todayIso() ? viewDate : todayIso();
    Promise.all(GROWTH_METRICS.map((m) => api.getCycleTrend(cycle.id, m, cycle.start_date, to)))
      .then((all) => !cancelled && setGrowth(toGrowth(all, cycle)))
      .catch(() => !cancelled && setGrowth({ samplings: [], harvests: [], population: [], dailyFeed: [], cumulativeFeed: [] }));
    return () => {
      cancelled = true;
    };
    // Growth covers the whole cycle; refetch only when data changes or the view moves past today.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle.id, cycle.start_date, version, enabled, viewDate > todayIso() ? viewDate : "past"]);

  const reload = useCallback(() => {
    dropCache();
    setVersion((v) => v + 1);
  }, [dropCache]);

  // A step onto fully prefetched days reads straight from the cache, so the first render already has the day.
  let current = days;
  if (current[0]?.date !== viewDate) {
    const window = windowFor(viewDate, cycle.start_date);
    if (window.every((d) => cache.current.has(d))) current = window.map((d) => cache.current.get(d)!);
  }
  const day = current[0]?.date === viewDate ? current[0] : null;
  return { day, days: day ? current : [], growth, loading: loading && !day, error, reload };
}
