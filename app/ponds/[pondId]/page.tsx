"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api, type BlindFeedingTemplate, type Cycle, type Farm, type FarmRole, type Grid, type Pond } from "@/lib/api";

function canAdd(role: FarmRole | null) {
  return role === "admin" || role === "owner" || role === "operator";
}

function canManage(role: FarmRole | null) {
  return role === "admin" || role === "owner";
}

const STATUS_OPTIONS = ["active", "completed", "crashed"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyCycleForm() {
  return {
    name: "",
    start_date: todayIso(),
    target_doc: "",
    initial_population: "",
    initial_abw_g: "0",
    maximum_daily_feed_capacity_kg: "",
    stable_carrying_capacity_kg_per_m3: "",
    final_carrying_capacity_kg_per_m3: "",
    feeding_index_increment: "0.010",
    maximum_feeding_index: "",
    blind_feeding_template_id: "",
    blind_feeding_target_abw_g: "",
  };
}

function docToPlannedDate(startDate: string, docStr: string): string | undefined {
  const doc = Math.floor(Number(docStr));
  if (!startDate || !Number.isFinite(doc) || doc < 1) return undefined;
  const d = new Date(startDate);
  d.setUTCDate(d.getUTCDate() + doc - 1);
  return d.toISOString().slice(0, 10);
}

function plannedDateToDoc(startDate: string, endDate: string | null): string {
  if (!startDate || !endDate) return "";
  const diff = Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000,
  );
  return diff >= 0 ? String(diff + 1) : "";
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

function nullableNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

function formatIndex(value: string | null | undefined) {
  return value ? Number(value).toFixed(3) : "";
}

function formatKg(value: string | null | undefined) {
  return value ? `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 })} kg` : null;
}

function formatCapacity(value: string | null | undefined) {
  return value ? `${Number(value).toFixed(3)} kg/m3` : null;
}

function formatTemplateOption(template: BlindFeedingTemplate) {
  return `${template.name} - ${template.duration_days}d - ${Number(template.cumulative_feed_per_100k).toLocaleString(undefined, { maximumFractionDigits: 3 })} kg/100k`;
}

export default function PondPage() {
  const { pondId } = useParams<{ pondId: string }>();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [grids, setGrids] = useState<Grid[]>([]);
  const [pond, setPond] = useState<Pond | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [blindFeedingTemplates, setBlindFeedingTemplates] = useState<BlindFeedingTemplate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyCycleForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    status: "active",
    target_doc: "",
    maximum_daily_feed_capacity_kg: "",
    stable_carrying_capacity_kg_per_m3: "",
    final_carrying_capacity_kg_per_m3: "",
    feeding_index_increment: "0.010",
    maximum_feeding_index: "",
    notes: "",
  });

  useEffect(() => {
    reload();
  }, [pondId]);

  async function reload() {
    const [visibleFarms, visibleGrids, currentPond, pondCycles] = await Promise.all([
      api.listFarms(),
      api.listGrids(),
      api.getPond(pondId),
      api.listPondCycles(pondId),
    ]);
    const currentFarmId = visibleGrids.find((grid) => grid.id === currentPond.grid_id)?.farm_id;
    const templates = currentFarmId ? await api.listBlindFeedingTemplates(currentFarmId) : [];
    setFarms(visibleFarms);
    setGrids(visibleGrids);
    setPond(currentPond);
    setCycles(pondCycles);
    setBlindFeedingTemplates(templates);
  }

  async function createCycle(e: React.FormEvent) {
    e.preventDefault();
    await api.createCycle({
      pond_id: pondId,
      name: form.name.trim(),
      start_date: form.start_date,
      planned_end_date: docToPlannedDate(form.start_date, form.target_doc),
      initial_population: Number(form.initial_population),
      initial_abw_g: Number(form.initial_abw_g),
      blind_feeding_template_id: form.blind_feeding_template_id || undefined,
      blind_feeding_target_abw_g: form.blind_feeding_template_id ? optionalNumber(form.blind_feeding_target_abw_g) : undefined,
      maximum_daily_feed_capacity_kg: optionalNumber(form.maximum_daily_feed_capacity_kg),
      stable_carrying_capacity_kg_per_m3: optionalNumber(form.stable_carrying_capacity_kg_per_m3),
      final_carrying_capacity_kg_per_m3: optionalNumber(form.final_carrying_capacity_kg_per_m3),
      feeding_index_increment: optionalNumber(form.feeding_index_increment) ?? 0.01,
      maximum_feeding_index: optionalNumber(form.maximum_feeding_index),
    });
    setShowForm(false);
    setForm(emptyCycleForm());
    reload();
  }

  async function saveEdit(e: React.FormEvent, id: string) {
    e.preventDefault();
    const cycleStartDate = cycles.find((c) => c.id === id)?.start_date ?? "";
    await api.updateCycle(id, {
      name: editForm.name.trim(),
      status: editForm.status,
      planned_end_date: docToPlannedDate(cycleStartDate, editForm.target_doc),
      maximum_daily_feed_capacity_kg: nullableNumber(editForm.maximum_daily_feed_capacity_kg),
      stable_carrying_capacity_kg_per_m3: nullableNumber(editForm.stable_carrying_capacity_kg_per_m3),
      final_carrying_capacity_kg_per_m3: nullableNumber(editForm.final_carrying_capacity_kg_per_m3),
      feeding_index_increment: nullableNumber(editForm.feeding_index_increment) ?? 0.01,
      maximum_feeding_index: nullableNumber(editForm.maximum_feeding_index),
      notes: editForm.notes.trim() || undefined,
    });
    setEditingId(null);
    reload();
  }

  async function deleteCycle(id: string, cycleName: string) {
    if (!confirm(`Delete cycle "${cycleName}" and all its daily logs? This cannot be undone.`)) return;
    await api.deleteCycle(id);
    reload();
  }

  const farmId = grids.find((grid) => grid.id === pond?.grid_id)?.farm_id;
  const role = farms.find((farm) => farm.id === farmId)?.role ?? null;

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <Link href="/" className="text-sm text-slate-500 hover:underline">
        &larr; Farm
      </Link>
      <h1 className="text-2xl font-semibold">{pond?.name ?? "..."}</h1>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Cycles</h2>
          {canAdd(role) && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-sm bg-primary text-white px-3 py-1 rounded"
          >
            + New cycle
          </button>
          )}
        </div>

        {showForm && (
          <form
            onSubmit={createCycle}
            className="bg-white p-4 rounded-lg shadow space-y-3"
          >
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm">Name</span>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Start date (DOC 1)</span>
                <input
                  type="date"
                  required
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Target final DOC</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 120"
                  value={form.target_doc}
                  onChange={(e) => setForm({ ...form, target_doc: e.target.value })}
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Initial population</span>
                <input
                  required
                  type="number"
                  value={form.initial_population}
                  onChange={(e) =>
                    setForm({ ...form, initial_population: e.target.value })
                  }
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Maximum daily feed capacity (kg)</span>
                <input
                  type="number"
                  step="0.001"
                  value={form.maximum_daily_feed_capacity_kg}
                  onChange={(e) =>
                    setForm({ ...form, maximum_daily_feed_capacity_kg: e.target.value })
                  }
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Maximum feeding index</span>
                <input
                  type="number"
                  step="0.001"
                  value={form.maximum_feeding_index}
                  onChange={(e) =>
                    setForm({ ...form, maximum_feeding_index: e.target.value })
                  }
                  onBlur={(e) =>
                    setForm({ ...form, maximum_feeding_index: formatIndex(e.target.value) })
                  }
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Feeding index increment</span>
                <input
                  type="number"
                  step="0.001"
                  value={form.feeding_index_increment}
                  onChange={(e) =>
                    setForm({ ...form, feeding_index_increment: e.target.value })
                  }
                  onBlur={(e) =>
                    setForm({
                      ...form,
                      feeding_index_increment: (optionalNumber(e.target.value) ?? 0.01).toFixed(3),
                    })
                  }
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Stable carrying capacity (kg/m3)</span>
                <input
                  type="number"
                  step="0.001"
                  value={form.stable_carrying_capacity_kg_per_m3}
                  onChange={(e) =>
                    setForm({ ...form, stable_carrying_capacity_kg_per_m3: e.target.value })
                  }
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Final carrying capacity (kg/m3)</span>
                <input
                  type="number"
                  step="0.001"
                  value={form.final_carrying_capacity_kg_per_m3}
                  onChange={(e) =>
                    setForm({ ...form, final_carrying_capacity_kg_per_m3: e.target.value })
                  }
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Initial ABW (g)</span>
                <input
                  required
                  type="number"
                  step="0.0001"
                  value={form.initial_abw_g}
                  onChange={(e) =>
                    setForm({ ...form, initial_abw_g: e.target.value })
                  }
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm">Blind feeding template</span>
                <select
                  value={form.blind_feeding_template_id}
                  onChange={(e) => setForm({ ...form, blind_feeding_template_id: e.target.value })}
                  className="mt-1 w-full border rounded px-3 py-2"
                >
                  <option value="">No blind feeding</option>
                  {blindFeedingTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {formatTemplateOption(template)}
                    </option>
                  ))}
                </select>
              </label>
              {form.blind_feeding_template_id && (
                <label className="block sm:col-span-2">
                  <span className="text-sm">Target ABW after blind feeding (g)</span>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={form.blind_feeding_target_abw_g}
                    onChange={(e) => setForm({ ...form, blind_feeding_target_abw_g: e.target.value })}
                    className="mt-1 w-full border rounded px-3 py-2"
                    placeholder="e.g. 1.5"
                  />
                  <span className="text-xs text-slate-500">
                    A sampling day will be created automatically on the day after blind feeding ends.
                  </span>
                </label>
              )}
            </div>
            <div className="flex gap-2">
              <button className="bg-primary text-white px-4 py-2 rounded">Create</button>
              <button type="button" onClick={() => setShowForm(false)} className="border px-4 py-2 rounded">
                Cancel
              </button>
            </div>
          </form>
        )}

        {cycles.length === 0 ? (
          <p className="text-slate-500 text-sm">No cycles yet.</p>
        ) : (
          <ul className="grid gap-3">
            {cycles.map((c) => (
              <li key={c.id} className="bg-white rounded-lg shadow p-4">
                {editingId === c.id ? (
                  <form onSubmit={(e) => saveEdit(e, c.id)} className="space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-sm">Name</span>
                        <input
                          autoFocus
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="mt-1 w-full border rounded px-2 py-1"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm">Status</span>
                        <select
                          value={editForm.status}
                          onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                          className="mt-1 w-full border rounded px-2 py-1"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-sm">Target final DOC</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="e.g. 120"
                          value={editForm.target_doc}
                          onChange={(e) =>
                            setEditForm({ ...editForm, target_doc: e.target.value })
                          }
                          className="mt-1 w-full border rounded px-2 py-1"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm">Maximum daily feed capacity (kg)</span>
                        <input
                          type="number"
                          step="0.001"
                          value={editForm.maximum_daily_feed_capacity_kg}
                          onChange={(e) =>
                            setEditForm({ ...editForm, maximum_daily_feed_capacity_kg: e.target.value })
                          }
                          className="mt-1 w-full border rounded px-2 py-1"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm">Maximum feeding index</span>
                        <input
                          type="number"
                          step="0.001"
                          value={editForm.maximum_feeding_index}
                          onChange={(e) =>
                            setEditForm({ ...editForm, maximum_feeding_index: e.target.value })
                          }
                          onBlur={(e) =>
                            setEditForm({ ...editForm, maximum_feeding_index: formatIndex(e.target.value) })
                          }
                          className="mt-1 w-full border rounded px-2 py-1"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm">Feeding index increment</span>
                        <input
                          type="number"
                          step="0.001"
                          value={editForm.feeding_index_increment}
                          onChange={(e) =>
                            setEditForm({ ...editForm, feeding_index_increment: e.target.value })
                          }
                          onBlur={(e) =>
                            setEditForm({
                              ...editForm,
                              feeding_index_increment: (optionalNumber(e.target.value) ?? 0.01).toFixed(3),
                            })
                          }
                          className="mt-1 w-full border rounded px-2 py-1"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm">Stable carrying capacity (kg/m3)</span>
                        <input
                          type="number"
                          step="0.001"
                          value={editForm.stable_carrying_capacity_kg_per_m3}
                          onChange={(e) =>
                            setEditForm({ ...editForm, stable_carrying_capacity_kg_per_m3: e.target.value })
                          }
                          className="mt-1 w-full border rounded px-2 py-1"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm">Final carrying capacity (kg/m3)</span>
                        <input
                          type="number"
                          step="0.001"
                          value={editForm.final_carrying_capacity_kg_per_m3}
                          onChange={(e) =>
                            setEditForm({ ...editForm, final_carrying_capacity_kg_per_m3: e.target.value })
                          }
                          className="mt-1 w-full border rounded px-2 py-1"
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-sm">Notes</span>
                      <textarea
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        rows={2}
                        className="mt-1 w-full border rounded px-2 py-1"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button className="text-xs bg-primary text-white px-3 py-1 rounded">
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-xs border px-3 py-1 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <Link href={`/cycles/${c.id}`} className="block">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs uppercase tracking-wide text-slate-500">
                          {c.status}
                        </span>
                      </div>
                      <div className="text-sm text-slate-500">
                        Started {c.start_date}
                        {plannedDateToDoc(c.start_date, c.planned_end_date) && (
                          <> &middot; Target DOC {plannedDateToDoc(c.start_date, c.planned_end_date)}</>
                        )}
                        {" "}&middot; {c.initial_population.toLocaleString()} stocked
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Index +{Number(c.feeding_index_increment).toFixed(3)}
                        {c.maximum_feeding_index
                          ? ` - max ${Number(c.maximum_feeding_index).toFixed(3)}`
                          : ""}
                      </div>
                      {(c.maximum_daily_feed_capacity_kg ||
                        c.stable_carrying_capacity_kg_per_m3 ||
                        c.final_carrying_capacity_kg_per_m3) && (
                        <div className="text-xs text-slate-400 mt-1">
                          {[
                            formatKg(c.maximum_daily_feed_capacity_kg)
                              ? `Max feed ${formatKg(c.maximum_daily_feed_capacity_kg)}`
                              : null,
                            formatCapacity(c.stable_carrying_capacity_kg_per_m3)
                              ? `Stable ${formatCapacity(c.stable_carrying_capacity_kg_per_m3)}`
                              : null,
                            formatCapacity(c.final_carrying_capacity_kg_per_m3)
                              ? `Final ${formatCapacity(c.final_carrying_capacity_kg_per_m3)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" - ")}
                        </div>
                      )}
                      {c.notes && (
                        <div className="text-xs text-slate-400 mt-1">{c.notes}</div>
                      )}
                    </Link>
                    {canManage(role) && (
                    <div className="flex gap-3 mt-2">
                      <button
                        onClick={() => {
                          setEditingId(c.id);
                          setEditForm({
                            name: c.name,
                            status: c.status,
                            target_doc: plannedDateToDoc(c.start_date, c.planned_end_date),
                            maximum_daily_feed_capacity_kg: c.maximum_daily_feed_capacity_kg ?? "",
                            stable_carrying_capacity_kg_per_m3:
                              c.stable_carrying_capacity_kg_per_m3 ?? "",
                            final_carrying_capacity_kg_per_m3:
                              c.final_carrying_capacity_kg_per_m3 ?? "",
                            feeding_index_increment: Number(c.feeding_index_increment).toFixed(3),
                            maximum_feeding_index: formatIndex(c.maximum_feeding_index),
                            notes: c.notes ?? "",
                          });
                          setShowForm(false);
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => deleteCycle(c.id, c.name)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        delete
                      </button>
                    </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
