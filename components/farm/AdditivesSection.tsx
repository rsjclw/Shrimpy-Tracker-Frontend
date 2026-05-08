"use client";

import { useState } from "react";
import { api, type FarmRole, type FeedAdditive } from "@/lib/api";
import { CollapsibleSection } from "./CollapsibleSection";

const emptyForm = { name: "", dosage_gr_per_kg: "" };

function canAdd(role: FarmRole | null) {
  return role === "admin" || role === "owner" || role === "operator";
}

function canManage(role: FarmRole | null) {
  return role === "admin" || role === "owner";
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

export function AdditivesSection({
  farmId,
  additives,
  role,
  open,
  onToggle,
  onReload,
}: {
  farmId: string;
  additives: FeedAdditive[];
  role: FarmRole | null;
  open: boolean;
  onToggle: () => void;
  onReload: () => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.createAdditive({
      farm_id: farmId,
      name: form.name.trim(),
      dosage_gr_per_kg: optionalNumber(form.dosage_gr_per_kg),
    });
    setForm(emptyForm);
    setShowNew(false);
    onReload();
  }

  async function save(e: React.FormEvent, id: number) {
    e.preventDefault();
    if (!editForm.name.trim()) return;
    await api.updateAdditive(id, {
      name: editForm.name.trim(),
      dosage_gr_per_kg: optionalNumber(editForm.dosage_gr_per_kg),
    });
    setEditingId(null);
    onReload();
  }

  async function remove(id: number, name: string) {
    if (!confirm(`Delete additive "${name}"? Existing feeding logs keep their saved snapshot.`)) return;
    await api.deleteAdditive(id);
    onReload();
  }

  return (
    <CollapsibleSection
      title="Feed additives"
      count={additives.length}
      open={open}
      onToggle={onToggle}
      action={
        canAdd(role) ? (
          <button
            onClick={() => setShowNew((v) => !v)}
            className="text-sm bg-primary text-white px-3 py-1 rounded"
          >
            + New additive
          </button>
        ) : null
      }
    >
      {showNew && (
        <form onSubmit={create} className="flex gap-2">
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Additive name"
            className="flex-1 border rounded px-3 py-2"
          />
          <input
            type="number"
            step="0.001"
            value={form.dosage_gr_per_kg}
            onChange={(e) => setForm({ ...form, dosage_gr_per_kg: e.target.value })}
            placeholder="gr/kg"
            className="w-28 border rounded px-3 py-2"
          />
          <button className="bg-primary text-white px-4 rounded">Add</button>
          <button type="button" onClick={() => setShowNew(false)} className="border px-3 rounded">Cancel</button>
        </form>
      )}

      {additives.length === 0 ? (
        <p className="text-slate-500 text-sm">No additives yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {additives.map((item) => (
            <li key={item.id} className="bg-white rounded-lg shadow p-4">
              {editingId === item.id ? (
                <form onSubmit={(e) => save(e, item.id)} className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="flex-1 border rounded px-2 py-1"
                    />
                    <input
                      type="number"
                      step="0.001"
                      value={editForm.dosage_gr_per_kg}
                      onChange={(e) => setEditForm({ ...editForm, dosage_gr_per_kg: e.target.value })}
                      className="w-24 border rounded px-2 py-1"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button className="text-xs bg-primary text-white px-3 py-1 rounded">Save</button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs border px-3 py-1 rounded">Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-sm text-slate-500">
                    {item.dosage_gr_per_kg ? `${Number(item.dosage_gr_per_kg).toLocaleString()} gr/kg` : "No default dosage"}
                  </div>
                  {canManage(role) && (
                    <div className="flex gap-3 mt-2">
                      <button
                        onClick={() => {
                          setEditingId(item.id);
                          setEditForm({ name: item.name, dosage_gr_per_kg: item.dosage_gr_per_kg ?? "" });
                          setShowNew(false);
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => remove(item.id, item.name)}
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
    </CollapsibleSection>
  );
}
