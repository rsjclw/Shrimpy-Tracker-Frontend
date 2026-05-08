"use client";

import Link from "next/link";
import { useState } from "react";

import { api, type WaterParameters } from "@/lib/api";

type Props = {
  cycleId: string;
  dailyLogId: string | null;
  water: WaterParameters | null;
  canManage: boolean;
  onChange: () => void;
};

const FIELDS: Array<{ key: keyof WaterParameters; label: string; unit?: string; step?: string }> =
  [
    { key: "do_am", label: "DO am", unit: "ppm", step: "0.01" },
    { key: "do_pm", label: "DO pm", unit: "ppm", step: "0.01" },
    { key: "ph_am", label: "pH am", step: "0.01" },
    { key: "ph_pm", label: "pH pm", step: "0.01" },
    { key: "salinity", label: "Salinity", unit: "ppt", step: "0.1" },
    { key: "tan", label: "TAN", unit: "ppm", step: "0.001" },
    { key: "nitrite", label: "Nitrite", unit: "ppm", step: "0.001" },
    { key: "phosphate", label: "Phosphate", unit: "ppm", step: "0.001" },
    { key: "calcium", label: "Calcium", unit: "ppm", step: "0.1" },
    { key: "magnesium", label: "Magnesium", unit: "ppm", step: "0.1" },
    { key: "alkalinity", label: "Alkalinity", unit: "ppm", step: "0.1" },
  ];

export function WaterParametersCard({ cycleId, dailyLogId, water, canManage, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    if (water) for (const f of FIELDS) d[f.key] = (water[f.key] as string) ?? "";
    return d;
  });

  async function clear() {
    if (!dailyLogId) return;
    if (!confirm("Clear all water parameters for this day?")) return;
    const body: Record<string, null> = {};
    for (const f of FIELDS) body[f.key] = null;
    await api.upsertWater(dailyLogId, body as never);
    onChange();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dailyLogId) return;
    const body: Record<string, number | null> = {};
    for (const f of FIELDS) {
      const v = draft[f.key];
      body[f.key] = v === "" || v == null ? null : Number(v);
    }
    await api.upsertWater(dailyLogId, body as never);
    setEditing(false);
    onChange();
  }

  return (
    <section className="bg-white rounded-lg shadow p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Water parameters</h3>
        {canManage && (
          <div className="flex gap-3">
            {water && !editing && (
              <button onClick={clear} className="text-sm text-red-600 hover:underline">
                Clear
              </button>
            )}
            <button onClick={() => setEditing((v) => !v)} className="text-sm text-primary hover:underline">
              {editing ? "Cancel" : water ? "Edit" : "Add"}
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
                step={f.step ?? "0.01"}
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
