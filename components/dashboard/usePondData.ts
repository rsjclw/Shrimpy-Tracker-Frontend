"use client";

import { useCallback, useEffect, useState } from "react";

import { api, type Cycle, type DayView, type TrendSeries } from "@/lib/api";
import { load, markAllStale, peek } from "@/lib/cache";
import { cachedDay, fetchDays, isDayFresh, windowFor } from "@/lib/dayViews";
import { addDays, daysBetween, todayIso } from "@/lib/dates";
import { num } from "@/lib/num";

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

/**
 * Everything one pond card needs for its viewed day. Day views and growth come
 * from the shared client cache (lib/cache), so a card that remounts - say after
 * coming back from pond settings - draws from memory without asking the
 * backend again while the data is fresh. Once the viewed day is in, the days
 * one step back and one step forward are prefetched so a single step never
 * shows a spinner. Saves elsewhere mark the cache stale; `reload()` refetches
 * this card's window and growth in the background while keeping what is shown.
 */
export function usePondData(cycle: Cycle, viewDate: string, maxDate: string, enabled = true) {
  const [version, setVersion] = useState(0);
  const [days, setDays] = useState<DayView[]>([]); // viewed day first, then older
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const growthTo = viewDate > todayIso() ? viewDate : todayIso();
  const growthKey = `growth:${cycle.id}:${growthTo}`;
  const [growth, setGrowth] = useState<Growth | null>(() => peek<Growth>(growthKey)?.value ?? null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const prefetchNeighbours = () => {
      const next = addDays(viewDate, 1);
      const around = [...windowFor(addDays(viewDate, -1), cycle.start_date), ...(next <= maxDate ? [next] : [])];
      fetchDays(cycle.id, around).catch(() => {});
    };

    const wanted = windowFor(viewDate, cycle.start_date);
    const fromCache = () => wanted.map((d) => cachedDay(cycle.id, d)).filter((d): d is DayView => !!d);
    const cached = fromCache();
    const complete = cached.length === wanted.length;
    if (complete) {
      // Show what we have straight away, even if stale; a stale window refreshes behind it.
      setDays(cached);
      setLoading(false);
    }
    if (wanted.every((d) => isDayFresh(cycle.id, d))) {
      setError(null);
      prefetchNeighbours();
      return;
    }
    if (!complete) setLoading(true);
    fetchDays(cycle.id, wanted)
      .then(() => {
        if (cancelled) return;
        setDays(fromCache());
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
    const hit = peek<Growth>(growthKey);
    setGrowth(hit?.value ?? null);
    if (hit?.fresh) return;
    const fetchGrowth = () =>
      Promise.all(GROWTH_METRICS.map((m) => api.getCycleTrend(cycle.id, m, cycle.start_date, growthTo))).then((all) => toGrowth(all, cycle));
    load(growthKey, fetchGrowth)
      .then((g) => !cancelled && setGrowth(g))
      .catch(() => !cancelled && !hit && setGrowth({ samplings: [], harvests: [], population: [], dailyFeed: [], cumulativeFeed: [] }));
    return () => {
      cancelled = true;
    };
    // Growth covers the whole cycle; refetch only when data changes or the view moves past today.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [growthKey, version, enabled]);

  const reload = useCallback(() => {
    // Saves already mark the cache stale in lib/api; marking here too covers a reload with no write behind it.
    markAllStale();
    setVersion((v) => v + 1);
  }, []);

  // A step onto cached days reads straight from the cache, so the first render already has the day.
  let current = days;
  if (current[0]?.date !== viewDate) {
    const fromCache = windowFor(viewDate, cycle.start_date).map((d) => cachedDay(cycle.id, d));
    if (fromCache.every(Boolean)) current = fromCache as DayView[];
  }
  const day = current[0]?.date === viewDate ? current[0] : null;
  return { day, days: day ? current : [], growth, loading: loading && !day, error, reload };
}
