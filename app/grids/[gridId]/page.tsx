"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api, type Farm, type FarmRole, type Grid, type Pond } from "@/lib/api";

function canAdd(role: FarmRole | null) {
  return role === "admin" || role === "owner" || role === "operator";
}

function canManage(role: FarmRole | null) {
  return role === "admin" || role === "owner";
}

export default function GridPage() {
  const { gridId } = useParams<{ gridId: string }>();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [ponds, setPonds] = useState<Pond[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editArea, setEditArea] = useState("");

  useEffect(() => {
    reload();
  }, [gridId]);

  async function reload() {
    const [visibleFarms, grids] = await Promise.all([api.listFarms(), api.listGrids()]);
    setFarms(visibleFarms);
    setGrid(grids.find((g) => g.id === gridId) ?? null);
    setPonds(await api.listGridPonds(gridId));
  }

  async function createPond(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.createPond({
      grid_id: gridId,
      name: name.trim(),
      ...(area ? { area_m2: Number(area) } : {}),
    });
    setName("");
    setArea("");
    setShowForm(false);
    reload();
  }

  async function saveEdit(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (!editName.trim()) return;
    await api.updatePond(id, {
      name: editName.trim(),
      ...(editArea ? { area_m2: Number(editArea) } : {}),
    });
    setEditingId(null);
    reload();
  }

  async function deletePond(id: string, pondName: string) {
    if (!confirm(`Delete pond "${pondName}" and all its cycles? This cannot be undone.`)) return;
    await api.deletePond(id);
    reload();
  }

  const role = farms.find((farm) => farm.id === grid?.farm_id)?.role ?? null;

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <Link href="/" className="text-sm text-slate-500 hover:underline">
        &larr; Farm
      </Link>
      <h1 className="text-2xl font-semibold">{grid?.name ?? "..."}</h1>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Ponds</h2>
          {canAdd(role) && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-sm bg-primary text-white px-3 py-1 rounded"
          >
            + New pond
          </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={createPond} className="flex flex-col sm:flex-row gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pond name"
              className="flex-1 border rounded px-3 py-2"
            />
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Area (m2)"
              type="number"
              step="any"
              className="sm:w-40 border rounded px-3 py-2"
            />
            <button className="bg-primary text-white px-4 rounded py-2">Add</button>
            <button type="button" onClick={() => setShowForm(false)} className="border px-3 rounded py-2">
              Cancel
            </button>
          </form>
        )}

        {ponds.length === 0 ? (
          <p className="text-slate-500 text-sm">No ponds yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {ponds.map((p) => (
              <li key={p.id} className="bg-white rounded-lg shadow p-4">
                {editingId === p.id ? (
                  <form onSubmit={(e) => saveEdit(e, p.id)} className="space-y-2">
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Pond name"
                      className="w-full border rounded px-2 py-1"
                    />
                    <input
                      value={editArea}
                      onChange={(e) => setEditArea(e.target.value)}
                      placeholder="Area (m2)"
                      type="number"
                      step="any"
                      className="w-full border rounded px-2 py-1"
                    />
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
                    <Link href={`/ponds/${p.id}`} className="block">
                      <div className="font-medium">{p.name}</div>
                      {p.area_m2 && (
                        <div className="text-sm text-slate-500">{p.area_m2} m2</div>
                      )}
                    </Link>
                    {canManage(role) && (
                    <div className="flex gap-3 mt-2">
                      <button
                        onClick={() => {
                          setEditingId(p.id);
                          setEditName(p.name);
                          setEditArea(p.area_m2 ?? "");
                          setShowForm(false);
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => deletePond(p.id, p.name)}
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
