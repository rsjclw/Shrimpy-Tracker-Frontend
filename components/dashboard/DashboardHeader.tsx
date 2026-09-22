"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { api, type Farm, type Grid } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/roles";

export type FarmStats = Record<string, { active: number; ponds: number }>;

/** Close a popover when the user taps outside it or presses Escape. */
function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return ref;
}

export function DashboardHeader({
  farms,
  farm,
  farmStats,
  recent,
  pinned,
  onPickFarm,
  onTogglePin,
  onFarmMenuOpened,
  grids,
  grid,
  pondCounts,
  onPickGrid,
  canManage,
  gridSettingsOpen,
  setGridSettingsOpen,
  onGridSaved,
  onAddPond,
}: {
  farms: Farm[];
  farm: Farm;
  farmStats: FarmStats | null;
  recent: string[];
  pinned: string[];
  onPickFarm: (id: string) => void;
  onTogglePin: (id: string) => void;
  onFarmMenuOpened: () => void;
  grids: Grid[];
  grid: Grid | null;
  pondCounts: Record<string, number>;
  onPickGrid: (id: string) => void;
  canManage: boolean;
  gridSettingsOpen: "edit" | "new" | null;
  setGridSettingsOpen: (v: "edit" | "new" | null) => void;
  onGridSaved: (grid: Grid) => void;
  onAddPond: () => void;
}) {
  const [farmOpen, setFarmOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [query, setQuery] = useState("");
  const farmRef = useDismiss(farmOpen, () => setFarmOpen(false));
  const gridRef = useDismiss(gridOpen, () => setGridOpen(false));

  const q = query.trim().toLowerCase();
  const row = (f: Farm) => ({ f, stats: farmStats?.[f.id] });
  const byName = (a: Farm, b: Farm) => a.name.localeCompare(b.name);
  const sections: { title: string; rows: Farm[] }[] = q
    ? [{ title: "Results", rows: farms.filter((f) => f.name.toLowerCase().includes(q)).sort(byName) }]
    : [
        { title: "Recent", rows: recent.map((id) => farms.find((f) => f.id === id)).filter((f): f is Farm => !!f) },
        { title: "Pinned", rows: farms.filter((f) => pinned.includes(f.id)).sort(byName) },
        { title: "All farms", rows: [...farms].sort(byName) },
      ].filter((s) => s.rows.length);

  return (
    <div className="sticky top-0 z-30 -mx-5 -mt-7 flex items-start justify-between gap-3 border-b border-line-faint bg-ink-950 px-5 pb-3 pt-[22px]">
      <div ref={farmRef} className="flex min-w-0 flex-col gap-0.5">
        <button
          type="button"
          onClick={() => {
            setFarmOpen((o) => !o);
            if (!farmOpen) onFarmMenuOpened();
          }}
          aria-expanded={farmOpen}
          aria-label="Switch farm"
          className="inline-flex max-w-full items-center gap-1.5 self-start py-0.5"
        >
          <span className="truncate font-mono text-xs uppercase tracking-[0.14em] text-tx-muted">{farm.name}</span>
          {farms.length > 1 ? <Icon name="chevron" size={13} strokeWidth={2.4} className={`shrink-0 text-tx-muted transition-transform ${farmOpen ? "rotate-180" : ""}`} /> : null}
        </button>
        <h1 className="m-0 whitespace-nowrap text-[24px] font-bold tracking-[-0.01em] text-tx-strong min-[400px]:text-[26px]">Pond Monitoring</h1>

        {farmOpen ? (
          <div className="absolute left-3 right-3 top-[calc(100%+4px)] z-40 flex max-h-[72vh] flex-col gap-3 overflow-y-auto rounded-2xl border border-line bg-ink-800 p-3 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
            <div className="relative">
              <Icon name="search" size={15} className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2 text-tx-faint" />
              <input
                type="search"
                aria-label="Search farms"
                placeholder="Search farms"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-[10px] border border-line bg-ink-850 py-2.5 pl-[34px] pr-3 text-sm text-tx-strong outline-none focus:border-accent"
              />
            </div>
            {sections.map((sec) => (
              <div key={sec.title} className="flex flex-col gap-1.5">
                <div className="text-[10px] uppercase tracking-[0.08em] text-tx-faint">{sec.title}</div>
                {sec.rows.map((f) => {
                  const { stats } = row(f);
                  const current = f.id === farm.id;
                  const isPinned = pinned.includes(f.id);
                  return (
                    <div key={`${sec.title}-${f.id}`} className={`flex items-center rounded-xl border ${current ? "border-accent/40 bg-accent/10" : "border-ink-850 bg-ink-850"}`}>
                      <button
                        type="button"
                        onClick={() => {
                          onPickFarm(f.id);
                          setFarmOpen(false);
                          setQuery("");
                        }}
                        className="flex min-w-0 flex-grow flex-col gap-[3px] px-3 py-2.5 text-left"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-semibold text-tx-strong">{f.name}</span>
                          {current ? <span className="shrink-0 text-[9px] font-bold tracking-[0.08em] text-accent">CURRENT</span> : null}
                        </div>
                        <span className="text-[11px] text-tx-faint">{ROLE_LABEL[f.role]}</span>
                        <span className="font-mono text-[11px] text-tx-muted">
                          {stats ? `${stats.active} active pond${stats.active === 1 ? "" : "s"} · ${stats.ponds} total` : "…"}
                        </span>
                      </button>
                      <Link href={`/farms/${f.id}/settings`} aria-label={`Farm settings for ${f.name}`} className="flex h-11 w-10 shrink-0 items-center justify-center text-tx-faint hover:text-tx">
                        <Icon name="gear" size={17} strokeWidth={1.8} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => onTogglePin(f.id)}
                        aria-label={isPinned ? `Unpin ${f.name}` : `Pin ${f.name}`}
                        aria-pressed={isPinned}
                        className={`flex h-11 w-11 shrink-0 items-center justify-center ${isPinned ? "text-warn" : "text-tx-ghost"}`}
                      >
                        <Icon name="star" size={17} strokeWidth={1.8} filled={isPinned} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
            {q && !sections[0]?.rows.length ? <div className="px-0.5 py-1.5 text-xs text-tx-faint">No farms match that search.</div> : null}
          </div>
        ) : null}
      </div>

      <div ref={gridRef} className="relative mt-0.5 flex shrink-0 items-center gap-1.5">
        {grids.length ? (
          <button
            type="button"
            onClick={() => setGridOpen((o) => !o)}
            aria-expanded={gridOpen}
            aria-label="Choose grid"
            className="flex max-w-[128px] items-center gap-2 rounded-xl border border-line bg-ink-800 px-3 py-[9px]"
          >
            <span className="truncate font-mono text-[13px] font-semibold text-tx-strong">{grid?.name ?? "Grid"}</span>
            <Icon name="chevron" size={14} className={`shrink-0 text-tx-faint transition-transform ${gridOpen ? "rotate-180" : ""}`} />
          </button>
        ) : null}
        {gridOpen ? (
          <div className="absolute right-0 top-[calc(100%+6px)] z-20 flex min-w-[150px] flex-col gap-0.5 rounded-xl border border-line bg-ink-800 p-[5px] shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
            {grids.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  onPickGrid(g.id);
                  setGridOpen(false);
                }}
                className={`flex items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 font-mono text-[13px] ${g.id === grid?.id ? "bg-accent/15 text-accent" : "text-tx"}`}
              >
                <span className="whitespace-nowrap">{g.name}</span>
                <span className="text-[10px] text-tx-faint">{pondCounts[g.id] ?? 0}</span>
              </button>
            ))}
            {canManage ? (
              <button
                type="button"
                onClick={() => {
                  setGridOpen(false);
                  setGridSettingsOpen("new");
                }}
                className="mt-0.5 rounded-lg border-t border-line px-2.5 py-2 text-left text-xs font-bold text-accent"
              >
                + New grid
              </button>
            ) : null}
          </div>
        ) : null}
        {grid && canManage ? (
          <button
            type="button"
            onClick={() => setGridSettingsOpen(gridSettingsOpen ? null : "edit")}
            aria-label="Grid settings"
            aria-expanded={!!gridSettingsOpen}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-ink-800 text-tx-muted ${gridSettingsOpen ? "border-accent" : "border-line"}`}
          >
            <Icon name="gear" size={17} strokeWidth={1.8} />
          </button>
        ) : null}
        {gridSettingsOpen ? (
          <GridSettings
            mode={gridSettingsOpen}
            farmId={farm.id}
            grid={gridSettingsOpen === "edit" ? grid : null}
            onClose={() => setGridSettingsOpen(null)}
            onSaved={(g) => {
              setGridSettingsOpen(null);
              onGridSaved(g);
            }}
            onAddPond={() => {
              setGridSettingsOpen(null);
              onAddPond();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function GridSettings({
  mode,
  farmId,
  grid,
  onClose,
  onSaved,
  onAddPond,
}: {
  mode: "edit" | "new";
  farmId: string;
  grid: Grid | null;
  onClose: () => void;
  onSaved: (g: Grid) => void;
  onAddPond: () => void;
}) {
  const [name, setName] = useState(grid?.name ?? "");
  const [lat, setLat] = useState(grid?.latitude ? String(Number(grid.latitude)) : "");
  const [lng, setLng] = useState(grid?.longitude ? String(Number(grid.longitude)) : "");
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const coord = (v: string) => v.replace(/[^0-9.-]/g, "");
  const latN = Number(lat);
  const lngN = Number(lng);
  const error = !name.trim()
    ? "Give the grid a name"
    : !!lat !== !!lng
      ? "Enter both latitude and longitude, or neither"
      : lat && (!Number.isFinite(latN) || latN < -90 || latN > 90)
        ? "Latitude must be between -90 and 90"
        : lng && (!Number.isFinite(lngN) || lngN < -180 || lngN > 180)
          ? "Longitude must be between -180 and 180"
          : "";

  async function save() {
    if (error) return;
    setBusy(true);
    setApiError(null);
    try {
      const body = { name: name.trim(), latitude: lat ? latN : null, longitude: lng ? lngN : null };
      // The backend's grid update replaces notes too, so send the existing notes back.
      const saved = grid ? await api.updateGrid(grid.id, { ...body, notes: grid.notes ?? undefined }) : await api.createGrid({ farm_id: farmId, ...body });
      onSaved(saved);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Saving the grid failed.");
      setBusy(false);
    }
  }

  return (
    <div className="absolute right-0 top-[calc(100%+6px)] z-[25] flex w-[290px] flex-col gap-3 rounded-[14px] border border-accent bg-ink-800 p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-bold text-tx-strong">{grid ? `${grid.name} settings` : "New grid"}</span>
        <span className="text-[11px] text-tx-muted">Location is used for the weather and moon of every pond in this grid.</span>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="gs-name" className="text-[10px] uppercase tracking-[0.06em] text-tx-faint">
          Grid name
        </label>
        <input id="gs-name" value={name} onChange={(e) => setName(e.target.value)} className="h-10 w-full rounded-lg border border-line bg-ink-850 px-2.5 text-sm text-tx-strong outline-none focus:border-accent" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="gs-lat" className="text-[10px] uppercase tracking-[0.06em] text-tx-faint">
            Latitude
          </label>
          <input id="gs-lat" inputMode="decimal" placeholder="-5.4520" value={lat} onChange={(e) => setLat(coord(e.target.value))} className="h-10 w-full rounded-lg border border-line bg-ink-850 px-2.5 font-mono text-sm text-tx-strong outline-none focus:border-accent" />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="gs-lng" className="text-[10px] uppercase tracking-[0.06em] text-tx-faint">
            Longitude
          </label>
          <input id="gs-lng" inputMode="decimal" placeholder="105.2620" value={lng} onChange={(e) => setLng(coord(e.target.value))} className="h-10 w-full rounded-lg border border-line bg-ink-850 px-2.5 font-mono text-sm text-tx-strong outline-none focus:border-accent" />
        </div>
      </div>
      {error && (name || lat || lng) ? <span className="text-[11px] text-bad">{error}</span> : null}
      {apiError ? <span className="text-[11px] text-bad">{apiError}</span> : null}
      <div className="flex items-center gap-1.5">
        {mode === "edit" ? (
          <button type="button" onClick={onAddPond} className="rounded-lg border border-dashed border-line-dash px-3 py-2 text-xs font-bold text-accent">
            + Add pond
          </button>
        ) : null}
        <span className="flex-grow" />
        <button type="button" onClick={onClose} className="rounded-lg bg-ink-850 px-3.5 py-2 text-xs font-semibold text-tx-muted">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={!!error || busy} className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-accent-ink disabled:opacity-40">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
