"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AccountMenu } from "@/components/dashboard/AccountMenu";
import { AddPondForm } from "@/components/dashboard/AddPondForm";
import { Conditions } from "@/components/dashboard/Conditions";
import { DashboardHeader, type FarmStats } from "@/components/dashboard/DashboardHeader";
import { alertsFor } from "@/components/dashboard/model";
import { PondCard } from "@/components/dashboard/PondCard";
import { Banner, Loading } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { api, type Cycle, type DayView, type Farm, type FeedAdditive, type FeedType, type Grid, type Pond } from "@/lib/api";
import { byStartDesc, currentCycle, cycleLabel, statusLabel } from "@/lib/cycles";
import { niceDate, todayIso } from "@/lib/dates";
import { canManage } from "@/lib/roles";
import { useRequireUser } from "@/lib/session";

// Per-browser conveniences only; the page works without them.
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable
  }
}

type FarmData = { grids: Grid[]; ponds: Pond[]; cycles: Cycle[]; feedTypes: FeedType[]; additives: FeedAdditive[] };

export default function Dashboard() {
  const user = useRequireUser();
  const today = todayIso();
  const [farms, setFarms] = useState<Farm[] | null>(null);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [gridId, setGridId] = useState<string | null>(null);
  const [data, setData] = useState<FarmData | null>(null);
  const [todayDays, setTodayDays] = useState<Record<string, DayView | null>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [farmStats, setFarmStats] = useState<FarmStats | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);
  const [gridSettings, setGridSettings] = useState<"edit" | "new" | null>(null);
  const [addingPond, setAddingPond] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Farms, then the farm from the URL, the last one used, or the first.
  useEffect(() => {
    if (!user) return;
    setRecent(readJson("shrimpy.recentFarms", []));
    setPinned(readJson("shrimpy.pinnedFarms", []));
    api
      .listFarms()
      .then((list) => {
        setFarms(list);
        const params = new URLSearchParams(window.location.search);
        const wanted = params.get("farm") ?? readJson<string | null>("shrimpy.farm", null);
        const pick = list.find((f) => f.id === wanted) ?? list[0];
        if (pick) setFarmId(pick.id);
        const pond = params.get("pond");
        if (pond) setExpanded({ [pond]: true });
        setGridId(params.get("grid"));
      })
      .catch((e: Error) => setError(e.message));
  }, [user]);

  const loadFarm = useCallback(async (id: string) => {
    const [grids, ponds, cycles, feedTypes, additives] = await Promise.all([
      api.listGrids(id),
      api.listPonds(undefined, id),
      api.listCycles(id),
      api.listFeedTypes(id),
      api.listAdditives(id),
    ]);
    setData({ grids, ponds, cycles, feedTypes, additives });
    return grids;
  }, []);

  useEffect(() => {
    if (!farmId) return;
    setData(null);
    setTodayDays({});
    writeJson("shrimpy.farm", farmId);
    setRecent((r) => {
      const next = [farmId, ...r.filter((x) => x !== farmId)].slice(0, 3);
      writeJson("shrimpy.recentFarms", next);
      return next;
    });
    loadFarm(farmId)
      .then((grids) => {
        setGridId((g) => {
          const remembered = readJson<Record<string, string>>("shrimpy.grid", {})[farmId];
          return grids.find((x) => x.id === g)?.id ?? grids.find((x) => x.id === remembered)?.id ?? grids[0]?.id ?? null;
        });
      })
      .catch((e: Error) => setError(e.message));
  }, [farmId, loadFarm]);

  // Keep the URL shareable: /?farm=&grid=
  useEffect(() => {
    if (!farmId) return;
    const params = new URLSearchParams(window.location.search);
    params.set("farm", farmId);
    if (gridId) params.set("grid", gridId);
    else params.delete("grid");
    window.history.replaceState(null, "", `/?${params.toString()}`);
    if (gridId) writeJson("shrimpy.grid", { ...readJson<Record<string, string>>("shrimpy.grid", {}), [farmId]: gridId });
  }, [farmId, gridId]);

  const farm = farms?.find((f) => f.id === farmId) ?? null;
  const grid = data?.grids.find((g) => g.id === gridId) ?? null;
  const gridPonds = useMemo(
    () => (data && grid ? data.ponds.filter((p) => p.grid_id === grid.id).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) : []),
    [data, grid],
  );
  const active = gridPonds.map((p) => ({ pond: p, cycle: data ? currentCycle(data.cycles, p.id) : null })).filter((x): x is { pond: Pond; cycle: Cycle } => !!x.cycle);
  const inactive = gridPonds.filter((p) => !active.some((a) => a.pond.id === p.id));

  const loadToday = useCallback(
    (pondId: string, cycleId: string) => {
      api
        .getCycleDay(cycleId, today)
        .then((d) => setTodayDays((m) => ({ ...m, [pondId]: d })))
        .catch(() => setTodayDays((m) => ({ ...m, [pondId]: null })));
    },
    [today],
  );

  // Today's day view per active pond drives the collapsed "next feed" hint and the alert dot.
  const activeKey = active.map((a) => `${a.pond.id}:${a.cycle.id}`).join(",");
  useEffect(() => {
    active.forEach((a) => loadToday(a.pond.id, a.cycle.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, loadToday]);

  async function loadFarmStats() {
    if (farmStats) return;
    try {
      const [grids, ponds, cycles] = await Promise.all([api.listGrids(), api.listPonds(), api.listCycles()]);
      const farmOfGrid = new Map(grids.map((g) => [g.id, g.farm_id]));
      const stats: FarmStats = {};
      ponds.forEach((p) => {
        const f = farmOfGrid.get(p.grid_id);
        if (!f) return;
        stats[f] ??= { active: 0, ponds: 0 };
        stats[f].ponds += 1;
        if (currentCycle(cycles, p.id)) stats[f].active += 1;
      });
      (farms ?? []).forEach((f) => (stats[f.id] ??= { active: 0, ponds: 0 }));
      setFarmStats(stats);
    } catch {
      // Stats are decoration in the menu; the list still works without them.
    }
  }

  if (!user) return <Loading />;
  if (error && !farms) {
    return (
      <main className="mx-auto max-w-[480px] px-5 py-10">
        <Banner>{error}</Banner>
      </main>
    );
  }
  if (!farms) return <Loading label="Loading farms…" />;
  if (!farms.length) {
    return (
      <main className="mx-auto flex max-w-[480px] flex-col gap-4 px-5 py-16 text-center">
        <h1 className="text-2xl font-bold text-tx-strong">No farms yet</h1>
        <p className="text-sm text-tx-muted">{user.is_admin ? "Create the first farm in the admin console." : "Ask your farm admin to add you to a farm."}</p>
        {user.is_admin ? (
          <Link href="/admin" className="self-center rounded-[10px] bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink hover:text-accent-ink">
            Open admin console
          </Link>
        ) : null}
      </main>
    );
  }
  if (!farm) return <Loading />;

  const manage = canManage(farm.role);
  const alerts = active.filter((a) => alertsFor(todayDays[a.pond.id] ?? null).length > 0).length;
  const pondCounts = Object.fromEntries((data?.grids ?? []).map((g) => [g.id, (data?.ponds ?? []).filter((p) => p.grid_id === g.id).length]));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col gap-[22px] bg-ink-950 px-5 pb-[72px] pt-7">
      <DashboardHeader
        farms={farms}
        farm={farm}
        farmStats={farmStats}
        recent={recent}
        pinned={pinned}
        onPickFarm={(id) => {
          setGridId(null);
          setExpanded({});
          setAddingPond(false);
          setFarmId(id);
        }}
        onTogglePin={(id) =>
          setPinned((p) => {
            const next = p.includes(id) ? p.filter((x) => x !== id) : [...p, id];
            writeJson("shrimpy.pinnedFarms", next);
            return next;
          })
        }
        onFarmMenuOpened={loadFarmStats}
        grids={data?.grids ?? []}
        grid={grid}
        pondCounts={pondCounts}
        onPickGrid={(id) => {
          setGridId(id);
          setAddingPond(false);
        }}
        canManage={manage}
        gridSettingsOpen={gridSettings}
        setGridSettingsOpen={setGridSettings}
        onGridSaved={(g) => {
          loadFarm(farm.id).then(() => setGridId(g.id));
        }}
        onAddPond={() => setAddingPond(true)}
      />

      <div className="-mt-2 flex items-center gap-3.5">
        {data && grid ? (
          <>
            <Stat value={active.length} label="active" />
            <Stat value={inactive.length} label="inactive" color="text-tx-muted" />
            <Stat value={alerts} label={alerts === 1 ? "alert" : "alerts"} color={alerts ? "text-warn" : "text-good"} />
          </>
        ) : null}
        <span className="flex-grow" />
        <Link href={`/trends?farm=${farm.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-ink-800 px-2.5 py-1.5 text-xs font-semibold text-tx-soft hover:text-tx-strong">
          <Icon name="chart" size={13} /> Trends
        </Link>
        <AccountMenu user={user} />
      </div>

      {error ? <Banner onDismiss={() => setError(null)}>{error}</Banner> : null}

      {!data ? (
        <Loading label="Loading ponds…" />
      ) : !grid ? (
        <div className="flex flex-col gap-3 rounded-[18px] border border-dashed border-line-strong bg-ink-850 p-5 text-center">
          <span className="text-sm font-semibold text-tx-strong">No grids in {farm.name} yet</span>
          <span className="text-xs text-tx-muted">Ponds live inside grids. A grid's location drives its weather and moon data.</span>
          {manage ? (
            <button type="button" onClick={() => setGridSettings("new")} className="self-center rounded-[10px] bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink">
              + New grid
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {addingPond ? (
            <AddPondForm
              grid={grid}
              existing={gridPonds}
              onCancel={() => setAddingPond(false)}
              onCreated={(p) => {
                setAddingPond(false);
                loadFarm(farm.id).then(() => setExpanded((e) => ({ ...e, [p.id]: true })));
              }}
            />
          ) : null}

          <Conditions grid={grid} today={today} canManage={manage} onSetLocation={() => setGridSettings("edit")} />

          <div className="flex flex-col gap-3.5">
            {active.map(({ pond, cycle }) => (
              <PondCard
                key={pond.id}
                pond={pond}
                cycle={cycle}
                farmId={farm.id}
                farmName={farm.name}
                role={farm.role}
                feedTypes={data.feedTypes}
                additives={data.additives}
                todayDay={todayDays[pond.id] ?? null}
                today={today}
                userEmail={user.email}
                expanded={!!expanded[pond.id]}
                onToggle={() => setExpanded((e) => ({ ...e, [pond.id]: !e[pond.id] }))}
                onTodayChanged={() => loadToday(pond.id, cycle.id)}
              />
            ))}
            {active.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-line bg-ink-850 p-5 text-center text-sm text-tx-muted">
                No pond in {grid.name} is running a cycle.
                {manage && !addingPond ? (
                  <button type="button" onClick={() => setAddingPond(true)} className="mt-3 block w-full rounded-lg border border-dashed border-line-dash py-2.5 text-xs font-bold text-accent">
                    + Add pond
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {inactive.length ? (
            <div className="flex flex-col gap-2.5">
              <div className="eyebrow">Inactive ponds</div>
              {inactive.map((p) => {
                const last = data.cycles.filter((c) => c.pond_id === p.id).sort(byStartDesc)[0];
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-[18px] border border-dashed border-line bg-ink-850 px-[18px] py-4">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-tx-ghost" />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-base font-semibold text-tx-muted">{p.name}</span>
                        <span className="truncate font-mono text-[11px] text-tx-faint">{last ? `${cycleLabel(last)} · ${statusLabel(last.status).toLowerCase()}` : "No cycle yet"}</span>
                      </div>
                    </div>
                    <div className="ml-auto flex shrink-0 flex-col items-end gap-0.5">
                      <span className="font-mono text-[13px] font-semibold text-tx-muted">{last?.actual_end_date ? niceDate(last.actual_end_date) : "—"}</span>
                      <span className="text-[10px] uppercase tracking-[0.06em] text-tx-faint">Since</span>
                    </div>
                    <Link href={`/ponds/${p.id}/settings`} aria-label={`Open pond settings for ${p.name}`} className="-mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-tx-muted hover:text-tx-strong">
                      <Icon name="gear" size={18} strokeWidth={1.8} />
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}

function Stat({ value, label, color = "text-tx" }: { value: number; label: string; color?: string }) {
  return (
    <span className="inline-flex items-baseline gap-[5px] text-xs text-tx-faint">
      <span className={`font-mono font-semibold ${color}`}>{value}</span>
      <span>{label}</span>
    </span>
  );
}
