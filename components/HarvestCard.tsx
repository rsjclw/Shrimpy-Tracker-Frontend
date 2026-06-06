"use client";

import { useState } from "react";

import { api, type Harvest } from "@/lib/api";

type Props = {
  dailyLogId: string | null;
  harvests: Harvest[];
  canAdd: boolean;
  canManage: boolean;
  onChange: () => void;
};

type HarvestDraft = {
  harvest_time: string;
  biomass_kg: string;
  sampled_abw_g: string;
  total_price: string;
  notes: string;
};

function emptyDraft(): HarvestDraft {
  return { harvest_time: "08:00", biomass_kg: "", sampled_abw_g: "", total_price: "", notes: "" };
}

function harvestToDraft(harvest: Harvest): HarvestDraft {
  return {
    harvest_time: harvest.harvest_time.slice(0, 5),
    biomass_kg: Number(harvest.biomass_kg).toFixed(2),
    sampled_abw_g: Number(harvest.sampled_abw_g).toFixed(2),
    total_price: Number(harvest.total_price).toFixed(2),
    notes: harvest.notes ?? "",
  };
}

function money(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function HarvestForm({
  draft,
  setDraft,
  onSubmit,
  submitLabel,
  onCancel,
}: {
  draft: HarvestDraft;
  setDraft: (next: HarvestDraft) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
  onCancel?: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="grid sm:grid-cols-4 gap-2">
        <label className="text-sm">
          Time
          <input
            type="time"
            required
            value={draft.harvest_time}
            onChange={(e) => setDraft({ ...draft, harvest_time: e.target.value })}
            className="mt-1 w-full border rounded px-2 py-1"
          />
        </label>
        <label className="text-sm">
          Biomass (kg)
          <input
            type="number"
            step="any"
            min="0.01"
            required
            value={draft.biomass_kg}
            onChange={(e) => setDraft({ ...draft, biomass_kg: e.target.value })}
            className="mt-1 w-full border rounded px-2 py-1"
          />
        </label>
        <label className="text-sm">
          Sampled ABW (g)
          <input
            type="number"
            step="any"
            min="0.0001"
            required
            value={draft.sampled_abw_g}
            onChange={(e) => setDraft({ ...draft, sampled_abw_g: e.target.value })}
            className="mt-1 w-full border rounded px-2 py-1"
          />
        </label>
        <label className="text-sm">
          Total price
          <input
            type="number"
            step="any"
            min="0"
            required
            value={draft.total_price}
            onChange={(e) => setDraft({ ...draft, total_price: e.target.value })}
            className="mt-1 w-full border rounded px-2 py-1"
          />
        </label>
      </div>
      <label className="text-sm block">
        Notes
        <textarea
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          rows={2}
          className="mt-1 w-full border rounded px-2 py-1"
        />
      </label>
      <div className="flex gap-2">
        <button className="bg-primary text-white px-3 py-1 rounded text-sm">{submitLabel}</button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="border px-3 py-1 rounded text-sm">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function HarvestCard({ dailyLogId, harvests, canAdd, canManage, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [editDraft, setEditDraft] = useState(emptyDraft());

  const totalBiomass = harvests.reduce((sum, h) => sum + Number(h.biomass_kg), 0);
  const totalPrice = harvests.reduce((sum, h) => sum + Number(h.total_price), 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!dailyLogId) return;
    await api.createHarvest(dailyLogId, {
      harvest_time: draft.harvest_time,
      biomass_kg: Number(draft.biomass_kg),
      sampled_abw_g: Number(draft.sampled_abw_g),
      total_price: Number(draft.total_price),
      notes: draft.notes.trim() || undefined,
    });
    setAdding(false);
    setDraft(emptyDraft());
    onChange();
  }

  async function saveEdit(e: React.FormEvent, id: string) {
    e.preventDefault();
    await api.updateHarvest(id, {
      harvest_time: editDraft.harvest_time,
      biomass_kg: Number(editDraft.biomass_kg),
      sampled_abw_g: Number(editDraft.sampled_abw_g),
      total_price: Number(editDraft.total_price),
      notes: editDraft.notes.trim() || null,
    });
    setEditingId(null);
    onChange();
  }

  async function del(id: string) {
    if (!confirm("Delete this harvest?")) return;
    await api.deleteHarvest(id);
    onChange();
  }

  return (
    <section className="bg-white rounded-lg shadow p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Harvest</h3>
          <div className="text-xs text-slate-500">
            {totalBiomass.toFixed(2)} kg - total price {money(totalPrice)}
          </div>
        </div>
        {canAdd && (
        <button
          onClick={() => {
            setAdding((v) => !v);
            setEditingId(null);
          }}
          className="text-sm bg-primary text-white px-3 py-1 rounded"
        >
          + Harvest
        </button>
        )}
      </div>

      {harvests.length === 0 ? (
        <p className="text-sm text-slate-500">No harvests logged yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1">Time</th>
              <th>Biomass</th>
              <th>ABW</th>
              <th>Count</th>
              <th>Total price</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {harvests.map((h) =>
              editingId === h.id ? (
                <tr key={h.id} className="border-t">
                  <td colSpan={6} className="py-2">
                    <HarvestForm
                      draft={editDraft}
                      setDraft={setEditDraft}
                      onSubmit={(e) => saveEdit(e, h.id)}
                      submitLabel="Save"
                      onCancel={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={h.id} className="border-t">
                  <td className="py-2">{h.harvest_time.slice(0, 5)}</td>
                  <td>{Number(h.biomass_kg).toFixed(2)} kg</td>
                  <td>{Number(h.sampled_abw_g).toFixed(2)} g</td>
                  <td>{h.estimated_count.toLocaleString()}</td>
                  <td>{money(Number(h.total_price))}</td>
                  <td className="flex gap-2 py-2">
                    {canManage && (
                    <>
                    <button
                      onClick={() => {
                        setEditingId(h.id);
                        setEditDraft(harvestToDraft(h));
                        setAdding(false);
                      }}
                      className="text-primary hover:underline text-xs"
                    >
                      edit
                    </button>
                    <button onClick={() => del(h.id)} className="text-red-600 hover:underline text-xs">
                      delete
                    </button>
                    </>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}

      {adding && canAdd && (
        <div className="border-t pt-3">
          <HarvestForm
            draft={draft}
            setDraft={setDraft}
            onSubmit={add}
            submitLabel="Save"
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
    </section>
  );
}
