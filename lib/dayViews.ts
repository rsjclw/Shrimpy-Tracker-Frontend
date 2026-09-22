"use client";

import { api, type DayView } from "./api";
import { peek, pending, put, track } from "./cache";
import { addDays } from "./dates";

// Day views shared by the pond cards and the dashboard's "today" hints, cached
// per cycle and date through lib/cache.

const dayKey = (cycleId: string, date: string) => `day:${cycleId}:${date}`;

/** Days of history loaded behind the viewed day, for "last reading N days ago" and detail rows. */
export const HISTORY_DAYS = 14;

/** The viewed day plus up to HISTORY_DAYS older days, newest first, never before the cycle start. */
export function windowFor(viewDate: string, startDate: string): string[] {
  const out: string[] = [];
  for (let i = 0; i <= HISTORY_DAYS; i++) {
    const d = addDays(viewDate, -i);
    if (d < startDate) break;
    out.push(d);
  }
  return out;
}

/** The cached day view for a date, fresh or not. */
export function cachedDay(cycleId: string, date: string): DayView | undefined {
  return peek<DayView>(dayKey(cycleId, date))?.value;
}

/** Whether a date's day view is cached and still fresh. */
export function isDayFresh(cycleId: string, date: string): boolean {
  return !!peek(dayKey(cycleId, date))?.fresh;
}

/**
 * Make sure the given dates are cached and fresh: dates already fresh or
 * already being fetched are skipped, the rest go out as one day-views request
 * per contiguous run. Resolves when every requested date has landed.
 */
export function fetchDays(cycleId: string, dates: string[]): Promise<unknown> {
  const keyOf = (d: string) => dayKey(cycleId, d);
  const need = dates.filter((d) => !isDayFresh(cycleId, d) && !pending(keyOf(d))).sort();
  const runs: string[][] = [];
  for (const d of need) {
    const last = runs[runs.length - 1];
    if (last && addDays(last[last.length - 1], 1) === d) last.push(d);
    else runs.push([d]);
  }
  for (const run of runs) {
    const at = Date.now();
    const req = api.getCycleDayViews(cycleId, run[0], run[run.length - 1]).then((views) => {
      views.forEach((v) => put(keyOf(v.date), v, { at }));
    });
    track(run.map(keyOf), req, at);
  }
  return Promise.all(dates.map((d) => pending(keyOf(d))).filter(Boolean));
}
