"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Banner, Spinner } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { api, type Cycle, type DayView, type FeedAdditive, type FeedType, type FarmRole, type Pond } from "@/lib/api";
import { docFor, isoForDoc, nowHHMM } from "@/lib/dates";
import { cycleLabel } from "@/lib/cycles";
import { canAdd, canManage } from "@/lib/roles";
import { DayNavigator, kindOf } from "./DayNavigator";
import { FeedSchedule } from "./FeedSchedule";
import { GrowthStats, type LogKind } from "./GrowthStats";
import { SamplingHarvestLog, TreatmentsLog, canLogKind, type LogsCtx } from "./LogsPanel";
import { alertsFor, nextFeedHint } from "./model";
import { usePondData } from "./usePondData";
import { Bacteria, Plankton, WaterQuality, type WaterCtx } from "./WaterPanels";

const TONE = { accent: "text-accent", warn: "text-warn", good: "text-good", faint: "text-tx-faint" };

export function PondCard({
  pond,
  cycle,
  farmId,
  farmName,
  role,
  feedTypes,
  additives,
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
  feedTypes: FeedType[];
  additives: FeedAdditive[];
  todayDay: DayView | null;
  today: string;
  userEmail: string;
  expanded: boolean;
  onToggle: () => void;
  onTodayChanged: () => void;
}) {
  const maxDate = isoForDoc(cycle.start_date, docFor(cycle.start_date, today) + 30);
  const [viewDate, setViewDate] = useState(today);
  const { day, days, growth, loading, error, reload } = usePondData(cycle, viewDate, expanded);
  const [logRequest, setLogRequest] = useState<LogKind | null>(null);

  useEffect(() => setViewDate(today), [cycle.id, today]);

  const perms = { canAdd: canAdd(role), canManage: canManage(role) };
  const now = nowHHMM();
  const alerts = alertsFor(todayDay);
  const hint = nextFeedHint(todayDay, now);
  const todayDoc = docFor(cycle.start_date, today);
  const kind = kindOf(viewDate, today);
  const viewDoc = docFor(cycle.start_date, viewDate);
  const statusText = alerts.length ? "Needs attention" : "Stable";
  const saveContext = `${farmName} · ${pond.name} · DOC ${viewDoc}`;

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
    ? { cycleId: cycle.id, startDate: cycle.start_date, days, canEdit: perms.canManage, saveContext, trendsHref, ensureLogId, onSaved }
    : null;
  const logsCtx: LogsCtx | null = day
    ? { cycleId: cycle.id, startDate: cycle.start_date, day, growth, perms, saveContext, userEmail, ensureLogId, onSaved }
    : null;

  return (
    <div id={`pond-${pond.id}`} className="overflow-hidden rounded-[18px] border border-line bg-ink-800">
      <div className="flex items-center pr-3">
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex min-w-0 flex-grow items-center justify-between gap-3 py-4 pl-[18px] pr-3 text-left">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={`h-[9px] w-[9px] shrink-0 rounded-full ${alerts.length ? "bg-warn" : "bg-good"}`} title={alerts.length ? alerts.join(", ") : "No alerts today"} />
            <div className="flex min-w-0 flex-col items-start gap-0.5">
              <span className="text-base font-semibold text-tx-strong">{pond.name}</span>
              <span className="truncate font-mono text-[11px] text-tx-faint">
                {cycleLabel(cycle)} · {expanded ? statusText : `DOC ${todayDoc} · ${statusText}`}
              </span>
            </div>
          </div>
          {!expanded ? (
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className={`font-mono text-[13px] font-semibold ${TONE[hint.tone]}`}>{hint.value}</span>
              <span className="text-[10px] uppercase tracking-[0.06em] text-tx-faint">{hint.label}</span>
            </div>
          ) : null}
        </button>
        {expanded ? (
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

      {expanded ? (
        <>
          <div className="flex flex-col gap-2 px-[18px] pb-3.5">
            {alerts.length ? <Banner tone="warn">Needs attention today: {alerts.join(" · ")}</Banner> : null}
            <DayNavigator
              startDate={cycle.start_date}
              viewDate={viewDate}
              today={today}
              maxDate={maxDate}
              onChange={setViewDate}
              dayNote={
                day && day.feedings.length === 0
                  ? kind === "future"
                    ? "Future day — nothing planned yet."
                    : "No feeds logged on this day."
                  : ""
              }
            />
          </div>
          <div className="flex flex-col gap-[18px] border-t border-line px-[18px] pb-5 pt-4">
            {error ? <Banner>{error}</Banner> : null}
            {loading || !day || !waterCtx || !logsCtx ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-tx-dim">
                <Spinner />
                Loading DOC {viewDoc}…
              </div>
            ) : (
              <>
                <FeedSchedule
                  cycle={cycle}
                  pond={pond}
                  saveContext={saveContext}
                  day={day}
                  history={days.slice(1)}
                  kind={kind}
                  feedTypes={feedTypes}
                  additives={additives}
                  perms={perms}
                  onSaved={onSaved}
                />
                <GrowthStats
                  startDate={cycle.start_date}
                  day={day}
                  todayDay={todayDay}
                  growth={growth}
                  trendsHref={trendsHref}
                  canLog={(k) => canLogKind(perms, k)}
                  onLog={(k) => setLogRequest(k)}
                />
                <WaterQuality ctx={waterCtx} />
                <Plankton ctx={waterCtx} />
                <Bacteria ctx={waterCtx} />
                <div className="mt-2 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="h-px flex-grow bg-line-strong" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-tx-faint">Logs</span>
                    <span className="h-px flex-grow bg-line-strong" />
                  </div>
                  <SamplingHarvestLog ctx={logsCtx} requested={logRequest} onRequestHandled={() => setLogRequest(null)} />
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
