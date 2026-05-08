"use client";

import Link from "next/link";
import { useState } from "react";
import { api, type FarmRole, type Grid, type Pond } from "@/lib/api";
import { CollapsibleSection } from "./CollapsibleSection";

function canAdd(role: FarmRole | null) {
  return role === "admin" || role === "owner" || role === "operator";
}

function canManage(role: FarmRole | null) {
  return role === "admin" || role === "owner";
}

export function GridsSection({
  farmId,
  grids,
  ponds,
  role,
  open,
  onToggle,
  onReload,
}: {
  farmId: string;
  grids: Grid[];
  ponds: Pond[];
  role: FarmRole | null;
  open: boolean;
  onToggle: () => void;
  onReload: () => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const pondCount = (gridId: string) => ponds.filter((p) => p.grid_id === gridId).length;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await api.createGrid({ farm_id: farmId, name: newName.trim() });
    setNewName("");
    setShowNew(false);
    onReload();
  }

  async function save(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (!editName.trim()) return;
    await api.updateGrid(id, { name: editName.trim() });
    setEditingId(null);
    onReload();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete grid "${name}" and all its ponds/cycles? This cannot be undone.`)) return;
    await api.deleteGrid(id);
    onReload();
  }

  return (
    <CollapsibleSection
      title="Grids"
      count={grids.length}
      open={open}
      onToggle={onToggle}
      action={
        canAdd(role) ? (
          <button
            onClick={() => setShowNew((v) => !v)}
            className="text-sm bg-primary text-white px-3 py-1 rounded"
          >
            + New grid
          </button>
        ) : null
      }
    >
      {showNew && (
        <form onSubmit={create} className="flex gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Grid name (e.g. Grid A)"
            className="flex-1 border rounded px-3 py-2"
          />
          <button className="bg-primary text-white px-4 rounded">Add</button>
          <button type="button" onClick={() => setShowNew(false)} className="border px-3 rounded">Cancel</button>
        </form>
      )}

      {grids.length === 0 ? (
        <p className="text-slate-500 text-sm">No grids yet. Create one to organize your ponds.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {grids.map((g) => (
            <li key={g.id} className="bg-white rounded-lg shadow p-4">
              {editingId === g.id ? (
                <form onSubmit={(e) => save(e, g.id)} className="space-y-2">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full border rounded px-2 py-1"
                  />
                  <div className="flex gap-2">
                    <button className="text-xs bg-primary text-white px-3 py-1 rounded">Save</button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs border px-3 py-1 rounded">Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <Link href={`/grids/${g.id}`} className="block">
                    <div className="font-medium">{g.name}</div>
                    <div className="text-sm text-slate-500">{pondCount(g.id)} pond(s)</div>
                  </Link>
                  {canManage(role) && (
                    <div className="flex gap-3 mt-2">
                      <button
                        onClick={() => { setEditingId(g.id); setEditName(g.name); setShowNew(false); }}
                        className="text-xs text-primary hover:underline"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => remove(g.id, g.name)}
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
