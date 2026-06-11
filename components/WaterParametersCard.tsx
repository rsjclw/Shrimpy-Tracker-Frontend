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

type ChemistryKey = Extract<
  WaterParameterSourceKey,
  | "do_am"
  | "do_pm"
  | "ph_am"
  | "ph_pm"
  | "salinity"
  | "tan"
  | "nitrite"
  | "phosphate"
  | "calcium"
  | "magnesium"
  | "alkalinity"
>;

const FIELDS: Array<{ key: ChemistryKey; label: string; unit?: string; step?: string }> =
  [
    { key: "do_am", label: "DO am", unit: "ppm", step: "any" },
    { key: "do_pm", label: "DO pm", unit: "ppm", step: "any" },
    { key: "ph_am", label: "pH am", step: "any" },
    { key: "ph_pm", label: "pH pm", step: "any" },
    { key: "salinity", label: "Salinity", unit: "ppt", step: "any" },
    { key: "tan", label: "TAN", unit: "ppm", step: "any" },
    { key: "nitrite", label: "Nitrite", unit: "ppm", step: "any" },
    { key: "phosphate", label: "Phosphate", unit: "ppm", step: "any" },
    { key: "calcium", label: "Calcium", unit: "ppm", step: "any" },
    { key: "magnesium", label: "Magnesium", unit: "ppm", step: "any" },
    { key: "alkalinity", label: "Alkalinity", unit: "ppm", step: "any" },
  ];

function draftFromWater(water: WaterParameters | null) {
  const next: Record<string, string> = {};
  if (water) for (const field of FIELDS) next[field.key] = water[field.key] ?? "";
  return next;
}

function hasChemistryData(water: WaterParameters | null) {
  return FIELDS.some((field) => water?.[field.key] != null);
}

export function WaterParametersCard({ cycleId, dailyLogId, water, canManage, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() => draftFromWater(water));
  const hasData = hasChemistryData(water);

  useEffect(() => {
    if (!editing) setDraft(draftFromWater(water));
  }, [editing, water]);

  async function clear() {
    if (!dailyLogId) return;
    if (!confirm("Clear all water parameters for this day?")) return;
    const body: WaterParametersUpsert = {};
    for (const f of FIELDS) body[f.key] = null;
    await api.upsertWater(dailyLogId, body);
    onChange();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dailyLogId) return;
    const body: WaterParametersUpsert = {};
    for (const f of FIELDS) {
      const v = draft[f.key];
      body[f.key] = v === "" || v == null ? null : Number(v);
    }
    await api.upsertWater(dailyLogId, body);
    setEditing(false);
    onChange();
  }

  return (
    <section className="bg-white rounded-lg shadow p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Water parameters</h3>
        {canManage && (
          <div className="flex gap-3">
            {hasData && !editing && (
              <button onClick={clear} className="text-sm text-red-600 hover:underline">
                Clear
              </button>
            )}
            <button onClick={() => setEditing((v) => !v)} className="text-sm text-primary hover:underline">
              {editing ? "Cancel" : hasData ? "Edit" : "Add"}
            </button>
          </div>
        )}
      </div>

      {editing && canManage ? (
        <form onSubmit={save} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="text-sm">
              <span className="text-slate-500">
                {f.label}
                {f.unit ? ` (${f.unit})` : ""}
              </span>
              <input
                type="number"
                step={f.step ?? "any"}
                value={draft[f.key] ?? ""}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                className="mt-1 w-full border rounded px-2 py-1"
              />
            </label>
          ))}
          <button className="col-span-2 sm:col-span-3 bg-primary text-white py-1 rounded text-sm">
            Save
          </button>
        </form>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          {FIELDS.map((f) => (
            <Link
              key={f.key}
              href={`/cycles/${cycleId}/trends?metric=${f.key}`}
              className="block rounded border border-transparent p-2 -m-2 hover:border-slate-200 hover:bg-slate-50 transition"
            >
              <div className="text-slate-500 text-xs">{f.label}</div>
              <div>
                {water?.[f.key] != null ? (
                  <>
                    {water[f.key]}
                    {f.unit ? ` ${f.unit}` : ""}
                  </>
                ) : (
                  "—"
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
