"use client";

import { useCallback, useEffect, useState } from "react";

import { api, type Place, type PlaceKind } from "@/lib/api";
import { decimalInput, fmtNum, num } from "@/lib/num";

type Draft = { id: string | "new"; kind: PlaceKind; name: string; width: string; length: string };

const KIND_LABEL: Record<PlaceKind, string> = { reservoir: "Reservoir", bore_well: "Bore well" };
const field = "h-10 w-full rounded-lg border border-line bg-ink-850 px-2.5 text-sm text-tx-strong outline-none focus:border-accent";
const label = "text-[10px] uppercase tracking-[0.06em] text-tx-faint";

const sizeText = (p: Place) =>
  p.kind === "bore_well" ? "Bore well" : p.width_m && p.length_m ? `${fmtNum(p.width_m)} × ${fmtNum(p.length_m)} m · ${fmtNum(p.area_m2)} m²` : "Size not set";

/** A grid's reservoirs and bore wells, kept in grid settings. Sizes are typed, like pond settings. */
export function GridPlaces({ gridId }: { gridId: string }) {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPlaces(await api.listGridPlaces(gridId));
      setLoadError(null);
    } catch {
      // The rest of grid settings keeps working without this list.
      setPlaces([]);
      setLoadError("Couldn't load reservoirs and wells.");
    }
  }, [gridId]);

  useEffect(() => {
    load();
  }, [load]);

  function open(next: Draft | null) {
    setDraft(next);
    setConfirmDelete(false);
    setApiError(null);
  }

  const width = num(draft?.width);
  const length = num(draft?.length);
  const sized = !!draft && (draft.width.trim() !== "" || draft.length.trim() !== "");
  const error = !draft
    ? ""
    : !draft.name.trim()
      ? "Give it a name"
      : (places ?? []).some((p) => p.id !== draft.id && p.name.trim().toLowerCase() === draft.name.trim().toLowerCase())
        ? `${draft.name.trim()} already exists on this grid`
        : draft.kind === "reservoir" && sized && !(width > 0 && length > 0)
          ? "Enter both width and length, each more than 0, or leave both empty"
          : "";

  async function save() {
    if (!draft || error) return;
    setBusy(true);
    setApiError(null);
    const size = draft.kind === "reservoir" && sized ? { width_m: width, length_m: length } : { width_m: null, length_m: null };
    try {
      if (draft.id === "new") {
        await api.createPlace({ grid_id: gridId, kind: draft.kind, name: draft.name.trim(), notes: null, ...size });
      } else {
        const notes = places?.find((p) => p.id === draft.id)?.notes ?? null; // PUT would clear them otherwise
        await api.updatePlace(draft.id, { name: draft.name.trim(), notes, ...size });
      }
      await load();
      open(null);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Saving failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft || draft.id === "new") return;
    setBusy(true);
    setApiError(null);
    try {
      await api.deletePlace(draft.id);
      await load();
      open(null);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Deleting failed.");
    } finally {
      setBusy(false);
    }
  }

  const form = draft ? (
    <div className="flex flex-col gap-2 rounded-lg border border-accent bg-ink-850/60 p-2.5">
      {draft.id === "new" ? <span className="text-xs font-bold text-tx-strong">New {KIND_LABEL[draft.kind].toLowerCase()}</span> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="gp-name" className={label}>Name</label>
        <input id="gp-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={field} />
      </div>
      {draft.kind === "reservoir" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="gp-width" className={label}>Width (m)</label>
              <input id="gp-width" inputMode="decimal" value={draft.width} onChange={(e) => setDraft({ ...draft, width: decimalInput(e.target.value, 2) })} className={`${field} font-mono`} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="gp-length" className={label}>Length (m)</label>
              <input id="gp-length" inputMode="decimal" value={draft.length} onChange={(e) => setDraft({ ...draft, length: decimalInput(e.target.value, 2) })} className={`${field} font-mono`} />
            </div>
          </div>
          {width > 0 && length > 0 ? <span className="font-mono text-[11px] text-tx-muted">Area {fmtNum(width * length)} m²</span> : null}
        </>
      ) : null}
      {error && (draft.name || sized) ? <span className="text-[11px] text-bad">{error}</span> : null}
      {apiError ? <span className="text-[11px] text-bad">{apiError}</span> : null}
      {confirmDelete ? (
        <div className="flex items-center gap-1.5 rounded-lg bg-bad/10 px-2 py-1.5">
          <span className="flex-grow text-[11px] text-bad-soft">Delete {draft.name.trim() || "it"}?</span>
          <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md px-2 py-1 text-[11px] font-semibold text-tx-muted">Keep</button>
          <button type="button" onClick={remove} disabled={busy} className="rounded-md bg-bad px-2.5 py-1 text-[11px] font-bold text-ink-950 disabled:opacity-40">Delete</button>
        </div>
      ) : null}
      <div className="flex items-center gap-1.5">
        {draft.id !== "new" && !confirmDelete ? (
          <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-lg px-2 py-2 text-xs font-semibold text-bad">Delete</button>
        ) : null}
        <span className="flex-grow" />
        <button type="button" onClick={() => open(null)} className="rounded-lg bg-ink-850 px-3 py-2 text-xs font-semibold text-tx-muted">Cancel</button>
        <button type="button" onClick={save} disabled={!!error || busy} className="rounded-lg bg-accent px-3.5 py-2 text-xs font-bold text-accent-ink disabled:opacity-40">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <span className="text-sm font-bold text-tx-strong">Reservoirs &amp; wells</span>
      {loadError ? <span className="text-[11px] text-bad">{loadError}</span> : null}
      {places === null ? <span className="text-[11px] text-tx-faint">Loading…</span> : null}
      {places && places.length === 0 && !loadError && draft?.id !== "new" ? <span className="text-[11px] text-tx-faint">None on this grid yet.</span> : null}
      {(places ?? []).map((p) =>
        draft?.id === p.id ? (
          <div key={p.id}>{form}</div>
        ) : (
          <button
            key={p.id}
            type="button"
            onClick={() => open({ id: p.id, kind: p.kind, name: p.name, width: p.width_m ? String(Number(p.width_m)) : "", length: p.length_m ? String(Number(p.length_m)) : "" })}
            aria-label={`Edit ${p.name}`}
            className="flex items-center gap-2 rounded-lg border border-line bg-ink-850 px-2.5 py-2 text-left"
          >
            <span className="min-w-0 flex-grow truncate text-[13px] font-semibold text-tx-strong">{p.name}</span>
            <span className="shrink-0 font-mono text-[11px] text-tx-dim">{sizeText(p)}</span>
          </button>
        ),
      )}
      {draft?.id === "new" ? form : null}
      {!draft ? (
        <div className="flex gap-1.5">
          <button type="button" onClick={() => open({ id: "new", kind: "reservoir", name: "", width: "", length: "" })} className="rounded-lg border border-dashed border-line-dash px-3 py-2 text-xs font-bold text-accent">
            + Reservoir
          </button>
          <button type="button" onClick={() => open({ id: "new", kind: "bore_well", name: "", width: "", length: "" })} className="rounded-lg border border-dashed border-line-dash px-3 py-2 text-xs font-bold text-accent">
            + Bore well
          </button>
        </div>
      ) : null}
    </div>
  );
}
