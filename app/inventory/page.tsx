"use client";

import { useEffect, useMemo, useState } from "react";

import { ItemForm, type StockDraft } from "@/components/inventory/ItemForm";
import { ItemRow } from "@/components/inventory/ItemRow";
import { CATEGORIES, categoryLabel, isLow } from "@/components/inventory/model";
import { Button } from "@/components/ui/Button";
import { Banner, ConfirmStrip, Loading } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PageColumn, PageHeader } from "@/components/ui/PageHeader";
import { api, type Farm, type Grid, type InventoryItem, type Pond, type Product, type WarehouseInventory } from "@/lib/api";
import { load, peek, put } from "@/lib/cache";
import { canAdd as roleCanAdd, canManage as roleCanManage } from "@/lib/roles";
import { useRequireUser } from "@/lib/session";

type WarehouseEdit = { mode: "new" | "rename" | "delete"; name: string; copyFrom: string };

export default function InventoryPage() {
  const user = useRequireUser();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseInventory[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [whId, setWhId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [whEdit, setWhEdit] = useState<WarehouseEdit | null>(null);
  const [ponds, setPonds] = useState<Pond[]>([]);
  const [showAvailable, setShowAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invKey = grid ? `inventory:${grid.id}` : "";

  // Farm (for the role) and grid from the URL, through the same cache the dashboard fills.
  useEffect(() => {
    if (!user) return;
    const q = new URLSearchParams(window.location.search);
    const farmId = q.get("farm");
    const gridId = q.get("grid");
    if (!farmId || !gridId) {
      setError("Open inventory from a grid on the dashboard.");
      return;
    }
    (async () => {
      const farms = peek<Farm[]>("farms")?.value ?? (await load("farms", api.listFarms, { persist: true }));
      const f = farms.find((x) => x.id === farmId) ?? null;
      if (!f) throw new Error("Farm not found.");
      setFarm(f);
      // The dashboard's cached farm data already holds the grids.
      const farmData = peek<{ grids: Grid[] }>(`farm:${farmId}`)?.value;
      const grids = farmData?.grids ?? (await api.listGrids(farmId));
      const g = grids.find((x) => x.id === gridId) ?? null;
      if (!g) throw new Error("Grid not found.");
      setGrid(g);
      api.listProducts(farmId, "product").then(setProducts).catch(() => setProducts([]));
      api.listPonds(gridId).then(setPonds).catch(() => setPonds([]));
    })().catch((e: Error) => setError(e.message));
  }, [user]);

  useEffect(() => {
    if (!grid) return;
    const key = `inventory:${grid.id}`;
    const hit = peek<WarehouseInventory[]>(key);
    if (hit) setWarehouses(hit.value);
    if (hit?.fresh) return;
    load(key, () => api.getGridInventory(grid.id))
      .then(setWarehouses)
      .catch((e: Error) => !hit && setError(e.message));
  }, [grid]);

  // Keep the chosen warehouse valid as warehouses come and go.
  useEffect(() => {
    if (!warehouses) return;
    setWhId((cur) => (cur && warehouses.some((w) => w.id === cur) ? cur : warehouses[0]?.id ?? null));
  }, [warehouses]);

  /** Apply a change locally and to the cache, so nothing needs refetching. */
  function update(fn: (ws: WarehouseInventory[]) => WarehouseInventory[]) {
    setWarehouses((cur) => {
      const next = fn(cur ?? []);
      if (invKey) put(invKey, next);
      return next;
    });
  }
  const patchItems = (whIdToPatch: string, fn: (items: InventoryItem[]) => InventoryItem[]) =>
    update((ws) => ws.map((w) => (w.id === whIdToPatch ? { ...w, items: fn(w.items) } : w)));

  const canAdd = roleCanAdd(farm?.role);
  const canManage = roleCanManage(farm?.role);
  const wh = warehouses?.find((w) => w.id === whId) ?? null;
  const items = useMemo(() => wh?.items ?? [], [wh]);
  const lowCount = items.filter(isLow).length;
  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => (!lowOnly || isLow(i)) && (!q || i.name.toLowerCase().includes(q) || (i.location_note ?? "").toLowerCase().includes(q)));
  const byName = (a: InventoryItem, b: InventoryItem) => Number(isLow(b)) - Number(isLow(a)) || a.name.localeCompare(b.name);
  const groups = CATEGORIES.map((c) => ({ ...c, items: shown.filter((i) => i.category === c.key).sort(byName) })).filter((g) => g.items.length);

  /** Products the farm knows that this warehouse does not stock yet. */
  const available = products.filter((p) => p.kind === "product" && !items.some((i) => i.product_id === p.id));

  async function addItem(draft: StockDraft) {
    if (!wh || !farm) return;
    setBusy(true);
    setError(null);
    try {
      // One call: a new product is created by being stocked, never on its own.
      const created = await api.createInventoryItem(wh.id, {
        ...(draft.productId ? { product_id: draft.productId } : {}),
        ...(draft.newItem ? { new_product: draft.newItem } : {}),
        quantity: draft.quantity,
        low_stock_level: draft.low_stock_level,
        location_note: draft.location_note,
      });
      patchItems(wh.id, (list) => [...list, created]);
      setAdding(false);
      setOpenItem(created.id);
      setProducts(await api.listProducts(farm.id, "product"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not stock it.");
    } finally {
      setBusy(false);
    }
  }

  /** Start stocking a product this warehouse does not hold yet, at zero. */
  async function stockHere(productId: string) {
    if (!wh) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createInventoryItem(wh.id, {
        product_id: productId,
        quantity: 0,
        low_stock_level: null,
        location_note: null,
      });
      patchItems(wh.id, (list) => [...list, created]);
      setOpenItem(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not stock it here.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePond(pondId: string) {
    if (!wh || !grid) return;
    const next = wh.pond_ids.includes(pondId) ? wh.pond_ids.filter((id) => id !== pondId) : [...wh.pond_ids, pondId];
    setBusy(true);
    setError(null);
    try {
      await api.setWarehousePonds(wh.id, next);
      // A pond moving here leaves another warehouse, so re-read the whole grid.
      const fresh = await api.getGridInventory(grid.id);
      update(() => fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change which ponds take from here.");
    } finally {
      setBusy(false);
    }
  }

  async function saveWarehouse() {
    if (!whEdit || !grid) return;
    setBusy(true);
    setError(null);
    try {
      if (whEdit.mode === "new") {
        const w = await api.createWarehouse(grid.id, {
          name: whEdit.name.trim(),
          copy_items_from: whEdit.copyFrom || null,
        });
        // Copying brings item rows with it, so read the grid back rather than guess.
        const fresh = await api.getGridInventory(grid.id);
        update(() => fresh);
        setWhId(w.id);
      } else if (whEdit.mode === "rename" && wh) {
        const w = await api.updateWarehouse(wh.id, { name: whEdit.name.trim() });
        update((ws) => ws.map((x) => (x.id === w.id ? { ...x, name: w.name } : x)));
      } else if (whEdit.mode === "delete" && wh) {
        await api.deleteWarehouse(wh.id);
        update((ws) => ws.filter((x) => x.id !== wh.id));
      }
      setWhEdit(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the warehouse.");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <Loading />;

  return (
    <PageColumn className="gap-3.5">
      <PageHeader
        eyebrow={`${farm?.name ?? "—"} · ${grid?.name ?? "—"}`}
        title="Inventory"
        backHref={farm && grid ? `/?farm=${farm.id}&grid=${grid.id}` : "/"}
      />
      {error ? <Banner onDismiss={() => setError(null)}>{error}</Banner> : null}

      {!warehouses ? (
        error ? null : <Loading label="Loading inventory…" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {warehouses.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  setWhId(w.id);
                  setOpenItem(null);
                  setWhEdit(null);
                }}
                aria-pressed={w.id === whId}
                className={`h-8 rounded-full border px-3 text-xs font-semibold ${w.id === whId ? "border-accent bg-accent/[0.12] text-tx-strong" : "border-line-strong bg-ink-800 text-tx-soft"}`}
              >
                {w.name} <span className="font-mono text-[10px] text-tx-faint">{w.items.length}</span>
              </button>
            ))}
            {canManage ? (
              <>
                <button type="button" onClick={() => setWhEdit({ mode: "new", name: "", copyFrom: "" })} className="h-8 rounded-full border border-dashed border-line-dash px-3 text-xs font-semibold text-accent">
                  + Warehouse
                </button>
                {wh ? (
                  <button type="button" onClick={() => setWhEdit(whEdit ? null : { mode: "rename", name: wh.name, copyFrom: "" })} aria-label={`Warehouse settings for ${wh.name}`} className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-tx-muted hover:text-tx-strong">
                    <Icon name="gear" size={16} strokeWidth={1.8} />
                  </button>
                ) : null}
              </>
            ) : null}
          </div>

          {whEdit && whEdit.mode !== "delete" ? (
            <div className="flex flex-col gap-2 rounded-[14px] border border-accent bg-ink-850 p-3">
              <label className="flex flex-col gap-1">
                <span className="field-label">{whEdit.mode === "new" ? "New warehouse name" : "Warehouse name"}</span>
                <input autoFocus className="input-sm" value={whEdit.name} onChange={(e) => setWhEdit({ ...whEdit, name: e.target.value })} placeholder="e.g. Gudang B" />
              </label>
              {whEdit.mode === "new" && warehouses.length ? (
                <label className="flex flex-col gap-1">
                  <span className="field-label">Stock the same products as (optional)</span>
                  <select className="input-sm" value={whEdit.copyFrom} onChange={(e) => setWhEdit({ ...whEdit, copyFrom: e.target.value })}>
                    <option value="">Start empty</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.items.length})
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-tx-faint">Copies the product list at zero, not the amounts.</span>
                </label>
              ) : null}

              {whEdit.mode === "rename" && wh ? (
                <div className="flex flex-col gap-1">
                  <span className="field-label">Ponds that take from here</span>
                  <div className="flex flex-wrap gap-1.5">
                    {ponds.map((p) => {
                      const here = wh.pond_ids.includes(p.id);
                      const elsewhere = !here && warehouses.some((w) => w.id !== wh.id && w.pond_ids.includes(p.id));
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={busy}
                          aria-pressed={here}
                          onClick={() => togglePond(p.id)}
                          className={`h-8 rounded-full border px-3 text-xs font-semibold ${
                            here ? "border-accent bg-accent/[0.12] text-tx-strong" : "border-line-strong bg-ink-800 text-tx-soft"
                          }`}
                        >
                          {p.name}
                          {elsewhere ? <span className="ml-1 text-[10px] text-tx-faint">·</span> : null}
                        </button>
                      );
                    })}
                    {!ponds.length ? <span className="text-[11px] text-tx-faint">No ponds on this grid.</span> : null}
                  </div>
                  <span className="text-[11px] text-tx-faint">
                    Feed and treatments on these ponds come out of {wh.name}. A pond draws from one warehouse, so picking
                    it here takes it off the other. A dot means it is on another warehouse now.
                  </span>
                </div>
              ) : null}

              <div className="flex items-center gap-1.5">
                {whEdit.mode === "rename" ? (
                  <Button variant="danger" size="xs" onClick={() => setWhEdit({ mode: "delete", name: whEdit.name, copyFrom: "" })}>
                    Delete warehouse
                  </Button>
                ) : null}
                <span className="flex-grow" />
                <Button variant="secondary" size="sm" onClick={() => setWhEdit(null)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" disabled={!whEdit.name.trim() || busy} onClick={saveWarehouse}>
                  {whEdit.mode === "new" ? "Add" : "Save"}
                </Button>
              </div>
            </div>
          ) : null}
          {whEdit?.mode === "delete" && wh ? (
            <ConfirmStrip
              message={`Delete ${wh.name}${wh.items.length ? ` and its ${wh.items.length} item${wh.items.length === 1 ? "" : "s"}` : ""}? Their stock history goes too.`}
              onCancel={() => setWhEdit(null)}
              onConfirm={saveWarehouse}
              busy={busy}
            />
          ) : null}

          {!wh ? (
            <div className="rounded-2xl border border-dashed border-line-strong bg-ink-850 p-5 text-center text-sm text-tx-muted">
              No warehouse on this grid yet.{canManage ? " Add one above." : ""}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-grow">
                  <Icon name="search" size={15} className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2 text-tx-faint" />
                  <input
                    type="search"
                    aria-label="Search items"
                    placeholder="Search items"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full rounded-[10px] border border-line bg-ink-800 py-2 pl-[34px] pr-3 text-sm text-tx-strong outline-none focus:border-accent"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setLowOnly((v) => !v)}
                  aria-pressed={lowOnly}
                  disabled={!lowCount && !lowOnly}
                  className={`h-9 shrink-0 rounded-full border px-3 text-xs font-semibold disabled:opacity-40 ${lowOnly ? "border-warn bg-warn/10 text-warn" : "border-line-strong bg-ink-800 text-tx-soft"}`}
                >
                  Low stock {lowCount}
                </button>
              </div>

              {canManage && !adding ? (
                <div className="flex flex-wrap gap-1.5">
                  <Button variant="dashed" size="sm" onClick={() => setAdding(true)}>
                    + Add item
                  </Button>
                </div>
              ) : null}
              {adding ? (
                <ItemForm
                  available={available}
                  saving={busy}
                  onCancel={() => setAdding(false)}
                  onSave={addItem}
                />
              ) : null}

              {/* Capped and scrolled: a warehouse with hundreds of items would
                  otherwise bury the search and the warehouse picker. */}
              <div className="flex max-h-[62vh] flex-col gap-1.5 overflow-y-auto">
              {groups.map((g) => {
                const low = g.items.filter(isLow).length;
                // Searching or filtering opens every group that matches.
                const isOpen = q || lowOnly ? true : !closed[g.key];
                return (
                  <section key={g.key} className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => setClosed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                      aria-expanded={isOpen}
                      className="flex items-center gap-2 px-0.5 py-1 text-left"
                    >
                      <Icon name="chevron" size={13} strokeWidth={2.4} className={`shrink-0 text-tx-faint transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-tx-soft">{g.label}</span>
                      <span className="font-mono text-[11px] text-tx-faint">{g.items.length}</span>
                      {low ? <span className="ml-auto text-[11px] font-semibold text-warn">{low} low</span> : null}
                    </button>
                    {isOpen
                      ? g.items.map((i) => (
                          <ItemRow
                            key={i.id}
                            item={i}
                            open={openItem === i.id}
                            onToggle={() => setOpenItem(openItem === i.id ? null : i.id)}
                            canAdd={canAdd}
                            canManage={canManage}
                            product={products.find((p) => p.id === i.product_id)}
                            lastStock={!(warehouses ?? []).some((w) => w.id !== wh.id && w.items.some((x) => x.product_id === i.product_id))}
                            onChanged={(next) => patchItems(wh.id, (list) => list.map((x) => (x.id === next.id ? next : x)))}
                            onDeleted={(id) => {
                              patchItems(wh.id, (list) => list.filter((x) => x.id !== id));
                              setOpenItem(null);
                              // That may have been its last stock row, which deletes it outright.
                              if (farm) api.listProducts(farm.id, "product").then(setProducts).catch(() => undefined);
                            }}
                          />
                        ))
                      : null}
                  </section>
                );
              })}
              </div>

              {available.length ? (
                <section className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowAvailable((v) => !v)}
                    aria-expanded={showAvailable}
                    className="flex items-center gap-2 px-0.5 py-1 text-left"
                  >
                    <Icon
                      name="chevron"
                      size={13}
                      strokeWidth={2.4}
                      className={`shrink-0 text-tx-faint transition-transform ${showAvailable ? "" : "-rotate-90"}`}
                    />
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-tx-soft">Not stocked here</span>
                    <span className="font-mono text-[11px] text-tx-faint">{available.length}</span>
                  </button>
                  {showAvailable
                    ? available.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          disabled={!canManage || busy}
                          onClick={() => stockHere(p.id)}
                          className="flex items-center gap-2 rounded-[12px] border border-dashed border-line-dash bg-ink-850 px-3 py-2 text-left disabled:opacity-60"
                        >
                          <span className="flex min-w-0 flex-grow flex-col gap-0.5">
                            <span className="truncate text-[13px] text-tx-soft">{p.name}</span>
                            <span className="truncate text-[11px] text-tx-faint">
                              {categoryLabel(p.category)} · counted in {p.base_unit}
                            </span>
                          </span>
                          {canManage ? <span className="shrink-0 text-[11px] font-semibold text-accent">Stock here</span> : null}
                        </button>
                      ))
                    : null}
                </section>
              ) : null}

              {!items.length && !adding ? (
                <div className="rounded-2xl border border-dashed border-line-strong bg-ink-850 p-5 text-center text-sm text-tx-muted">
                  Nothing in {wh.name} yet.{canManage ? " Add the first item above." : ""}
                </div>
              ) : items.length && !groups.length ? (
                <div className="px-0.5 py-2 text-xs text-tx-faint">No items match.</div>
              ) : null}
            </>
          )}
        </>
      )}
    </PageColumn>
  );
}
