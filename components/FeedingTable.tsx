"use client";

import { addDays, format, parseISO } from "date-fns";
import { useEffect, useMemo, useState } from "react";

import {
  api,
  type DayView,
  type FeedType,
  type Feeding,
  type FeedingAdditive,
  type FeedingFeedType,
} from "@/lib/api";
import {
  feedTypeTotal,
  formatFeedKg,
  formatFeedTypeName,
  formatNumber,
  roundFeedKg,
  validFeedTypeMix,
} from "@/lib/format";

type AdditiveOption = { name: string; dosage_gr_per_kg: string | null };
type FeedEntryMode = "manual" | "index" | "previous-index" | "copy-previous";

type Props = {
  cycleId: string;
  dailyLogId: string | null;
  feedings: Feeding[];
  previousDay: DayView | null;
  additives: AdditiveOption[];
  feedTypes: FeedType[];
  defaultFeedTypes: FeedingFeedType[];
  doc: number;
  estimatedPopulation: number | null;
  feedingIndexIncrement: number;
  maximumFeedingIndex: number | null;
  canAdd: boolean;
  canManage: boolean;
  onChange: () => void;
};

type FeedingDraft = {
  feed_time: string;
  amount_kg: string;
  duration_min: string;
  additives: FeedingAdditive[];
  feed_types: FeedingFeedType[];
};

type PreviewFeeding = {
  feed_time: string;
  amount_kg: number;
  duration_min?: number;
  additives: FeedingAdditive[];
  feed_types: FeedingFeedType[];
};

const inputClass = "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm";
const fieldPanelClass = "rounded-lg border border-slate-200 bg-slate-50/60 p-3";

function cloneAdditives(additives: FeedingAdditive[]): FeedingAdditive[] {
  return additives.map((a) => ({ ...a }));
}

function cloneFeedTypes(feedTypes: FeedingFeedType[]): FeedingFeedType[] {
  return feedTypes.map((f) => ({ ...f }));
}

function emptyDraft(feedTypes: FeedingFeedType[] = []): FeedingDraft {
  return {
    feed_time: "08:00",
    amount_kg: "",
    duration_min: "",
    additives: [],
    feed_types: cloneFeedTypes(feedTypes),
  };
}

function feedingToDraft(f: Feeding): FeedingDraft {
  return {
    feed_time: f.feed_time.slice(0, 5),
    amount_kg: formatFeedKg(f.amount_kg),
    duration_min: f.duration_min?.toString() ?? "",
    additives: cloneAdditives(f.additives),
    feed_types: cloneFeedTypes(f.feed_types),
  };
}

function feedTypeOptionToMix(opt: FeedType, percentage: number): FeedingFeedType {
  return {
    feed_type_id: opt.id,
    brand: opt.brand,
    type: opt.type,
    price_per_kg: opt.price_per_kg,
    percentage: String(percentage),
    notes: opt.notes,
  };
}

function totalFeed(feedings: Pick<Feeding, "amount_kg">[]) {
  return feedings.reduce((sum, f) => sum + Number(f.amount_kg), 0);
}

const DEFAULT_RATIO_TIMES = ["06:00", "10:00", "14:00", "18:00"] as const;
const DEFAULT_RATIO_PCT: [string, string, string, string] = ["25", "30", "30", "15"];

function ratioSum(ratioPct: string[]) {
  return ratioPct.reduce((sum, v) => sum + (Number(v) || 0), 0);
}

function validRatio(ratioPct: string[]) {
  return Math.abs(ratioSum(ratioPct) - 100) < 0.1;
}

function deriveRatioFromDay(day: DayView | null): [string, string, string, string] | null {
  if (!day || day.feedings.length !== DEFAULT_RATIO_TIMES.length) return null;
  const sorted = [...day.feedings].sort((a, b) => a.feed_time.localeCompare(b.feed_time));
  const total = totalFeed(sorted);
  if (total <= 0) return null;
  const rounded = sorted.map((f) => Math.round(((Number(f.amount_kg) / total) * 100) * 10) / 10);
  const diff = Math.round((100 - rounded.reduce((sum, v) => sum + v, 0)) * 10) / 10;
  rounded[rounded.length - 1] = Math.round((rounded[rounded.length - 1] + diff) * 10) / 10;
  return rounded.map(String) as [string, string, string, string];
}

function feedingIndexFor(feedings: Pick<Feeding, "amount_kg">[], dayDoc: number, population: number | null) {
  if (feedings.length === 0 || dayDoc < 1 || population === null || population <= 0) {
    return Number.NaN;
  }
  return (totalFeed(feedings) / (population / 100000)) / dayDoc;
}

function AdditiveChips({ additives }: { additives: FeedingAdditive[] }) {
  if (!additives.length) return <span className="text-slate-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {additives.map((a) => (
        <span
          key={`${a.name}-${a.dosage_gr_per_kg}`}
          className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800"
        >
          {a.name} {a.dosage_gr_per_kg}gr/kg
        </span>
      ))}
    </div>
  );
}

function FeedTypeChips({ feedTypes }: { feedTypes: FeedingFeedType[] }) {
  if (!feedTypes.length) return <span className="text-slate-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {feedTypes.map((ft) => (
        <span
          key={`${ft.feed_type_id}-${ft.percentage}`}
          className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-800"
        >
          {formatFeedTypeName(ft)} {Number(ft.percentage).toFixed(0)}%
        </span>
      ))}
    </div>
  );
}

function AdditiveEditor({
  draft,
  additives,
  onToggle,
  onDosage,
}: {
  draft: FeedingDraft;
  additives: AdditiveOption[];
  onToggle: (opt: AdditiveOption) => void;
  onDosage: (name: string, dosage: number) => void;
}) {
  return (
    <div className={fieldPanelClass}>
      <div className="mb-2 text-sm font-medium text-slate-700">Additives</div>
      {additives.length === 0 ? (
        <div className="text-xs text-slate-500">No additives set for the farm.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {additives.map((opt) => {
            const selected = draft.additives.find((a) => a.name === opt.name);
            return (
              <button
                type="button"
                key={opt.name}
                onClick={() => onToggle(opt)}
                className={`rounded border px-2.5 py-1 text-xs ${
                  selected
                    ? "border-primary bg-primary text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                {opt.name}
                {opt.dosage_gr_per_kg ? ` - ${Math.round(Number(opt.dosage_gr_per_kg))} gr/kg` : ""}
              </button>
            );
          })}
        </div>
      )}
      {draft.additives.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          <div className="text-xs text-slate-500">Adjust dosage if needed</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {draft.additives.map((a) => (
              <label key={a.name} className="text-xs text-slate-600">
                {a.name}
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={a.dosage_gr_per_kg}
                    onChange={(e) => onDosage(a.name, Number(e.target.value))}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  />
                  <span className="shrink-0 text-slate-500">gr/kg</span>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FeedTypeMixEditor({
  draft,
  feedTypes,
  onToggle,
  onPercentage,
}: {
  draft: FeedingDraft;
  feedTypes: FeedType[];
  onToggle: (opt: FeedType) => void;
  onPercentage: (feedTypeId: string, percentage: string) => void;
}) {
  const total = feedTypeTotal(draft.feed_types);

  return (
    <div className={fieldPanelClass}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-700">Feed types</div>
        {draft.feed_types.length > 0 && (
          <div className={`text-xs ${validFeedTypeMix(draft.feed_types) ? "text-slate-500" : "text-amber-600"}`}>
            Mix total: {total.toFixed(1)}%
          </div>
        )}
      </div>
      {feedTypes.length === 0 ? (
        <div className="text-xs text-slate-500">No feed types set for the farm.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {feedTypes.map((opt) => {
            const selected = draft.feed_types.find((f) => f.feed_type_id === opt.id);
            return (
              <button
                type="button"
                key={opt.id}
                onClick={() => onToggle(opt)}
                className={`rounded border px-2.5 py-1 text-xs ${
                  selected
                    ? "border-primary bg-primary text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                {formatFeedTypeName({ brand: opt.brand, type: opt.type })}
                {opt.price_per_kg ? ` - ${Number(opt.price_per_kg).toFixed(0)}/kg` : ""}
              </button>
            );
          })}
        </div>
      )}
      {draft.feed_types.length > 0 && (
        <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-2">
          {draft.feed_types.map((f) => (
            <label key={f.feed_type_id} className="text-xs text-slate-600">
              {formatFeedTypeName(f)}
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={f.percentage}
                  onChange={(e) => onPercentage(f.feed_type_id, e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                />
                <span className="shrink-0 text-slate-500">%</span>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function RatioEditor({
  ratioPct,
  onChange,
  sourceLabel,
}: {
  ratioPct: [string, string, string, string];
  onChange: (index: number, value: string) => void;
  sourceLabel: string;
}) {
  const sum = ratioSum(ratioPct);
  return (
    <div className={fieldPanelClass}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-700">Feed ratio</div>
        <div className={`text-xs ${Math.abs(sum - 100) < 0.1 ? "text-slate-500" : "text-amber-600"}`}>
          Total: {sum.toFixed(1)}%
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {DEFAULT_RATIO_TIMES.map((time, i) => (
          <label key={time} className="text-xs text-slate-600">
            {time}
            <div className="mt-1 flex items-center gap-1">
              <input
                type="number"
                min="0"
                max="100"
                step="any"
                value={ratioPct[i]}
                onChange={(e) => onChange(i, e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
              />
              <span className="shrink-0 text-slate-500">%</span>
            </div>
          </label>
        ))}
      </div>
      <div className="mt-2 text-xs text-slate-500">{sourceLabel}</div>
    </div>
  );
}

function FeedingPreview({
  rows,
  feedingIndex,
}: {
  rows: PreviewFeeding[];
  feedingIndex: number | null;
}) {
  const total = rows.reduce((sum, row) => sum + row.amount_kg, 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 text-xs text-slate-600">
        <span>
          Preview: <strong>{rows.length}</strong> feeding{rows.length === 1 ? "" : "s"}
        </span>
        <span>
          Total <strong>{formatNumber(total, 1)} kg</strong>
          {feedingIndex !== null ? <> - Index <strong>{formatNumber(feedingIndex, 3)}</strong></> : null}
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row, index) => (
          <div key={`${row.feed_time}-${index}`} className="grid gap-2 px-2 py-1.5 text-xs sm:grid-cols-[64px_76px_1fr]">
            <div className="font-medium text-slate-700">{row.feed_time}</div>
            <div className="text-slate-700">{formatFeedKg(row.amount_kg)} kg</div>
            <div className="space-y-1 text-slate-500">
              <AdditiveChips additives={row.additives} />
              <FeedTypeChips feedTypes={row.feed_types} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FeedingTable({
  cycleId,
  dailyLogId,
  feedings,
  previousDay,
  additives,
  feedTypes,
  defaultFeedTypes,
  doc,
  estimatedPopulation,
  maximumFeedingIndex,
  canAdd,
  canManage,
  onChange,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FeedingDraft>(emptyDraft(defaultFeedTypes));
  const [editDraft, setEditDraft] = useState<FeedingDraft>(emptyDraft());
  const [indexDraft, setIndexDraft] = useState("");
  const [entryMode, setEntryMode] = useState<FeedEntryMode>("manual");
  const [ratioPct, setRatioPct] = useState<[string, string, string, string]>(DEFAULT_RATIO_PCT);
  const [ratioTouched, setRatioTouched] = useState(false);
  const [ratioSourceDay, setRatioSourceDay] = useState<DayView | null>(null);
  const [ratioSourceLoading, setRatioSourceLoading] = useState(false);

  useEffect(() => {
    if (!adding) setDraft(emptyDraft(defaultFeedTypes));
  }, [adding, defaultFeedTypes]);

  useEffect(() => {
    if (!adding) return;
    if (previousDay && previousDay.feedings.length > 0) {
      setRatioSourceDay(previousDay);
      return;
    }
    if (!previousDay) {
      setRatioSourceDay(null);
      return;
    }
    let cancelled = false;
    async function walkBack() {
      setRatioSourceLoading(true);
      let cursor = previousDay!;
      while (cursor.metrics.doc > 1) {
        const priorDate = format(addDays(parseISO(cursor.date), -1), "yyyy-MM-dd");
        const candidate = await api.getCycleDay(cycleId, priorDate).catch(() => null);
        if (cancelled || !candidate) break;
        if (candidate.feedings.length > 0) {
          setRatioSourceDay(candidate);
          setRatioSourceLoading(false);
          return;
        }
        cursor = candidate;
      }
      if (!cancelled) {
        setRatioSourceDay(null);
        setRatioSourceLoading(false);
      }
    }
    walkBack();
    return () => {
      cancelled = true;
    };
  }, [adding, previousDay, cycleId]);

  useEffect(() => {
    if (ratioTouched) return;
    setRatioPct(deriveRatioFromDay(ratioSourceDay) ?? DEFAULT_RATIO_PCT);
  }, [ratioSourceDay, ratioTouched]);

  const feedingIndex = feedingIndexFor(feedings, doc, estimatedPopulation);
  const previousFeedingIndex = previousDay
    ? feedingIndexFor(
        previousDay.feedings,
        previousDay.metrics.doc,
        previousDay.metrics.estimated_population,
      )
    : Number.NaN;

  const previousIndexReason = useMemo(() => {
    if (!previousDay) return "No previous day data.";
    if (previousDay.feedings.length === 0) return "Previous day has no feedings.";
    if (previousDay.metrics.doc < 1) return "Previous DOC is unavailable.";
    if (!previousDay.metrics.estimated_population || previousDay.metrics.estimated_population <= 0) {
      return "Previous population is unavailable.";
    }
    return Number.isFinite(previousFeedingIndex) ? null : "Previous feeding index cannot be calculated.";
  }, [previousDay, previousFeedingIndex]);

  const copyPreviousReason = useMemo(() => {
    if (!previousDay) return "No previous day data.";
    if (previousDay.metrics.doc < 1) return "Previous DOC is unavailable.";
    if (previousDay.feedings.length === 0) return "Previous day has no feedings.";
    return null;
  }, [previousDay]);

  function dailyFeedFromIndex(value: string) {
    const index = Number(value);
    if (!Number.isFinite(index) || doc < 1 || !estimatedPopulation || estimatedPopulation <= 0) {
      return null;
    }
    return index * doc * (estimatedPopulation / 100000);
  }

  function roundedSessionsFromIndex(value: string): PreviewFeeding[] | null {
    const dailyFeedKg = dailyFeedFromIndex(value);
    if (dailyFeedKg === null) return null;
    return DEFAULT_RATIO_TIMES.map((feed_time, i) => ({
      feed_time,
      amount_kg: roundFeedKg(dailyFeedKg * ((Number(ratioPct[i]) || 0) / 100)),
      additives: cloneAdditives(draft.additives),
      feed_types: cloneFeedTypes(draft.feed_types),
    }));
  }

  function adjustedIndexFromRows(rows: PreviewFeeding[] | null) {
    if (!rows || doc < 1 || !estimatedPopulation || estimatedPopulation <= 0) return null;
    const roundedDailyFeedKg = rows.reduce((sum, session) => sum + session.amount_kg, 0);
    return (roundedDailyFeedKg / (estimatedPopulation / 100000)) / doc;
  }

  function indexExceedsMaximum(value: string) {
    const index = Number(value);
    return maximumFeedingIndex !== null && Number.isFinite(index) && index > maximumFeedingIndex;
  }

  function updateRatio(index: number, value: string) {
    setRatioTouched(true);
    setRatioPct((prev) => {
      const next = [...prev] as [string, string, string, string];
      next[index] = value;
      return next;
    });
  }

  const ratioSourceLabel = ratioSourceLoading
    ? "Looking up the most recent feeding ratio..."
    : ratioSourceDay
      ? `Default from DOC ${ratioSourceDay.metrics.doc} (${ratioSourceDay.date}).`
      : "Default ratio - no previous feeding schedule found back to DOC 1.";

  const previewRows = useMemo<PreviewFeeding[]>(() => {
    if (entryMode === "index") {
      return roundedSessionsFromIndex(indexDraft.trim()) ?? [];
    }
    if (entryMode === "previous-index" && Number.isFinite(previousFeedingIndex)) {
      return roundedSessionsFromIndex(previousFeedingIndex.toFixed(3)) ?? [];
    }
    if (entryMode === "copy-previous" && previousDay) {
      return previousDay.feedings.map((f) => ({
        feed_time: f.feed_time.slice(0, 5),
        amount_kg: roundFeedKg(Number(f.amount_kg)),
        additives: cloneAdditives(f.additives),
        feed_types: cloneFeedTypes(f.feed_types),
      }));
    }
    return [];
  }, [draft, entryMode, indexDraft, previousDay, previousFeedingIndex, ratioPct]);

  const previewIndex =
    entryMode === "copy-previous"
      ? null
      : adjustedIndexFromRows(previewRows);

  function resetAddForm() {
    setAdding(false);
    setIndexDraft("");
    setEntryMode("manual");
    setDraft(emptyDraft(defaultFeedTypes));
    setRatioTouched(false);
    setRatioPct(DEFAULT_RATIO_PCT);
    setRatioSourceDay(null);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!dailyLogId) return;

    if (entryMode === "manual") {
      if (!validFeedTypeMix(draft.feed_types)) {
        alert("Feed type percentages must total 100%.");
        return;
      }
      await api.createFeeding(dailyLogId, {
        feed_time: draft.feed_time,
        amount_kg: roundFeedKg(Number(draft.amount_kg)),
        duration_min: draft.duration_min ? Number(draft.duration_min) : undefined,
        additives: draft.additives,
        feed_types: draft.feed_types,
      });
      resetAddForm();
      onChange();
      return;
    }

    if (entryMode !== "copy-previous" && !validFeedTypeMix(draft.feed_types)) {
      alert("Feed type percentages must total 100%.");
      return;
    }
    if ((entryMode === "index" || entryMode === "previous-index") && !validRatio(ratioPct)) {
      alert("Feeding ratio percentages must total 100%.");
      return;
    }
    if (previewRows.length === 0) return;

    for (const row of previewRows) {
      await api.createFeeding(dailyLogId, {
        feed_time: row.feed_time,
        amount_kg: roundFeedKg(row.amount_kg),
        duration_min: row.duration_min,
        additives: row.additives,
        feed_types: row.feed_types,
      });
    }
    resetAddForm();
    onChange();
  }

  async function saveEdit(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (!validFeedTypeMix(editDraft.feed_types)) {
      alert("Feed type percentages must total 100%.");
      return;
    }
    await api.updateFeeding(id, {
      feed_time: editDraft.feed_time,
      amount_kg: roundFeedKg(Number(editDraft.amount_kg)) as never,
      duration_min: editDraft.duration_min ? Number(editDraft.duration_min) : undefined,
      additives: editDraft.additives,
      feed_types: editDraft.feed_types,
    });
    setEditingId(null);
    onChange();
  }

  async function del(id: string) {
    if (!confirm("Delete this feeding?")) return;
    await api.deleteFeeding(id);
    onChange();
  }

  async function clearAll() {
    if (!confirm("Clear all feedings for this day?")) return;
    await Promise.all(feedings.map((f) => api.deleteFeeding(f.id)));
    onChange();
  }

  function toggleFor(d: FeedingDraft, setD: (v: FeedingDraft) => void) {
    return (opt: AdditiveOption) => {
      const exists = d.additives.find((a) => a.name === opt.name);
      setD({
        ...d,
        additives: exists
          ? d.additives.filter((a) => a.name !== opt.name)
          : [
              ...d.additives,
              {
                name: opt.name,
                dosage_gr_per_kg: opt.dosage_gr_per_kg
                  ? Math.round(Number(opt.dosage_gr_per_kg))
                  : 0,
              },
            ],
      });
    };
  }

  function dosageFor(d: FeedingDraft, setD: (v: FeedingDraft) => void) {
    return (name: string, dosage: number) =>
      setD({
        ...d,
        additives: d.additives.map((a) => (a.name === name ? { ...a, dosage_gr_per_kg: dosage } : a)),
      });
  }

  function toggleFeedTypeFor(d: FeedingDraft, setD: (v: FeedingDraft) => void) {
    return (opt: FeedType) => {
      const exists = d.feed_types.find((f) => f.feed_type_id === opt.id);
      if (exists) {
        setD({ ...d, feed_types: d.feed_types.filter((f) => f.feed_type_id !== opt.id) });
        return;
      }
      const nextPercentage = d.feed_types.length === 0 ? 100 : 0;
      setD({ ...d, feed_types: [...d.feed_types, feedTypeOptionToMix(opt, nextPercentage)] });
    };
  }

  function percentageFor(d: FeedingDraft, setD: (v: FeedingDraft) => void) {
    return (feedTypeId: string, percentage: string) =>
      setD({
        ...d,
        feed_types: d.feed_types.map((f) =>
          f.feed_type_id === feedTypeId ? { ...f, percentage } : f,
        ),
      });
  }

  const modeButtonClass = (mode: FeedEntryMode) =>
    `rounded border px-3 py-2 text-left text-sm ${
      entryMode === mode
        ? "border-primary bg-primary text-white"
        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
    }`;

  return (
    <section className="space-y-3 rounded-lg bg-white p-4 shadow">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Feeding</h3>
          <div className="text-xs text-slate-500">
            Feeding index: {formatNumber(feedingIndex, 3)}
          </div>
        </div>
        <div className="flex gap-2">
          {canManage && feedings.length > 0 && (
            <button onClick={clearAll} className="text-sm text-red-600 hover:underline">
              Clear all
            </button>
          )}
          {canAdd && (
            <button
              onClick={() => {
                setAdding((v) => !v);
                setEditingId(null);
                setIndexDraft("");
                setEntryMode("manual");
                setDraft(emptyDraft(defaultFeedTypes));
                setRatioTouched(false);
                setRatioPct(DEFAULT_RATIO_PCT);
                setRatioSourceDay(null);
              }}
              className="rounded bg-primary px-3 py-1 text-sm text-white"
            >
              + Add
            </button>
          )}
        </div>
      </div>

      {feedings.length === 0 ? (
        <p className="text-sm text-slate-500">No feedings logged yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="border-b border-r border-slate-200 px-2 py-1.5 font-medium">Time</th>
                <th className="border-b border-r border-slate-200 px-2 py-1.5 font-medium">Amount (kg)</th>
                <th className="border-b border-r border-slate-200 px-2 py-1.5 font-medium">Additives</th>
                <th className="border-b border-r border-slate-200 px-2 py-1.5 font-medium">Duration</th>
                <th className="border-b border-r border-slate-200 px-2 py-1.5 font-medium">Feed types</th>
                <th className="border-b border-slate-200 px-2 py-1.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {feedings.map((f) =>
                editingId === f.id ? (
                  <tr key={f.id}>
                    <td colSpan={6} className="border-t border-slate-200 bg-slate-50/40 p-3">
                      <form onSubmit={(e) => saveEdit(e, f.id)} className="space-y-3">
                        <div className={fieldPanelClass}>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <label className="text-sm text-slate-700">
                              Time
                              <input
                                type="time"
                                value={editDraft.feed_time}
                                onChange={(e) => setEditDraft({ ...editDraft, feed_time: e.target.value })}
                                className={inputClass}
                              />
                            </label>
                            <label className="text-sm text-slate-700">
                              Amount (kg)
                              <input
                                type="number"
                                step="any"
                                required
                                value={editDraft.amount_kg}
                                onChange={(e) => setEditDraft({ ...editDraft, amount_kg: e.target.value })}
                                className={inputClass}
                              />
                            </label>
                            <label className="text-sm text-slate-700">
                              Duration (min)
                              <input
                                type="number"
                                value={editDraft.duration_min}
                                onChange={(e) => setEditDraft({ ...editDraft, duration_min: e.target.value })}
                                className={inputClass}
                              />
                            </label>
                          </div>
                        </div>
                        <AdditiveEditor
                          draft={editDraft}
                          additives={additives}
                          onToggle={toggleFor(editDraft, setEditDraft)}
                          onDosage={dosageFor(editDraft, setEditDraft)}
                        />
                        <FeedTypeMixEditor
                          draft={editDraft}
                          feedTypes={feedTypes}
                          onToggle={toggleFeedTypeFor(editDraft, setEditDraft)}
                          onPercentage={percentageFor(editDraft, setEditDraft)}
                        />
                        <div className="flex gap-2">
                          <button className="rounded bg-primary px-3 py-1 text-sm text-white">Save</button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={f.id} className="align-top">
                    <td className="border-t border-r border-slate-200 px-2 py-2 font-medium text-slate-700">
                      {f.feed_time.slice(0, 5)}
                    </td>
                    <td className="border-t border-r border-slate-200 px-2 py-2 text-slate-700">
                      {formatFeedKg(f.amount_kg)}
                    </td>
                    <td className="border-t border-r border-slate-200 px-2 py-2">
                      <AdditiveChips additives={f.additives} />
                    </td>
                    <td className="border-t border-r border-slate-200 px-2 py-2 text-slate-700">
                      {f.duration_min ? `${f.duration_min} min` : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="border-t border-r border-slate-200 px-2 py-2">
                      <FeedTypeChips feedTypes={f.feed_types} />
                    </td>
                    <td className="border-t border-slate-200 px-2 py-2">
                      {canManage && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingId(f.id);
                              setEditDraft(feedingToDraft(f));
                              setAdding(false);
                            }}
                            className="text-xs text-primary hover:underline"
                          >
                            edit
                          </button>
                          <button onClick={() => del(f.id)} className="text-xs text-red-600 hover:underline">
                            delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {adding && canAdd && (
        <form onSubmit={add} className="space-y-3 border-t border-slate-200 pt-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <button type="button" onClick={() => setEntryMode("manual")} className={modeButtonClass("manual")}>
              Manual
            </button>
            <button type="button" onClick={() => setEntryMode("index")} className={modeButtonClass("index")}>
              Feeding index
            </button>
            <button
              type="button"
              onClick={() => setEntryMode("previous-index")}
              disabled={!!previousIndexReason}
              title={previousIndexReason ?? undefined}
              className={`${modeButtonClass("previous-index")} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Same previous index
            </button>
            <button
              type="button"
              onClick={() => setEntryMode("copy-previous")}
              disabled={!!copyPreviousReason}
              title={copyPreviousReason ?? undefined}
              className={`${modeButtonClass("copy-previous")} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Copy previous schedule
            </button>
          </div>

          {(previousIndexReason || copyPreviousReason) && (
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Previous index: {previousIndexReason ?? "available"}; previous schedule: {copyPreviousReason ?? "available"}.
            </div>
          )}

          {entryMode === "manual" && (
            <div className={fieldPanelClass}>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm text-slate-700">
                  Time
                  <input
                    type="time"
                    value={draft.feed_time}
                    onChange={(e) => setDraft({ ...draft, feed_time: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="text-sm text-slate-700">
                  Amount (kg)
                  <input
                    type="number"
                    step="any"
                    required
                    value={draft.amount_kg}
                    onChange={(e) => setDraft({ ...draft, amount_kg: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="text-sm text-slate-700">
                  Duration (min)
                  <input
                    type="number"
                    value={draft.duration_min}
                    onChange={(e) => setDraft({ ...draft, duration_min: e.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          )}

          {entryMode === "index" && (
            <div className={fieldPanelClass}>
              <label className="block text-sm text-slate-700">
                Feeding index
                <input
                  type="number"
                  step="any"
                  required
                  value={indexDraft}
                  onChange={(e) => setIndexDraft(e.target.value)}
                  placeholder="0.100"
                  className={inputClass}
                />
              </label>
              {indexExceedsMaximum(indexDraft) && (
                <div className="mt-2 text-xs text-amber-600">
                  Warning: above planned maximum index {formatNumber(maximumFeedingIndex ?? Number.NaN, 3)}.
                </div>
              )}
            </div>
          )}

          {entryMode === "previous-index" && Number.isFinite(previousFeedingIndex) && (
            <div className={fieldPanelClass}>
              <div className="text-sm text-slate-700">
                Using previous feeding index <strong>{formatNumber(previousFeedingIndex, 3)}</strong>.
              </div>
              {indexExceedsMaximum(previousFeedingIndex.toFixed(3)) && (
                <div className="mt-2 text-xs text-amber-600">
                  Warning: above planned maximum index {formatNumber(maximumFeedingIndex ?? Number.NaN, 3)}.
                </div>
              )}
            </div>
          )}

          {(entryMode === "index" || entryMode === "previous-index") && (
            <RatioEditor ratioPct={ratioPct} onChange={updateRatio} sourceLabel={ratioSourceLabel} />
          )}

          {entryMode !== "copy-previous" && (
            <>
              <AdditiveEditor
                draft={draft}
                additives={additives}
                onToggle={toggleFor(draft, setDraft)}
                onDosage={dosageFor(draft, setDraft)}
              />
              <FeedTypeMixEditor
                draft={draft}
                feedTypes={feedTypes}
                onToggle={toggleFeedTypeFor(draft, setDraft)}
                onPercentage={percentageFor(draft, setDraft)}
              />
            </>
          )}

          {entryMode !== "manual" && previewRows.length > 0 && (
            <FeedingPreview rows={previewRows} feedingIndex={previewIndex} />
          )}

          <div className="flex gap-2">
            <button
              disabled={
                (entryMode !== "manual" && previewRows.length === 0) ||
                ((entryMode === "index" || entryMode === "previous-index") && !validRatio(ratioPct))
              }
              className="rounded bg-primary px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={resetAddForm}
              className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
