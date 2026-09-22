"use client";

import { ownersOf, type FarmsCtx } from "./adminHelpers";
import { CreateFarmForm, FarmDetailPanel } from "./FarmDetailPanel";
import { StatTiles, type StatTile } from "./StatTiles";

export function FarmsTab({ ctx }: { ctx: FarmsCtx }) {
  const noMaintainerCount = ctx.farms.filter((f) => ownersOf(ctx.membersByFarm[f.id] ?? []).length === 0).length;
  const totalActivePonds = Object.values(ctx.activePondCounts).reduce((a, b) => a + b, 0);
  const totalMemberships = Object.values(ctx.membersByFarm).reduce((a, list) => a + list.length, 0);

  const tiles: StatTile[] = [
    {
      key: "all",
      value: ctx.farms.length,
      label: "Farms",
      onToggle: () => ctx.onFilterChange("all"),
      active: ctx.filter === "all",
    },
    {
      key: "nomaint",
      value: noMaintainerCount,
      label: "Without a maintainer",
      valueClass: noMaintainerCount ? "text-warn" : "text-good",
      onToggle: () => ctx.onFilterChange(ctx.filter === "nomaint" ? "all" : "nomaint"),
      active: ctx.filter === "nomaint",
    },
    { key: "ponds", value: totalActivePonds, label: "Active ponds" },
    { key: "members", value: totalMemberships, label: "Memberships" },
  ];

  const q = ctx.query.trim().toLowerCase();
  const rows = ctx.farms.filter((f) => {
    if (ctx.filter === "nomaint" && ownersOf(ctx.membersByFarm[f.id] ?? []).length > 0) return false;
    if (q && !f.name.toLowerCase().includes(q)) return false;
    return true;
  });

  const selectedFarm = ctx.selectedId ? ctx.farms.find((f) => f.id === ctx.selectedId) ?? null : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="min-w-0 flex-1 overflow-visible px-4 py-5 lg:overflow-y-auto lg:px-8 lg:py-6">
        <StatTiles tiles={tiles} />
        <div className="grid grid-cols-[minmax(0,1fr)_70px_120px] gap-4 px-4 pb-2.5 text-[11px] uppercase tracking-[0.08em] text-tx-dim">
          <span>Farm</span>
          <span>Ponds</span>
          <span>Status</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {rows.map((f) => {
            const owners = ownersOf(ctx.membersByFarm[f.id] ?? []);
            const active = f.id === ctx.selectedId && !ctx.creating;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => ctx.onSelect(f.id)}
                aria-label={`Open ${f.name}`}
                className={`grid grid-cols-[minmax(0,1fr)_70px_120px] items-center gap-4 rounded-xl border px-4 py-3.5 text-left ${
                  active ? "border-accent bg-accent/[0.08]" : "border-line-soft bg-ink-850"
                }`}
              >
                <span className="truncate text-[15px] font-semibold text-tx-strong">{f.name}</span>
                <span className="font-mono text-[13px] text-tx-soft">{ctx.activePondCounts[f.id] ?? 0}</span>
                <span
                  className={`justify-self-start rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                    owners.length ? "border-good text-good" : "border-warn text-warn"
                  }`}
                >
                  {owners.length ? "Active" : "No maintainer"}
                </span>
              </button>
            );
          })}
          {rows.length === 0 ? (
            <div className="px-4 py-6 text-sm text-tx-dim">No farms match this search or filter.</div>
          ) : null}
        </div>
      </div>

      <div className="flex w-full flex-col gap-5 border-t border-line-soft bg-ink-900 p-4 lg:w-[460px] lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:p-6">
        {ctx.creating ? <CreateFarmForm ctx={ctx} /> : null}
        {selectedFarm && !ctx.creating ? <FarmDetailPanel farm={selectedFarm} ctx={ctx} /> : null}
        {!selectedFarm && !ctx.creating ? (
          <div className="py-10 text-center text-sm text-tx-dim">Select a farm to see its details.</div>
        ) : null}
      </div>
    </div>
  );
}
