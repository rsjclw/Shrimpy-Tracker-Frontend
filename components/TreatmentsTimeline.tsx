"use client";

import { useState } from "react";

import { api, type Treatment } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";

type Props = {
  dailyLogId: string | null;
  treatments: Treatment[];
  canAdd: boolean;
  canManage: boolean;
  onChange: () => void;
};

type TreatmentDraft = {
  treatment_time: string;
  action: string;
  notes: string;
};

function emptyDraft(): TreatmentDraft {
  return { treatment_time: "08:00", action: "", notes: "" };
}

function treatmentToDraft(t: Treatment): TreatmentDraft {
  return {
    treatment_time: t.treatment_time.slice(0, 5),
    action: t.action,
    notes: t.notes ?? "",
  };
}

async function currentUserEmail(): Promise<string | undefined> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.email ?? undefined;
}

function TreatmentForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitLabel = "Save",
}: {
  value: TreatmentDraft;
  onChange: (v: TreatmentDraft) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitLabel?: string;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <label className="text-sm block">
        Time
        <input
          type="time"
          value={value.treatment_time}
          onChange={(e) => onChange({ ...value, treatment_time: e.target.value })}
          className="mt-1 w-full border rounded px-2 py-1"
        />
      </label>
      <label className="text-sm block">
        Action
        <input
          required
          value={value.action}
          onChange={(e) => onChange({ ...value, action: e.target.value })}
          className="mt-1 w-full border rounded px-2 py-1"
        />
      </label>
      <label className="text-sm block">
        Notes
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          className="mt-1 w-full border rounded px-2 py-1"
          rows={2}
        />
      </label>
      <div className="flex gap-2">
        <button className="bg-primary text-white px-4 py-1 rounded text-sm">{submitLabel}</button>
        <button type="button" onClick={onCancel} className="border px-3 py-1 rounded text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function TreatmentsTimeline({ dailyLogId, treatments, canAdd, canManage, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TreatmentDraft>(emptyDraft());
  const [editDraft, setEditDraft] = useState<TreatmentDraft>(emptyDraft());

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!dailyLogId) return;
    const worker = await currentUserEmail();
    await api.createTreatment(dailyLogId, {
      treatment_time: draft.treatment_time,
      action: draft.action.trim(),
      worker,
      notes: draft.notes.trim() || undefined,
    });
    setAdding(false);
    setDraft(emptyDraft());
    setExpanded(true);
    onChange();
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const worker = await currentUserEmail();
    await api.updateTreatment(editingId, {
      treatment_time: editDraft.treatment_time,
      action: editDraft.action.trim(),
      worker,
      notes: editDraft.notes.trim() || undefined,
    });
    setEditingId(null);
    onChange();
  }

  async function del(id: string) {
    if (!confirm("Delete this treatment?")) return;
    await api.deleteTreatment(id);
    onChange();
  }

  async function clearAll() {
    if (!confirm("Clear all treatments for this day?")) return;
    await Promise.all(treatments.map((t) => api.deleteTreatment(t.id)));
    onChange();
  }

  const sorted = [...treatments].sort((a, b) =>
    a.treatment_time.localeCompare(b.treatment_time),
  );

  return (
    <section className="bg-white rounded-lg shadow p-4 space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 font-medium"
        >
          {expanded ? "▾" : "▸"} Treatments ({treatments.length})
        </button>
        <div className="flex items-center gap-3">
          {canManage && treatments.length > 0 && (
            <button onClick={clearAll} className="text-sm text-red-600 hover:underline">
              Clear all
            </button>
          )}
          <span className="text-xs text-slate-500">
            {expanded ? "click to collapse" : "click to expand"}
          </span>
        </div>
      </div>

      {expanded && (
        <>
          {sorted.length === 0 ? (
            <p className="text-sm text-slate-500">No treatments logged.</p>
          ) : (
            <ol className="border-l-2 border-slate-200 pl-4 space-y-3">
              {sorted.map((t) => (
                <li key={t.id} className="relative">
                  <span className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-primary" />

                  {editingId === t.id ? (
                    <TreatmentForm
                      value={editDraft}
                      onChange={setEditDraft}
                      onSubmit={saveEdit}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <>
                      <div className="text-xs text-slate-500">
                        {t.treatment_time.slice(0, 5)}
                        {t.worker ? ` · ${t.worker}` : ""}
                      </div>
                      <div className="text-sm">{t.action}</div>
                      {t.notes && <div className="text-xs text-slate-500">{t.notes}</div>}
                      {canManage && (
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => { setEditingId(t.id); setEditDraft(treatmentToDraft(t)); setAdding(false); }}
                          className="text-xs text-primary hover:underline"
                        >
                          edit
                        </button>
                        <button
                          onClick={() => del(t.id)}
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
            </ol>
          )}

          {!adding && !editingId && canAdd && (
            <button
              onClick={() => setAdding(true)}
              className="text-sm bg-primary text-white px-3 py-1 rounded"
            >
              + Add treatment
            </button>
          )}

          {adding && canAdd && (
            <div className="border-t pt-3">
              <TreatmentForm
                value={draft}
                onChange={setDraft}
                onSubmit={add}
                onCancel={() => setAdding(false)}
                submitLabel="Add"
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
