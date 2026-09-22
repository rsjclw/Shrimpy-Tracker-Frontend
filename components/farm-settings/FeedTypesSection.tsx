"use client";

import { useState } from "react";
import { api, type FeedType } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Banner, ConfirmStrip } from "@/components/ui/Field";
import { CollapsibleSection } from "@/components/ui/Section";
import { intInput, num, rupiah } from "@/lib/num";

type Draft = { brand: string; type: string; price: string };
const emptyDraft: Draft = { brand: "", type: "", price: "" };

function feedTypeError(list: FeedType[], draft: Draft, excludeId?: string): string {
  if (!draft.brand.trim()) return "Enter a brand";
  if (!draft.type.trim()) return "Enter a code";
  if (!(num(draft.price) > 0)) return "Enter a price per kg";
  const brand = draft.brand.trim().toLowerCase();
  const type = draft.type.trim().toLowerCase();
  const dup = list.some(
    (f) => f.id !== excludeId && f.brand.trim().toLowerCase() === brand && f.type.trim().toLowerCase() === type,
  );
  return dup ? "That brand and code already exist" : "";
}

export function FeedTypesSection({
  farmId,
  feedTypes,
  canManage,
  open,
  onToggle,
  onReload,
}: {
  farmId: string;
  feedTypes: FeedType[];
  canManage: boolean;
  open: boolean;
  onToggle: () => void;
  onReload: () => Promise<void>;
}) {
  // Only one row (or the new-feed-type form, id "new") is ever being edited at a time.
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = feedTypes.length
    ? feedTypes
        .map((f) => f.type)
        .slice(0, 4)
        .join(" · ") + (feedTypes.length > 4 ? ` +${feedTypes.length - 4}` : "")
    : "No feed types yet";

  function openNew() {
    setEditId("new");
    setDraft(emptyDraft);
    setDeleteId(null);
    setError(null);
  }

  function openRow(f: FeedType) {
    if (editId === f.id) {
      closeEdit();
      return;
    }
    setEditId(f.id);
    setDraft({ brand: f.brand, type: f.type, price: String(Math.round(num(f.price_per_kg))) });
    setDeleteId(null);
    setError(null);
  }

  function closeEdit() {
    setEditId(null);
    setDraft(emptyDraft);
    setDeleteId(null);
    setError(null);
  }

  const validationError = editId ? feedTypeError(feedTypes, draft, editId === "new" ? undefined : editId) : "";
  const touched = draft.brand.trim() !== "" || draft.type.trim() !== "" || draft.price.trim() !== "";

  async function save() {
    if (!editId || validationError) return;
    setSaving(true);
    setError(null);
    try {
      const clean = { brand: draft.brand.trim(), type: draft.type.trim(), price_per_kg: Math.round(num(draft.price)) };
      if (editId === "new") {
        await api.createFeedType({ farm_id: farmId, ...clean });
      } else {
        await api.updateFeedType(editId, clean);
      }
      await onReload();
      closeEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save feed type.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(id: string) {
    setSaving(true);
    setError(null);
    try {
      await api.deleteFeedType(id);
      await onReload();
      closeEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete feed type.");
      setSaving(false);
    }
  }

  return (
    <CollapsibleSection title="Feed types" count={feedTypes.length} summary={summary} open={open} onToggle={onToggle}>
      {canManage && editId !== "new" ? (
        <Button variant="dashed" size="sm" className="self-start" onClick={openNew}>
          + Add feed type
        </Button>
      ) : null}

      {canManage && editId === "new" ? (
        <div className="flex flex-col gap-2.5 rounded-[14px] border border-accent bg-ink-850 p-3.5">
          <span className="text-sm font-bold text-tx-strong">New feed type</span>
          <div className="grid grid-cols-[1.4fr_1fr] gap-2">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="field-label">Brand</span>
              <input
                className="input-sm"
                value={draft.brand}
                onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="field-label">Code</span>
              <input
                className="input-sm font-mono"
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value })}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="field-label">Price per kg (Rp)</span>
            <input
              className="input-sm font-mono"
              inputMode="numeric"
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: intInput(e.target.value) })}
            />
          </label>
          {validationError && touched ? <span className="text-xs text-bad">{validationError}</span> : null}
          <div className="flex justify-end gap-1.5">
            <Button variant="secondary" size="sm" onClick={closeEdit}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={save} disabled={!!validationError || saving}>
              Add feed type
            </Button>
          </div>
        </div>
      ) : null}

      {error && editId !== "new" ? <Banner tone="bad">{error}</Banner> : null}

      <div className="flex flex-col gap-1.5">
        {feedTypes.map((f) => {
          const editing = editId === f.id;
          return (
            <div
              key={f.id}
              className={`rounded-[14px] border bg-ink-800 ${editing ? "border-accent" : "border-line"}`}
            >
              <button
                type="button"
                aria-label={`${canManage ? "Edit" : "View"} ${f.brand} ${f.type}`}
                onClick={() => (canManage ? openRow(f) : undefined)}
                disabled={!canManage}
                className="flex w-full items-center gap-2.5 p-3 text-left disabled:cursor-default"
              >
                <div className="flex min-w-0 flex-grow flex-col gap-[3px]">
                  <span className="truncate text-[15px] font-semibold text-tx-strong">{f.brand}</span>
                  <span className="self-start rounded-md border border-line bg-ink-850 px-1.5 py-px font-mono text-xs text-tx-soft">
                    {f.type}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-px">
                  <span className="font-mono text-[15px] font-semibold text-tx-strong">{rupiah(f.price_per_kg)}</span>
                  <span className="text-[11px] text-tx-dim">per kg</span>
                </div>
              </button>

              {editing ? (
                <div className="flex flex-col gap-2.5 px-3.5 pb-3.5">
                  <div className="grid grid-cols-[1.4fr_1fr] gap-2">
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="field-label">Brand</span>
                      <input
                        className="input-sm bg-ink-850"
                        value={draft.brand}
                        onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="field-label">Code</span>
                      <input
                        className="input-sm bg-ink-850 font-mono"
                        value={draft.type}
                        onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                      />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="field-label">Price per kg (Rp)</span>
                    <input
                      className="input-sm bg-ink-850 font-mono"
                      inputMode="numeric"
                      value={draft.price}
                      onChange={(e) => setDraft({ ...draft, price: intInput(e.target.value) })}
                    />
                  </label>
                  {validationError && touched ? <span className="text-xs text-bad">{validationError}</span> : null}
                  {error ? <Banner tone="bad">{error}</Banner> : null}
                  {deleteId === f.id ? (
                    <ConfirmStrip
                      message={`Delete ${f.brand} ${f.type}?`}
                      busy={saving}
                      onConfirm={() => doDelete(f.id)}
                      onCancel={() => setDeleteId(null)}
                    />
                  ) : null}
                  <div className="flex items-center gap-1.5">
                    <Button variant="danger" size="sm" onClick={() => setDeleteId(f.id)}>
                      Delete
                    </Button>
                    <span className="flex-grow" />
                    <Button variant="secondary" size="sm" onClick={closeEdit}>
                      Cancel
                    </Button>
                    <Button variant="primary" size="sm" onClick={save} disabled={!!validationError || saving}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
