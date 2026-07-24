"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api, type WaterParameterSourceKey, type WaterParameters, type WaterParametersUpsert } from "@/lib/api";

type Props = {
  cycleId: string;
  dailyLogId: string | null;
  water: WaterParameters | null;
  canManage: boolean;
  onChange: () => void;
};

type BiologyKey = Extract<
  WaterParameterSourceKey,
  | "plankton_ga"
  | "plankton_bga"
  | "plankton_diatom"
  | "plankton_yga"
  | "plankton_eugle"
  | "plankton_dino"
  | "plankton_zoo"
  | "plankton_protozoa"
  | "yellow_vibrio"
  | "green_vibrio"
  | "black_vibrio"
  | "tbc"
>;

type ComputedKey = "total_plankton" | "total_vibrio_count" | "vibrio_percentage";

const PLANKTON_FIELDS: Array<{ key: BiologyKey; label: string; unit: string }> = [
  { key: "plankton_ga", label: "GA", unit: "cell/ml" },
  { key: "plankton_bga", label: "BGA", unit: "cell/ml" },
  { key: "plankton_diatom", label: "Diatom", unit: "cell/ml" },
  { key: "plankton_yga", label: "YGA", unit: "cell/ml" },
  { key: "plankton_eugle", label: "Eugle", unit: "cell/ml" },
  { key: "plankton_dino", label: "Dino", unit: "cell/ml" },
  { key: "plankton_zoo", label: "Zoo", unit: "cell/ml" },
  { key: "plankton_protozoa", label: "Protozoa", unit: "cell/ml" },
];

const BACTERIA_FIELDS: Array<{ key: BiologyKey; label: string; unit: string }> = [
  { key: "yellow_vibrio", label: "Yellow Vibrio", unit: "CFU/ml" },
  { key: "green_vibrio", label: "Green Vibrio", unit: "CFU/ml" },
  { key: "black_vibrio", label: "Black Vibrio", unit: "CFU/ml" },
  { key: "tbc", label: "TBC", unit: "CFU/ml" },
];

const SOURCE_FIELDS = [...PLANKTON_FIELDS, ...BACTERIA_FIELDS];

const COMPUTED_FIELDS: Array<{ key: ComputedKey; label: string; unit: string }> = [
  { key: "total_plankton", label: "Total plankton", unit: "cell/ml" },
  { key: "total_vibrio_count", label: "Total Vibrio count", unit: "CFU/ml" },
  { key: "vibrio_percentage", label: "Vibrio percentage", unit: "%" },
];

function draftFromWater(water: WaterParameters | null) {
  const next: Record<string, string> = {};
  if (water) for (const field of SOURCE_FIELDS) next[field.key] = water[field.key] ?? "";
  return next;
}

function hasBiologyData(water: WaterParameters | null) {
  return SOURCE_FIELDS.some((field) => water?.[field.key] != null);
}

function draftNumber(value: string | undefined) {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableSum(keys: BiologyKey[], draft: Record<string, string>) {
  let hasValue = false;
  let total = 0;
  for (const key of keys) {
    const value = draftNumber(draft[key]);
    if (value != null) {
      hasValue = true;
      total += value;
    }
  }
  return hasValue ? total : null;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function draftComputedValue(key: ComputedKey, draft: Record<string, string>) {
  if (key === "total_plankton") {
    return nullableSum(PLANKTON_FIELDS.map((field) => field.key), draft);
  }

  const totalVibrio = nullableSum(
    BACTERIA_FIELDS.filter((field) => field.key !== "tbc").map((field) => field.key),
    draft,
  );

  if (key === "total_vibrio_count") return totalVibrio;

  const tbc = draftNumber(draft.tbc);
  if (totalVibrio == null || tbc == null || tbc === 0) return null;
  return (totalVibrio / tbc) * 100;
}

function display(value: string | number | null | undefined, unit: string) {
  if (value == null || value === "") return "-";
  const text = typeof value === "number" ? formatNumber(value) : value;
  return unit === "%" ? `${text}%` : `${text} ${unit}`;
}

export function PlanktonBacteriaCard({ cycleId, dailyLogId, water, canManage, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() => draftFromWater(water));
  const hasData = hasBiologyData(water);

  useEffect(() => {
    if (!editing) setDraft(draftFromWater(water));
  }, [editing, water]);

  async function clear() {
    if (!dailyLogId) return;
    if (!confirm("Clear plankton and bacteria readings for this day?")) return;
    const body: WaterParametersUpsert = {};
    for (const field of SOURCE_FIELDS) body[field.key] = null;
    await api.upsertWater(dailyLogId, body);
    onChange();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dailyLogId) return;
    const body: WaterParametersUpsert = {};
    for (const field of SOURCE_FIELDS) {
      const value = draft[field.key];
      body[field.key] = value === "" || value == null ? null : Number(value);
    }
    await api.upsertWater(dailyLogId, body);
    setEditing(false);
    onChange();
  }

  return (
    <section className="bg-white rounded-lg shadow p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Plankton &amp; Bacteria</h3>
        {canManage && (
          <div className="flex gap-3">
            {hasData && !editing && (
              <button onClick={clear} className="text-sm text-red-600 hover:underline">
                Clear
              </button>
            )}
            <button onClick={() => setEditing((value) => !value)} className="text-sm text-primary hover:underline">
              {editing ? "Cancel" : hasData ? "Edit" : "Add"}
            </button>
          </div>
        )}
      </div>

      {editing && canManage ? (
        <form onSubmit={save} className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-medium text-slate-500">Plankton</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PLANKTON_FIELDS.map((field) => (
                <label key={field.key} className="text-sm">
                  <span className="text-slate-500">{field.label} ({field.unit})</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={draft[field.key] ?? ""}
                    onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                    className="mt-1 w-full border rounded px-2 py-1"
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-slate-500">Bacteria</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {BACTERIA_FIELDS.map((field) => (
                <label key={field.key} className="text-sm">
                  <span className="text-slate-500">{field.label} ({field.unit})</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={draft[field.key] ?? ""}
                    onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                    className="mt-1 w-full border rounded px-2 py-1"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm border-t pt-3">
            {COMPUTED_FIELDS.map((field) => (
              <div key={field.key}>
                <div className="text-slate-500 text-xs">{field.label}</div>
                <div>{display(draftComputedValue(field.key, draft), field.unit)}</div>
              </div>
            ))}
          </div>

          <button className="w-full bg-primary text-white py-1 rounded text-sm">
            Save
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-medium text-slate-500">Plankton</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              {PLANKTON_FIELDS.map((field) => (
                <Link
                  key={field.key}
                  href={`/trends?cycles=${cycleId}&metrics=${field.key}`}
                  className="block rounded border border-transparent p-2 -m-2 hover:border-slate-200 hover:bg-slate-50 transition"
                >
                  <div className="text-slate-500 text-xs">{field.label}</div>
                  <div>{display(water?.[field.key], field.unit)}</div>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-slate-500">Bacteria</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              {BACTERIA_FIELDS.map((field) => (
                <Link
                  key={field.key}
                  href={`/trends?cycles=${cycleId}&metrics=${field.key}`}
                  className="block rounded border border-transparent p-2 -m-2 hover:border-slate-200 hover:bg-slate-50 transition"
                >
                  <div className="text-slate-500 text-xs">{field.label}</div>
                  <div>{display(water?.[field.key], field.unit)}</div>
                </Link>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm border-t pt-3">
            {COMPUTED_FIELDS.map((field) => (
              <Link
                key={field.key}
                href={`/trends?cycles=${cycleId}&metrics=${field.key}`}
                className="block rounded border border-transparent p-2 -m-2 hover:border-slate-200 hover:bg-slate-50 transition"
              >
                <div className="text-slate-500 text-xs">{field.label}</div>
                <div>{display(water?.[field.key], field.unit)}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
