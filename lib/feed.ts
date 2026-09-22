import type { DayView, Feeding } from "./api";
import { hhmm, nowHHMM, todayIso } from "./dates";
import { num } from "./num";

/** kg of the day's feeds scheduled at or before `now` (HH:MM). */
export function fedBefore(feedings: Pick<Feeding, "feed_time" | "amount_kg">[], now = nowHHMM()): number {
  return feedings.filter((f) => hhmm(f.feed_time) <= now).reduce((t, f) => t + num(f.amount_kg), 0);
}

/**
 * Cumulative feed as of now for a given day: past days count their whole
 * schedule; today counts only the feeds whose time has come; future days show
 * the planned total (drawn as a projection).
 */
export function cumulativeFeed(day: Pick<DayView, "date" | "feedings" | "metrics">, today = todayIso(), now = nowHHMM()): number {
  if (day.date !== today) return num(day.metrics.cumulative_feed_end_kg);
  return num(day.metrics.cumulative_feed_start_kg) + fedBefore(day.feedings, now);
}
