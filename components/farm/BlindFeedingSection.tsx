"use client";

import { useMemo, useState } from "react";
import { api, type BlindFeedingTemplate, type FarmRole } from "@/lib/api";
import { CollapsibleSection } from "./CollapsibleSection";

const emptyForm = { name: "", values: "" };

function canAdd(role: FarmRole | null) {
  return role === "admin" || role === "owner" || role === "operator";
}

function canManage(role: FarmRole | null) {
  return role === "admin" || role === "owner";
}

function parseValues(raw: string) {
  return raw
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map(Number);
}

function valuesText(template: BlindFeedingTemplate) {
  return template.daily_feed_per_100k.join("\n");
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function BlindFeedingSection({
  farmId,
  templates,
  role,
  open,
  onToggle,
  onReload,
}: {
  farmId: string;
  templates: BlindFeedingTemplate[];
  role: FarmRole | null;
  open: boolean;
  onToggle: () => void;
  onReload: () => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const preview = useMemo(() => parseValues(form.values), [form.values]);

  function cleanValues(raw: string) {
    const values = parseValues(raw);
    if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error("Paste one or more non-negative feed values.");
    }
    return values;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createBlindFeedingTemplate({
        farm_id: farmId,
        name: form.name.trim(),
        daily_feed_per_100k: cleanValues(form.values),
      });
      setForm(emptyForm);
      setShowNew(false);
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save blind feeding template.");
    }
  }

  async function save(e: React.FormEvent, id: string) {
    e.preventDefault();
    setError(null);
    try {
      await api.updateBlindFeedingTemplate(id, {
        name: editForm.name.trim(),
        daily_feed_per_100k: cleanValues(editForm.values),
      });
      setEditingId(null);
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save blind feeding template.");
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete blind feeding template "${name}"? Existing cycle feedings stay unchanged.`)) return;
    await api.deleteBlindFeedingTemplate(id);
    onReload();
  }

  return (
    <CollapsibleSection
      title="Blind feeding"
      count={templates.length}
      open={open}
      onToggle={onToggle}
      action={
        canAdd(role) ? (
          <button
            onClick={() => {
              setShowNew((current) => !current);
              setEditingId(null);
              setError(null);
            }}
            className="text-sm bg-primary text-white px-3 py-1 rounded"
          >
            + New template
          </button>
        ) : null
      }
    >
      {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      {showNew && (
        <form onSubmit={create} className="bg-white rounded-lg shadow p-4 space-y-3">
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Template name"
            className="w-full border rounded px-3 py-2"
            required
          />
          <textarea
            value={form.values}
            onChange={(e) => setForm({ ...form, values: e.target.value })}
            placeholder={"Daily feed per 100,000 shrimp\n2\n2\n2\n3"}
            rows={10}
            className="w-full border rounded px-3 py-2 font-mono text-sm"
            required
          />
          <div className="text-sm text-slate-500">
            {preview.length} days
            {preview.length > 0 ? ` - ${formatNumber(preview.reduce((sum, value) => sum + value, 0))} kg/100k total` : ""}
          </div>
          <div className="flex gap-2">
            <button className="bg-primary text-white px-4 py-1 rounded text-sm">Add</button>
            <button type="button" onClick={() => setShowNew(false)} className="border px-3 py-1 rounded text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {templates.length === 0 ? (
        <p className="text-slate-500 text-sm">No blind feeding templates yet.</p>
      ) : (
        <ul className="grid gap-3">
          {templates.map((template) => (
            <li key={template.id} className="bg-white rounded-lg shadow p-4">
              {editingId === template.id ? (
                <form onSubmit={(e) => save(e, template.id)} className="space-y-3">
                  <input
                    autoFocus
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                  <textarea
                    value={editForm.values}
                    onChange={(e) => setEditForm({ ...editForm, values: e.target.value })}
                    rows={10}
                    className="w-full border rounded px-3 py-2 font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <button className="text-xs bg-primary text-white px-3 py-1 rounded">Save</button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs border px-3 py-1 rounded">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="font-medium">{template.name}</div>
                  <div className="text-sm text-slate-500">
                    {template.duration_days} days - {formatNumber(template.cumulative_feed_per_100k)} kg/100k total
                  </div>
                  <div className="mt-2 max-h-24 overflow-auto rounded border bg-slate-50 p-2 font-mono text-xs text-slate-600">
                    {template.daily_feed_per_100k.join(", ")}
                  </div>
                  {canManage(role) && (
                    <div className="flex gap-3 mt-2">
                      <button
                        onClick={() => {
                          setEditingId(template.id);
                          setEditForm({ name: template.name, values: valuesText(template) });
                          setShowNew(false);
                          setError(null);
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => remove(template.id, template.name)}
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
