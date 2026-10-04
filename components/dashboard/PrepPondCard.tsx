"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { stockingDue } from "@/components/pond-settings/PrepCard";
import { Banner, Spinner } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { api, type Cycle, type DayView, type FarmRole, type Pond, type Product } from "@/lib/api";
import { cycleFloor, cycleLabel, prepDay } from "@/lib/cycles";
import { nowHHMM } from "@/lib/dates";
import { cachedDay, windowFor } from "@/lib/dayViews";
import { canAdd, canManage } from "@/lib/roles";
import { DayNavigator, kindOf } from "./DayNavigator";
import { alertsFor } from "./model";
import { TreatmentsLog, type LogsCtx } from "./LogsPanel";
import { PondSummary } from "./PondSummary";
import { usePondData } from "./usePondData";
import { Bacteria, Plankton, WaterQuality, type WaterCtx } from "./WaterPanels";

/**
 * A pond being prepared for stocking: counted in preparation days, logging only water and
 * treatments. No feed, sampling or harvest until it is stocked (pond settings, or Stock pond here).
 */
export function PrepPondCard({
  pond,
  cycle,
  farmId,
  farmName,
  role,
  products,
  todayDay,
  today,
  userEmail,
  expanded,
  onToggle,
  onTodayChanged,
}: {
  pond: Pond;
  cycle: Cycle;
  farmId: string;
  farmName: string;
  role: FarmRole;
  products: Product[];
  todayDay: DayView | null;
  today: string;
  userEmail: string;
  expanded: boolean;
  onToggle: () => void;
  onTodayChanged: () => void;
}) {
  const floor = cycleFloor(cycle);
  // Preparation days can be logged up to today; nothing is planned ahead.
  const maxDate = today;
  const [viewDate, setViewDate] = useState(today);
  const { day, days, growth, loading, error, reload } = usePondData(cycle, viewDate, maxDate);

  useEffect(() => setViewDate(today), [cycle.id, today]);

  const perms = { canAdd: canAdd(role), canManage: canManage(role) };
  // Water is checked while preparing too: the same alerts as a stocked pond.
  const alerts = alertsFor(todayDay);
  const now = nowHHMM();
  const kind = kindOf(viewDate, today);
  const status = `Prep day ${prepDay(cycle, today)} · stocking ${stockingDue(cycle.start_date, today)}`;
  const saveContext = `${farmName} · ${pond.name} · prep day ${prepDay(cycle, viewDate)}`;
  const todayWindow = todayDay ? [todayDay, ...windowFor(today, floor).slice(1).flatMap((d) => cachedDay(cycle.id, d) ?? [])] : [];

  const onSaved = useCallback(() => {
    reload();
    if (viewDate === today) onTodayChanged();
  }, [reload, viewDate, today, onTodayChanged]);

  const ensureLogId = useCallback(async () => {
    if (day?.daily_log_id) return day.daily_log_id;
    const created = await api.upsertCycleDay(cycle.id, viewDate, {});
    if (!created.daily_log_id) throw new Error("Could not open a log for this day.");
    return created.daily_log_id;
  }, [day, cycle.id, viewDate]);

  const trendsHref = (metrics: string) => `/trends?farm=${farmId}&cycle=${cycle.id}&metrics=${metrics}`;
  const waterCtx: WaterCtx | null = day
    ? { cycleId: cycle.id, startDate: floor, dayWord: "Prep day", dayShort: "P", days, canEdit: perms.canManage, saveContext, trendsHref, ensureLogId, onSaved }
    : null;
  const logsCtx: LogsCtx | null = day
    ? { cycleId: cycle.id, startDate: cycle.start_date, day, growth, perms, gridId: pond.grid_id, saveContext, userEmail, products, ensureLogId, onSaved }
    : null;

  return (
    <div id={`pond-${pond.id}`} className="overflow-hidden rounded-[18px] border border-violet/30 bg-ink-800">
      <div className="flex items-center pr-3">
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex min-w-0 flex-grow items-center gap-2.5 py-4 pl-[18px] pr-3 text-left">
          <span className={`h-[9px] w-[9px] shrink-0 rounded-full ${alerts.length ? "bg-warn" : "bg-violet"}`} title={alerts.length ? alerts.join(", ") : "Preparing"} />
          <div className="flex min-w-0 flex-grow flex-col gap-0.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-base font-semibold text-tx-strong">{pond.name}</span>
              {!expanded ? (
                <span className={`shrink-0 font-mono text-[13px] font-semibold ${alerts.length ? "text-warn" : "text-violet"}`}>
                  {alerts.length ? "Needs attention" : "Preparing"}
                </span>
              ) : null}
            </div>
            <span className="truncate font-mono text-[11px] text-tx-faint">
              {cycleLabel(cycle)} · {status}
            </span>
          </div>
        </button>
        {expanded && perms.canManage ? (
          <Link
            href={`/ponds/${pond.id}/settings`}
            aria-label={`${pond.name} settings`}
            className="mr-2.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-tx-muted hover:text-tx-strong"
          >
            <Icon name="gear" size={18} strokeWidth={1.8} />
          </Link>
        ) : null}
        <button type="button" onClick={onToggle} aria-label={expanded ? `Collapse ${pond.name}` : `Expand ${pond.name}`} className="flex h-9 w-8 shrink-0 items-center justify-center text-tx-faint">
          <Icon name="chevron" size={18} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {!expanded ? (
        <div onClick={onToggle} className="-mt-1.5 cursor-pointer px-[18px] pb-4">
          <PondSummary days={todayWindow} growth={growth} today={today} now={now} preparing />
        </div>
      ) : null}

      {expanded ? (
        <>
          <div className="flex flex-col gap-2 px-[18px] pb-3.5">
            <DayNavigator startDate={floor} viewDate={viewDate} today={today} maxDate={maxDate} onChange={setViewDate} dayNote="" docLabel="Prep day" docShort="P" />
            {perms.canManage ? (
              <Link
                href={`/ponds/${pond.id}/settings?stock=1`}
                className="flex items-center justify-center rounded-[10px] bg-accent px-3 py-2.5 text-sm font-bold text-accent-ink hover:text-accent-ink"
              >
                Stock pond
              </Link>
            ) : null}
          </div>
          <div className="flex flex-col gap-[18px] border-t border-line px-[18px] pb-5 pt-4">
            {error ? <Banner>{error}</Banner> : null}
            {alerts.length ? <Banner tone="warn">Needs attention today: {alerts.join(" · ")}</Banner> : null}
            {loading || !day || !waterCtx || !logsCtx ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-tx-dim">
                <Spinner />
                Loading prep day {prepDay(cycle, viewDate)}…
              </div>
            ) : (
              <>
                <WaterQuality ctx={waterCtx} />
                <Plankton ctx={waterCtx} />
                <Bacteria ctx={waterCtx} />
                <div className="mt-2 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="h-px flex-grow bg-line-strong" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-tx-faint">Logs</span>
                    <span className="h-px flex-grow bg-line-strong" />
                  </div>
                  <TreatmentsLog ctx={logsCtx} kindLabel={kind === "today" ? "today" : "on this day"} />
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
