"use client";

import { useState } from "react";

import { api, type Grid, type Pond } from "@/lib/api";
import { fmt24, valid24 } from "@/lib/dates";
import { decimalInput, fmtNum, num } from "@/lib/num";

/** New pond in the selected grid. Its first cycle is started later from pond settings. */
export function AddPondForm({ grid, existing, onCancel, onCreated }: { grid: Grid; existing: Pond[]; onCancel: () => void; onCreated: (pond: Pond) => void }) {
  const [name, setName] = useState("");
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [firstFeed, setFirstFeed] = useState("06:00");
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const sized = num(width) > 0 && num(length) > 0;
  const error = !name.trim()
    ? "Enter a pond name"
    : existing.some((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())
      ? `${name.trim()} already exists in ${grid.name}`
      : !sized
        ? "Enter the pond's width and length"
        : !valid24(firstFeed)
          ? "First feeding must be a 24-hour time like 06:00"
          : "";

  async function create() {
    if (error) return;
    setBusy(true);
    setApiError(null);
    try {
      const pond = await api.createPond({ grid_id: grid.id, name: name.trim(), width_m: num(width), length_m: num(length), default_feed_time: firstFeed });
      onCreated(pond);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Creating the pond failed.");
      setBusy(false);
    }
  }

  const field = "h-[42px] w-full rounded-lg border border-line bg-ink-850 px-2.5 text-sm text-tx-strong outline-none focus:border-accent";
  const label = "text-[10px] uppercase tracking-[0.06em] text-tx-faint";
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-accent bg-ink-800 p-3.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-bold text-tx-strong">New pond in {grid.name}</span>
        <span className="text-[11px] text-tx-muted">Start its first cycle from pond settings when the pond is stocked.</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="add-pond-name" className={label}>Pond name</label>
          <input id="add-pond-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="add-pond-feed" className={label}>First feeding</label>
          <input id="add-pond-feed" inputMode="numeric" maxLength={5} placeholder="HH:MM" value={firstFeed} onChange={(e) => setFirstFeed(fmt24(e.target.value))} className={`${field} font-mono`} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="add-pond-width" className={label}>Width (m)</label>
          <input id="add-pond-width" inputMode="decimal" placeholder="40" value={width} onChange={(e) => setWidth(decimalInput(e.target.value, 2))} className={`${field} font-mono`} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="add-pond-length" className={label}>Length (m)</label>
          <input id="add-pond-length" inputMode="decimal" placeholder="75" value={length} onChange={(e) => setLength(decimalInput(e.target.value, 2))} className={`${field} font-mono`} />
        </div>
      </div>
      {sized ? <span className="font-mono text-[11px] text-tx-muted">Area {fmtNum(num(width) * num(length))} m²</span> : null}
      {error && (name || width || length) ? <span className="text-[11px] text-bad">{error}</span> : null}
      {apiError ? <span className="text-[11px] text-bad">{apiError}</span> : null}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} className="rounded-lg bg-ink-850 px-3.5 py-[9px] text-[13px] font-semibold text-tx-muted">Cancel</button>
        <button type="button" onClick={create} disabled={!!error || busy} className="rounded-lg bg-accent px-4 py-[9px] text-[13px] font-bold text-accent-ink disabled:opacity-40">
          {busy ? "Creating…" : "Create pond"}
        </button>
      </div>
    </div>
  );
}
