"use client";

import { useState } from "react";
import { api, type FarmRole, type FeedType } from "@/lib/api";
import { CollapsibleSection } from "./CollapsibleSection";

const emptyForm = { brand: "", type: "", price_per_kg: "", notes: "" };

function canAdd(role: FarmRole | null) {
  return role === "admin" || role === "owner" || role === "operator";
}

function canManage(role: FarmRole | null) {
  return role === "admin" || role === "owner";
}

export function FeedTypesSection({
  farmId,
  feedTypes,
  role,
  open,
  onToggle,
  onReload,
}: {
  farmId: string;
  feedTypes: FeedType[];
  role: FarmRole | null;
  open: boolean;
  onToggle: () => void;
  onReload: () => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brand.trim() || !form.type.trim() || !form.price_per_kg.trim()) return;
    await api.createFeedType({
      farm_id: farmId,
      brand: form.brand.trim(),
      type: form.type.trim(),
      price_per_kg: Number(form.price_per_kg),
      notes: form.notes.trim() || null,
    });
    setForm(emptyForm);
    setShowNew(false);
    onReload();
  }

  async function save(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (!editForm.brand.trim() || !editForm.type.trim() || !editForm.price_per_kg.trim()) return;
    await api.updateFeedType(id, {
      brand: editForm.brand.trim(),
      type: editForm.type.trim(),
      price_per_kg: Number(editForm.price_per_kg),
      notes: editForm.notes.trim() || null,
    });
    setEditingId(null);
    onReload();
  }

  async function remove(id: string, label: string) {
    if (!confirm(`Delete feed type "${label}"? Existing feeding logs keep their saved snapshot.`)) return;
    await api.deleteFeedType(id);
    onReload();
  }

  return (
    <CollapsibleSection
      title="Feed types"
      count={feedTypes.length}
      open={open}
      onToggle={onToggle}
      action={
        canAdd(role) ? (
          <button
            onClick={() => setShowNew((v) => !v)}
            className="text-sm bg-primary text-white px-3 py-1 rounded"
          >
            + New feed type
          </button>
        ) : null
      }
    >
      {showNew && (
        <form onSubmit={create} className="bg-white rounded-lg shadow p-4 space-y-3">
          <div className="grid sm:grid-cols-4 gap-2">
            <input autoFocus value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Brand" className="border rounded px-3 py-2" />
            <input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="Type" className="border rounded px-3 py-2" />
            <input type="number" step="0.01" value={form.price_per_kg} onChange={(e) => setForm({ ...form, price_per_kg: e.target.value })} placeholder="Price/kg" className="border rounded px-3 py-2" />
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" className="border rounded px-3 py-2" />
          </div>
          <div className="flex gap-2">
            <button className="bg-primary text-white px-4 py-1 rounded text-sm">Add</button>
            <button type="button" onClick={() => setShowNew(false)} className="border px-3 py-1 rounded text-sm">Cancel</button>
          </div>
        </form>
      )}

      {feedTypes.length === 0 ? (
        <p className="text-slate-500 text-sm">No feed types yet.</p>
      ) : (
        <ul className="grid gap-3">
          {feedTypes.map((item) => (
            <li key={item.id} className="bg-white rounded-lg shadow p-4">
              {editingId === item.id ? (
                <form onSubmit={(e) => save(e, item.id)} className="space-y-3">
                  <div className="grid sm:grid-cols-4 gap-2">
                    <input autoFocus value={editForm.brand} onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })} className="border rounded px-2 py-1" />
                    <input value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })} className="border rounded px-2 py-1" />
                    <input type="number" step="0.01" value={editForm.price_per_kg} onChange={(e) => setEditForm({ ...editForm, price_per_kg: e.target.value })} className="border rounded px-2 py-1" />
                    <input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="border rounded px-2 py-1" />
                  </div>
                  <div className="flex gap-2">
                    <button className="text-xs bg-primary text-white px-3 py-1 rounded">Save</button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs border px-3 py-1 rounded">Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="font-medium">{item.brand} {item.type}</div>
                  <div className="text-sm text-slate-500">
                    {Number(item.price_per_kg).toLocaleString(undefined, { maximumFractionDigits: 2 })}/kg
                    {item.notes ? ` - ${item.notes}` : ""}
                  </div>
                  {canManage(role) && (
                    <div className="flex gap-3 mt-2">
                      <button
                        onClick={() => {
                          setEditingId(item.id);
                          setEditForm({ brand: item.brand, type: item.type, price_per_kg: item.price_per_kg, notes: item.notes ?? "" });
                          setShowNew(false);
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => remove(item.id, `${item.brand} ${item.type}`)}
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
