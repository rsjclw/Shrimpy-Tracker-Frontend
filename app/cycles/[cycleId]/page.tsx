"use client";

import { addDays, format, parseISO } from "date-fns";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { DailyMetricsCard } from "@/components/DailyMetricsCard";
import { DateNavigator } from "@/components/DateNavigator";
import { FeedingTable } from "@/components/FeedingTable";
import { HarvestCard } from "@/components/HarvestCard";
import { PredictModal } from "@/components/PredictModal";
import { TreatmentsTimeline } from "@/components/TreatmentsTimeline";
import { WaterParametersCard } from "@/components/WaterParametersCard";
import { api, type Cycle, type DayView, type Farm, type FarmRole, type FeedAdditive, type FeedType, type Grid, type Pond } from "@/lib/api";

function canAdd(role: FarmRole | null) {
  return role === "admin" || role === "owner" || role === "operator";
}

function canManage(role: FarmRole | null) {
  return role === "admin" || role === "owner";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isIsoDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export default function CyclePage() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryDate = searchParams.get("date");
  const date = isIsoDate(queryDate) ? queryDate! : todayIso();
  const latestLoadRef = useRef(0);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [pond, setPond] = useState<Pond | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [grids, setGrids] = useState<Grid[]>([]);
  const [day, setDay] = useState<DayView | null>(null);
  const [previousDay, setPreviousDay] = useState<DayView | null>(null);
  const [additives, setAdditives] = useState<FeedAdditive[]>([]);
  const [feedTypes, setFeedTypes] = useState<FeedType[]>([]);
  const [showPredict, setShowPredict] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingSampling, setSavingSampling] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [abwDraft, setAbwDraft] = useState("");
  const [abwSampleTimeDraft, setAbwSampleTimeDraft] = useState("05:00");

  useEffect(() => {
    async function loadCycleContext() {
      const currentCycle = await api.getCycle(cycleId);
      const [currentPond, visibleFarms, visibleGrids] = await Promise.all([
        api.getPond(currentCycle.pond_id),
        api.listFarms(),
        api.listGrids(),
      ]);
      const farmId = visibleGrids.find((grid) => grid.id === currentPond.grid_id)?.farm_id;
      const [farmAdditives, farmFeedTypes] = await Promise.all([
        api.listAdditives(farmId),
        api.listFeedTypes(farmId),
      ]);
      setCycle(currentCycle);
      setPond(currentPond);
      setFarms(visibleFarms);
      setGrids(visibleGrids);
      setAdditives(farmAdditives);
      setFeedTypes(farmFeedTypes);
    }
    loadCycleContext();
  }, [cycleId]);

  useEffect(() => {
    if (!isIsoDate(queryDate)) {
      router.replace(`/cycles/${cycleId}?date=${date}`, { scroll: false });
    }
  }, [cycleId, date, queryDate, router]);

  const changeDate = useCallback(
    (next: string) => {
      if (!isIsoDate(next)) return;
      router.push(`/cycles/${cycleId}?date=${next}`, { scroll: false });
    },
    [cycleId, router],
  );

  const reload = useCallback(async (dateToLoad = date) => {
    const loadId = latestLoadRef.current + 1;
    latestLoadRef.current = loadId;

    let v = await api.getCycleDay(cycleId, dateToLoad);
    if (!v.daily_log_id) {
      v = await api.upsertCycleDay(cycleId, dateToLoad, {});
    }
    let previous: DayView | null = null;
    if (v.metrics.doc > 1) {
      const previousDate = format(addDays(parseISO(dateToLoad), -1), "yyyy-MM-dd");
      previous = await api.getCycleDay(cycleId, previousDate).catch(() => null);
    }
    if (latestLoadRef.current !== loadId) return;

    setDay(v);
    setPreviousDay(previous);
    setNoteDraft(v.notes ?? "");
    setAbwDraft(v.abw_g ?? "");
    setAbwSampleTimeDraft(v.abw_sample_time ? v.abw_sample_time.slice(0, 5) : "05:00");
  }, [cycleId, date]);

  useEffect(() => {
    reload(date);
  }, [date, reload]);

  async function saveSampling(e: React.FormEvent) {
    e.preventDefault();
    setSavingSampling(true);
    const trimmedAbw = abwDraft.trim();
    await api.upsertCycleDay(cycleId, date, {
      abw_g: trimmedAbw === "" ? null : Number(trimmedAbw),
      abw_sample_time: trimmedAbw === "" ? null : abwSampleTimeDraft,
    });
    setSavingSampling(false);
    reload();
  }

  async function saveNotes(e: React.FormEvent) {
    e.preventDefault();
    setSavingNote(true);
    const trimmedNotes = noteDraft.trim();
    await api.upsertCycleDay(cycleId, date, {
      notes: trimmedNotes === "" ? null : trimmedNotes,
    });
    setSavingNote(false);
    reload();
  }

  async function logSample() {
    const value = prompt("Estimated population from sampling?");
    if (!value) return;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return;
    await api.createSample(cycleId, { date, population: n, method: "cast_net" });
    reload();
  }

  if (!cycle || !day || day.date !== date) return <main className="p-6">Loading...</main>;

  const farmId = grids.find((grid) => grid.id === pond?.grid_id)?.farm_id;
  const role = farms.find((farm) => farm.id === farmId)?.role ?? null;
  const allowAdd = canAdd(role);
  const allowManage = canManage(role);

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <Link
        href={`/ponds/${cycle.pond_id}`}
        className="text-sm text-slate-500 hover:underline"
      >
        &larr; Back to pond
      </Link>
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{cycle.name}</h1>
        <Link
          href={`/cycles/${cycleId}/trends?metric=daily_feed_kg`}
          className="text-sm text-primary hover:underline"
        >
          View trends -&gt;
        </Link>
      </div>

      <DateNavigator
        date={date}
        onChange={changeDate}
        doc={day.metrics.doc}
        startDate={cycle.start_date}
        onPredict={allowAdd ? () => setShowPredict(true) : undefined}
      />

      {showPredict && (
        <PredictModal
          cycle={cycle}
          day={day}
          onClose={() => setShowPredict(false)}
          onComplete={() => { setShowPredict(false); reload(); }}
        />
      )}

      <FeedingTable
        dailyLogId={day.daily_log_id}
        feedings={day.feedings}
        previousDay={previousDay}
        additives={additives}
        feedTypes={feedTypes}
        defaultFeedTypes={day.default_feed_types}
        doc={day.metrics.doc}
        estimatedPopulation={day.metrics.estimated_population}
        feedingIndexIncrement={Number(cycle.feeding_index_increment)}
        maximumFeedingIndex={cycle.maximum_feeding_index ? Number(cycle.maximum_feeding_index) : null}
        canAdd={allowAdd}
        canManage={allowManage}
        onChange={reload}
      />

      <DailyMetricsCard cycleId={cycleId} metrics={day.metrics} />

      <HarvestCard
        dailyLogId={day.daily_log_id}
        harvests={day.harvests}
        canAdd={allowAdd}
        canManage={allowManage}
        onChange={reload}
      />

      <WaterParametersCard
        cycleId={cycleId}
        dailyLogId={day.daily_log_id}
        water={day.water}
        canManage={allowManage}
        onChange={reload}
      />

      <TreatmentsTimeline
        dailyLogId={day.daily_log_id}
        treatments={day.treatments}
        canAdd={allowAdd}
        canManage={allowManage}
        onChange={reload}
      />

      <section className="bg-white rounded-lg shadow p-4 space-y-3">
        <h3 className="font-medium">Sampling</h3>
        <form onSubmit={saveSampling} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              ABW (g)
              <input
                type="number"
                step="0.0001"
                value={abwDraft}
                onChange={(e) => setAbwDraft(e.target.value)}
                className="mt-1 w-full border rounded px-2 py-1"
              />
            </label>
            <label className="block text-sm">
              Time
              <input
                type="time"
                value={abwSampleTimeDraft}
                onChange={(e) => setAbwSampleTimeDraft(e.target.value)}
                className="mt-1 w-full border rounded px-2 py-1"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs text-slate-500">ADG</div>
              <div className="text-lg font-semibold">
                {day.sampling.adg_g_per_day ? `${day.sampling.adg_g_per_day} g/day` : "-"}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs text-slate-500">ABW gain</div>
              <div className="text-lg font-semibold">
                {day.sampling.abw_gain_g
                  ? `${Number(day.sampling.abw_gain_g).toFixed(3)} g`
                  : "-"}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Feed since previous sample time</div>
              <div className="text-lg font-semibold">
                {day.sampling.feed_since_previous_sample_kg
                  ? `${Number(day.sampling.feed_since_previous_sample_kg).toFixed(2)} kg`
                  : "-"}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Sample FCR</div>
              <div className="text-lg font-semibold">{day.sampling.sample_fcr ?? "-"}</div>
            </div>
          </div>
          <div className="flex gap-2">
            {allowManage && (
            <button
              disabled={savingSampling}
              className="bg-primary text-white px-4 py-1 rounded text-sm disabled:opacity-50"
            >
              Save sampling
            </button>
            )}
            {allowAdd && (
            <button
              type="button"
              onClick={logSample}
              className="border border-primary text-primary px-4 py-1 rounded text-sm"
            >
              + Population sample
            </button>
            )}
          </div>
        </form>
      </section>

      {allowManage && (
      <section className="bg-white rounded-lg shadow p-4 space-y-3">
        <h3 className="font-medium">Day notes</h3>
        <form onSubmit={saveNotes} className="space-y-2">
          <label className="block text-sm">
            Notes
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={3}
              className="mt-1 w-full border rounded px-2 py-1"
            />
          </label>
          <div className="flex gap-2">
            <button
              disabled={savingNote}
              className="bg-primary text-white px-4 py-1 rounded text-sm disabled:opacity-50"
            >
              Save notes
            </button>
          </div>
        </form>
      </section>
      )}
    </main>
  );
}
