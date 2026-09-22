"use client";

import { useState } from "react";
import { api, type FeedAdditive } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Banner, ConfirmStrip } from "@/components/ui/Field";
import { CollapsibleSection } from "@/components/ui/Section";
import { Icon } from "@/components/ui/Icon";
import { decimalInput, fmtNum, has, num } from "@/lib/num";

export function AdditivesSection({
  farmId,
  additives,
  canManage,
  open,
  onToggle,
  onReload,
}: {
  farmId: string;
  additives: FeedAdditive[];
  canManage: boolean;
  open: boolean;
  onToggle: () => void;
  onReload: () => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [newDosage, setNewDosage] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editDosage, setEditDosage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = additives.length
    ? additives
        .map((a) => a.name)
        .slice(0, 3)
        .join(" · ") + (additives.length > 3 ? ` +${additives.length - 3}` : "")
    : "No additives yet";

  const trimmedName = newName.trim();
  const isDup = !!trimmedName && additives.some((a) => a.name.toLowerCase() === trimmedName.toLowerCase());

  async function addAdditive() {
    if (!trimmedName || isDup || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.createAdditive({
        farm_id: farmId,
        name: trimmedName,
        dosage_gr_per_kg: has(newDosage) ? num(newDosage) : null,
      });
      setNewName("");
      setNewDosage("");
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add additive.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(id: number) {
    setSaving(true);
    setError(null);
    try {
      await api.deleteAdditive(id);
      setDeleteId(null);
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete additive.");
    } finally {
      setSaving(false);
    }
  }

  function openDosageEdit(a: FeedAdditive) {
    if (editId === a.id) {
      setEditId(null);
      return;
    }
    setEditId(a.id);
    setEditDosage(a.dosage_gr_per_kg ?? "");
    setDeleteId(null);
    setError(null);
  }

  async function saveDosage(id: number) {
    setSaving(true);
    setError(null);
    try {
      await api.updateAdditive(id, { dosage_gr_per_kg: has(editDosage) ? num(editDosage) : null });
      setEditId(null);
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update additive.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollapsibleSection title="Feed additives" count={additives.length} summary={summary} open={open} onToggle={onToggle}>
      <div className="flex flex-wrap gap-2">
        {additives.map((a) => (
          <span
            key={a.id}
            className="inline-flex h-10 items-center gap-0.5 rounded-full border border-line-strong bg-ink-800 py-0 pl-3.5 pr-1 text-[13px] text-tx"
          >
            <button
              type="button"
              onClick={() => (canManage ? openDosageEdit(a) : undefined)}
              disabled={!canManage}
              className="disabled:cursor-default"
            >
              {a.name}
              {a.dosage_gr_per_kg ? ` · default ${fmtNum(a.dosage_gr_per_kg, 3)} g/kg` : ""}
            </button>
            {canManage ? (
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => {
                  setDeleteId(a.id);
                  setEditId(null);
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-tx-dim hover:text-tx-strong"
              >
                <Icon name="close" size={11} strokeWidth={2.6} />
              </button>
            ) : null}
          </span>
        ))}
      </div>

      {editId !== null ? (
        <div className="flex items-center gap-2 rounded-lg bg-ink-800 px-2.5 py-2">
          <span className="flex-grow text-xs text-tx-soft">Default dose (g/kg) for {additives.find((a) => a.id === editId)?.name}</span>
          <input
            className="input-xs w-20 text-right"
            inputMode="decimal"
            value={editDosage}
            onChange={(e) => setEditDosage(decimalInput(e.target.value, 3))}
          />
          <Button variant="secondary" size="xs" onClick={() => setEditId(null)}>
            Cancel
          </Button>
          <Button variant="primary" size="xs" disabled={saving} onClick={() => saveDosage(editId)}>
            Save
          </Button>
        </div>
      ) : null}

      {deleteId !== null ? (
        <ConfirmStrip
          message={`Remove ${additives.find((a) => a.id === deleteId)?.name}?`}
          busy={saving}
          onConfirm={() => doDelete(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      ) : null}

      {error ? <Banner tone="bad">{error}</Banner> : null}

      {canManage ? (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              aria-label="New additive"
              placeholder="Add an additive, e.g. Zeolite"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addAdditive();
              }}
              className="input min-w-0 flex-grow"
            />
            <input
              type="text"
              aria-label="Default dose, grams per kg"
              placeholder="default g/kg"
              inputMode="decimal"
              value={newDosage}
              onChange={(e) => setNewDosage(decimalInput(e.target.value, 3))}
              onKeyDown={(e) => {
                if (e.key === "Enter") addAdditive();
              }}
              className="input-xs w-16 shrink-0 text-center"
            />
            <Button variant="primary" size="md" disabled={!trimmedName || isDup || saving} onClick={addAdditive}>
              Add
            </Button>
          </div>
          {isDup ? <span className="text-xs text-warn">That additive is already on the list.</span> : null}
          <span className="text-[11px] text-tx-faint">
            The default dose is the starting point. Change the dose on a feed and later feeds in that cycle keep the new dose.
          </span>
        </>
      ) : null}
    </CollapsibleSection>
  );
}
