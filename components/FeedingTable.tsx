"use client";

import { useEffect, useState } from "react";

import { api, type FeedType, type Feeding, type FeedingAdditive, type FeedingFeedType } from "@/lib/api";
import { feedTypeTotal, formatFeedKg, formatFeedTypeName, formatNumber, roundFeedKg, validFeedTypeMix } from "@/lib/format";

type AdditiveOption = { name: string; dosage_gr_per_kg: string | null };

type Props = {
  dailyLogId: string | null;
  feedings: Feeding[];
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

function emptyDraft(feedTypes: FeedingFeedType[] = []): FeedingDraft {
  return { feed_time: "08:00", amount_kg: "", duration_min: "", additives: [], feed_types: feedTypes };
}

function feedingToDraft(f: Feeding): FeedingDraft {
  return {
    feed_time: f.feed_time.slice(0, 5),
    amount_kg: Number(f.amount_kg).toFixed(2),
    duration_min: f.duration_min?.toString() ?? "",
    additives: f.additives,
    feed_types: f.feed_types,
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
    <div className="text-sm space-y-2">
      <div className="text-slate-500">Additives</div>
      <div className="flex flex-wrap gap-1">
        {additives.map((opt) => {
          const selected = draft.additives.find((a) => a.name === opt.name);
          return (
            <button
              type="button"
              key={opt.name}
              onClick={() => onToggle(opt)}
              className={`px-2 py-1 rounded border text-xs ${
                selected ? "bg-primary text-white border-primary" : "bg-white text-slate-700"
              }`}
            >
              {opt.name}
              {opt.dosage_gr_per_kg ? ` · ${Math.round(Number(opt.dosage_gr_per_kg))} gr/kg` : ""}
            </button>
          );
        })}
      </div>
      {draft.additives.length > 0 && (
        <div className="space-y-1">
          <div className="text-slate-500 text-xs">Adjust dosage if needed</div>
          {draft.additives.map((a) => (
            <div key={a.name} className="flex items-center gap-2">
              <span className="text-xs w-32">{a.name}</span>
              <input
                type="number"
                min="0"
                value={a.dosage_gr_per_kg}
                onChange={(e) => onDosage(a.name, Number(e.target.value))}
                className="w-20 border rounded px-2 py-1 text-xs"
              />
              <span className="text-xs text-slate-500">gr/kg</span>
            </div>
          ))}
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
    <div className="text-sm space-y-2">
      <div className="text-slate-500">Feed types</div>
      {feedTypes.length === 0 ? (
        <div className="text-xs text-slate-500">No feed types set for the farm.</div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {feedTypes.map((opt) => {
            const selected = draft.feed_types.find((f) => f.feed_type_id === opt.id);
            return (
              <button
                type="button"
                key={opt.id}
                onClick={() => onToggle(opt)}
                className={`px-2 py-1 rounded border text-xs ${
                  selected ? "bg-primary text-white border-primary" : "bg-white text-slate-700"
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
        <div className="space-y-1">
          <div className={`text-xs ${validFeedTypeMix(draft.feed_types) ? "text-slate-500" : "text-amber-600"}`}>
            Mix total: {total.toFixed(1)}%
          </div>
          {draft.feed_types.map((f) => (
            <div key={f.feed_type_id} className="flex items-center gap-2">
              <span className="text-xs w-32">{formatFeedTypeName(f)}</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={f.percentage}
                onChange={(e) => onPercentage(f.feed_type_id, e.target.value)}
                className="w-20 border rounded px-2 py-1 text-xs"
              />
              <span className="text-xs text-slate-500">%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FeedingTable({
  dailyLogId,
  feedings,
  additives,
  feedTypes,
  defaultFeedTypes,
  doc,
  estimatedPopulation,
  feedingIndexIncrement,
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

  useEffect(() => {
    if (!adding) setDraft(emptyDraft(defaultFeedTypes));
  }, [adding, defaultFeedTypes]);

  const totalDailyFeedKg = feedings.reduce((sum, f) => sum + Number(f.amount_kg), 0);
  const canCalculateIndex =
    feedings.length > 0 && doc >= 1 && estimatedPopulation !== null && estimatedPopulation > 0;
  const feedingIndex = canCalculateIndex
    ? (totalDailyFeedKg / (estimatedPopulation / 100000)) / doc
    : Number.NaN;

  function dailyFeedFromIndex(value: string) {
    const index = Number(value);
    if (!Number.isFinite(index) || doc < 1 || !estimatedPopulation || estimatedPopulation <= 0) {
      return null;
    }
    return index * doc * (estimatedPopulation / 100000);
  }

  function roundedSessionsFromIndex(value: string) {
    const dailyFeedKg = dailyFeedFromIndex(value);
    if (dailyFeedKg === null) return null;
    return [
      { feed_time: "06:00", amount_kg: roundFeedKg(dailyFeedKg * 0.25) },
      { feed_time: "10:00", amount_kg: roundFeedKg(dailyFeedKg * 0.3) },
      { feed_time: "14:00", amount_kg: roundFeedKg(dailyFeedKg * 0.3) },
      { feed_time: "18:00", amount_kg: roundFeedKg(dailyFeedKg * 0.15) },
    ];
  }

  function adjustedIndexFromRoundedFeed(value: string) {
    const sessions = roundedSessionsFromIndex(value);
    if (!sessions || doc < 1 || !estimatedPopulation || estimatedPopulation <= 0) return null;
    const roundedDailyFeedKg = sessions.reduce((sum, session) => sum + session.amount_kg, 0);
    return (roundedDailyFeedKg / (estimatedPopulation / 100000)) / doc;
  }

  function indexExceedsMaximum(value: string) {
    const index = Number(value);
    return maximumFeedingIndex !== null && Number.isFinite(index) && index > maximumFeedingIndex;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!dailyLogId) return;
    if (!validFeedTypeMix(draft.feed_types)) {
      alert("Feed type percentages must total 100%.");
      return;
    }
    const trimmedIndex = indexDraft.trim();
    if (trimmedIndex) {
      const sessions = roundedSessionsFromIndex(trimmedIndex);
      if (!sessions) return;
      for (const session of sessions) {
        await api.createFeeding(dailyLogId, {
          ...session,
          duration_min: draft.duration_min ? Number(draft.duration_min) : undefined,
          additives: draft.additives,
          feed_types: draft.feed_types,
        });
      }
      setAdding(false);
      setIndexDraft("");
      setDraft(emptyDraft(defaultFeedTypes));
      onChange();
      return;
    }
    await api.createFeeding(dailyLogId, {
      feed_time: draft.feed_time,
      amount_kg: Number(draft.amount_kg),
      duration_min: draft.duration_min ? Number(draft.duration_min) : undefined,
      additives: draft.additives,
      feed_types: draft.feed_types,
    });
    setAdding(false);
    setIndexDraft("");
    setDraft(emptyDraft(defaultFeedTypes));
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
      amount_kg: editDraft.amount_kg as never,
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
      setD({ ...d, additives: d.additives.map((a) => (a.name === name ? { ...a, dosage_gr_per_kg: dosage } : a)) });
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

  return (
    <section className="bg-white rounded-lg shadow p-4 space-y-3">
      <div className="flex items-center justify-between">
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
                setDraft(emptyDraft(defaultFeedTypes));
              }}
              className="text-sm bg-primary text-white px-3 py-1 rounded"
            >
              + Add
            </button>
          )}
        </div>
      </div>

      {feedings.length === 0 ? (
        <p className="text-sm text-slate-500">No feedings logged yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1">Time</th>
              <th>Amount (kg)</th>
              <th>Feed types</th>
              <th>Additives</th>
              <th>Duration</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {feedings.map((f) =>
              editingId === f.id ? (
                <tr key={f.id} className="border-t">
                  <td colSpan={6} className="py-2">
                    <form onSubmit={(e) => saveEdit(e, f.id)} className="space-y-2">
                      <div className="grid sm:grid-cols-3 gap-2">
                        <label className="text-sm">
                          Time
                          <input
                            type="time"
                            value={editDraft.feed_time}
                            onChange={(e) => setEditDraft({ ...editDraft, feed_time: e.target.value })}
                            className="mt-1 w-full border rounded px-2 py-1"
                          />
                        </label>
                        <label className="text-sm">
                          Amount (kg)
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={editDraft.amount_kg}
                            onChange={(e) => setEditDraft({ ...editDraft, amount_kg: e.target.value })}
                            className="mt-1 w-full border rounded px-2 py-1"
                          />
                        </label>
                        <label className="text-sm">
                          Duration (min)
                          <input
                            type="number"
                            value={editDraft.duration_min}
                            onChange={(e) => setEditDraft({ ...editDraft, duration_min: e.target.value })}
                            className="mt-1 w-full border rounded px-2 py-1"
                          />
                        </label>
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
                        <button className="bg-primary text-white px-3 py-1 rounded text-sm">Save</button>
                        <button type="button" onClick={() => setEditingId(null)} className="border px-3 py-1 rounded text-sm">Cancel</button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={f.id} className="border-t">
                  <td className="py-2">{f.feed_time.slice(0, 5)}</td>
                  <td>{formatFeedKg(f.amount_kg)}</td>
                  <td>
                    {f.feed_types.length
                      ? f.feed_types
                          .map((ft) => `${formatFeedTypeName(ft)} ${Number(ft.percentage).toFixed(0)}%`)
                          .join(", ")
                      : "—"}
                  </td>
                  <td>
                    {f.additives.length
                      ? f.additives.map((a) => `${a.name} ${a.dosage_gr_per_kg}gr/kg`).join(", ")
                      : "—"}
                  </td>
                  <td>{f.duration_min ? `${f.duration_min} min` : "—"}</td>
                  <td className="flex gap-2 py-2">
                    {canManage && (
                    <>
                    <button
                      onClick={() => { setEditingId(f.id); setEditDraft(feedingToDraft(f)); setAdding(false); }}
                      className="text-primary hover:underline text-xs"
                    >
                      edit
                    </button>
                    <button onClick={() => del(f.id)} className="text-red-600 hover:underline text-xs">
                      delete
                    </button>
                    </>
                    )}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}

      {adding && canAdd && (
        <form onSubmit={add} className="border-t pt-3 space-y-2">
          <label className="text-sm block">
            Feeding index
            <input
              type="number"
              step="0.001"
              value={indexDraft}
              onChange={(e) => setIndexDraft(e.target.value)}
              placeholder="Optional"
              className="mt-1 w-full border rounded px-2 py-1"
            />
          </label>
          {indexDraft.trim() && (
            <div className="text-xs text-slate-500">
              Daily feed:{" "}
              {roundedSessionsFromIndex(indexDraft) === null
                ? "NaN"
                : `${formatNumber(
                    roundedSessionsFromIndex(indexDraft)?.reduce(
                      (sum, session) => sum + session.amount_kg,
                      0,
                    ) ?? Number.NaN,
                    2,
                  )} kg`}
              {" - "}
              Adjusted index:{" "}
              {adjustedIndexFromRoundedFeed(indexDraft) === null
                ? "NaN"
                : formatNumber(adjustedIndexFromRoundedFeed(indexDraft) ?? Number.NaN, 3)}
            </div>
          )}
          {indexExceedsMaximum(indexDraft) && (
            <div className="text-xs text-amber-600">
              Warning: above planned maximum index {formatNumber(maximumFeedingIndex ?? Number.NaN, 3)}.
            </div>
          )}
          <div className="grid sm:grid-cols-3 gap-2">
            <label className="text-sm">
              Time
              <input
                type="time"
                value={draft.feed_time}
                onChange={(e) => setDraft({ ...draft, feed_time: e.target.value })}
                className="mt-1 w-full border rounded px-2 py-1"
              />
            </label>
            <label className="text-sm">
              Amount (kg)
              <input
                type="number"
                step="0.01"
                required={!indexDraft.trim()}
                disabled={!!indexDraft.trim()}
                value={
                  indexDraft.trim()
                    ? roundedSessionsFromIndex(indexDraft)
                        ?.reduce((sum, session) => sum + session.amount_kg, 0)
                        .toFixed(2) ?? ""
                    : draft.amount_kg
                }
                onChange={(e) => setDraft({ ...draft, amount_kg: e.target.value })}
                className="mt-1 w-full border rounded px-2 py-1"
              />
            </label>
            <label className="text-sm">
              Duration (min)
              <input
                type="number"
                value={draft.duration_min}
                onChange={(e) => setDraft({ ...draft, duration_min: e.target.value })}
                className="mt-1 w-full border rounded px-2 py-1"
              />
            </label>
          </div>
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
          <button className="bg-primary text-white px-4 py-1 rounded text-sm">Save</button>
        </form>
      )}
    </section>
  );
}
