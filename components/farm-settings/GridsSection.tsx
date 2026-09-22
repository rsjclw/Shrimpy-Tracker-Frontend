"use client";

import { useState } from "react";
import { api, type Grid, type Pond } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Banner, ConfirmStrip } from "@/components/ui/Field";
import { CollapsibleSection } from "@/components/ui/Section";
import { num } from "@/lib/num";
import { coordInput, formatCoords, weatherSyncedText } from "./helpers";

type Draft = { name: string; lat: string; lng: string };
const emptyDraft: Draft = { name: "", lat: "", lng: "" };

function draftError(draft: Draft): string {
  if (!draft.name.trim()) return "Enter a name";
  const hasLat = draft.lat.trim() !== "";
  const hasLng = draft.lng.trim() !== "";
  if (hasLat !== hasLng) return "Set both latitude and longitude, or neither";
  if (hasLat) {
    const lat = num(draft.lat);
    const lng = num(draft.lng);
    if (!(lat >= -90 && lat <= 90)) return "Latitude must be between -90 and 90";
    if (!(lng >= -180 && lng <= 180)) return "Longitude must be between -180 and 180";
  }
  return "";
}

export function GridsSection({
  farmId,
  grids,
  ponds,
  canManage,
  open,
  onToggle,
  onReload,
}: {
  farmId: string;
  grids: Grid[];
  ponds: Pond[];
  canManage: boolean;
  open: boolean;
  onToggle: () => void;
  onReload: () => Promise<void>;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summary = grids.length ? grids.map((g) => g.name).join(" · ") : "No grids yet";

  function pondCount(gridId: string) {
    return ponds.filter((p) => p.grid_id === gridId).length;
  }

  function openNew() {
    setEditId("new");
    setDraft(emptyDraft);
    setDeleteId(null);
    setError(null);
    setRefreshNote(null);
  }

  function openRow(g: Grid) {
    if (editId === g.id) {
      closeEdit();
      return;
    }
    setEditId(g.id);
    setDraft({ name: g.name, lat: g.latitude ?? "", lng: g.longitude ?? "" });
    setDeleteId(null);
    setError(null);
    setRefreshNote(null);
  }

  function closeEdit() {
    setEditId(null);
    setDraft(emptyDraft);
    setDeleteId(null);
    setError(null);
    setRefreshNote(null);
  }

  const validationError = editId ? draftError(draft) : "";
  const touched = draft.name.trim() !== "" || draft.lat.trim() !== "" || draft.lng.trim() !== "";

  async function save() {
    if (!editId || validationError) return;
    setSaving(true);
    setError(null);
    try {
      const hasCoords = draft.lat.trim() !== "" && draft.lng.trim() !== "";
      if (editId === "new") {
        await api.createGrid({
          farm_id: farmId,
          name: draft.name.trim(),
          latitude: hasCoords ? num(draft.lat) : null,
          longitude: hasCoords ? num(draft.lng) : null,
        });
      } else {
        const original = grids.find((g) => g.id === editId);
        await api.updateGrid(editId, {
          name: draft.name.trim(),
          // The backend resets notes to blank when the field is left out of the
          // request, so an existing note has to be sent back verbatim.
          ...(original?.notes ? { notes: original.notes } : {}),
          latitude: hasCoords ? num(draft.lat) : null,
          longitude: hasCoords ? num(draft.lng) : null,
        });
      }
      await onReload();
      closeEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save grid.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(id: string) {
    setSaving(true);
    setError(null);
    try {
      await api.deleteGrid(id);
      await onReload();
      closeEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete grid.");
      setSaving(false);
    }
  }

  async function refreshWeather(id: string) {
    setRefreshing(true);
    setError(null);
    setRefreshNote(null);
    try {
      const result = await api.refreshGridEnvironment(id);
      setRefreshNote(`Synced ${result.days_written} day${result.days_written === 1 ? "" : "s"}.`);
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh weather.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <CollapsibleSection title="Grids" count={grids.length} summary={summary} open={open} onToggle={onToggle}>
      {canManage && editId !== "new" ? (
        <Button variant="dashed" size="sm" className="self-start" onClick={openNew}>
          + Add grid
        </Button>
      ) : null}

      {canManage && editId === "new" ? (
        <div className="flex flex-col gap-2.5 rounded-[14px] border border-accent bg-ink-850 p-3.5">
          <span className="text-sm font-bold text-tx-strong">New grid</span>
          <label className="flex flex-col gap-1">
            <span className="field-label">Name</span>
            <input className="input-sm" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="field-label">Latitude</span>
              <input
                className="input-sm font-mono"
                inputMode="decimal"
                placeholder="-7.989"
                value={draft.lat}
                onChange={(e) => setDraft({ ...draft, lat: coordInput(e.target.value) })}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="field-label">Longitude</span>
              <input
                className="input-sm font-mono"
                inputMode="decimal"
                placeholder="110.225"
                value={draft.lng}
                onChange={(e) => setDraft({ ...draft, lng: coordInput(e.target.value) })}
              />
            </label>
          </div>
          {validationError && touched ? <span className="text-xs text-bad">{validationError}</span> : null}
          {error ? <Banner tone="bad">{error}</Banner> : null}
          <div className="flex justify-end gap-1.5">
            <Button variant="secondary" size="sm" onClick={closeEdit}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={!!validationError || saving} onClick={save}>
              Add grid
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        {grids.map((g) => {
          const editing = editId === g.id;
          return (
            <div key={g.id} className={`rounded-[14px] border bg-ink-800 ${editing ? "border-accent" : "border-line"}`}>
              <button
                type="button"
                aria-label={`${canManage ? "Edit" : "View"} ${g.name}`}
                onClick={() => (canManage ? openRow(g) : undefined)}
                disabled={!canManage}
                className="flex w-full items-center gap-2.5 p-3 text-left disabled:cursor-default"
              >
                <div className="flex min-w-0 flex-grow flex-col gap-[3px]">
                  <span className="truncate text-[15px] font-semibold text-tx-strong">{g.name}</span>
                  <span className="text-xs text-tx-dim">
                    {pondCount(g.id)} pond{pondCount(g.id) === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-px">
                  <span className="font-mono text-xs text-tx-soft">{formatCoords(g.latitude, g.longitude)}</span>
                  <span className="text-[11px] text-tx-dim">{g.timezone ?? "—"}</span>
                </div>
              </button>

              {editing ? (
                <div className="flex flex-col gap-2.5 px-3.5 pb-3.5">
                  <label className="flex flex-col gap-1">
                    <span className="field-label">Name</span>
                    <input
                      className="input-sm bg-ink-850"
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="field-label">Latitude</span>
                      <input
                        className="input-sm bg-ink-850 font-mono"
                        inputMode="decimal"
                        placeholder="-7.989"
                        value={draft.lat}
                        onChange={(e) => setDraft({ ...draft, lat: coordInput(e.target.value) })}
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="field-label">Longitude</span>
                      <input
                        className="input-sm bg-ink-850 font-mono"
                        inputMode="decimal"
                        placeholder="110.225"
                        value={draft.lng}
                        onChange={(e) => setDraft({ ...draft, lng: coordInput(e.target.value) })}
                      />
                    </label>
                  </div>
                  {validationError && touched ? <span className="text-xs text-bad">{validationError}</span> : null}

                  <div className="flex items-center justify-between gap-2 rounded-lg bg-ink-850 px-2.5 py-2">
                    <span className="text-xs text-tx-soft">{weatherSyncedText(g.weather_synced_at)}</span>
                    <Button
                      variant="secondary"
                      size="xs"
                      disabled={refreshing || !g.latitude || !g.longitude}
                      onClick={() => refreshWeather(g.id)}
                    >
                      Refresh weather
                    </Button>
                  </div>
                  {refreshNote ? <span className="text-xs text-good">{refreshNote}</span> : null}

                  {error ? <Banner tone="bad">{error}</Banner> : null}
                  {deleteId === g.id ? (
                    <ConfirmStrip
                      message={`Delete ${g.name}?`}
                      busy={saving}
                      onConfirm={() => doDelete(g.id)}
                      onCancel={() => setDeleteId(null)}
                    />
                  ) : null}
                  <div className="flex items-center gap-1.5">
                    <Button variant="danger" size="sm" onClick={() => setDeleteId(g.id)}>
                      Delete
                    </Button>
                    <span className="flex-grow" />
                    <Button variant="secondary" size="sm" onClick={closeEdit}>
                      Cancel
                    </Button>
                    <Button variant="primary" size="sm" disabled={!!validationError || saving} onClick={save}>
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
