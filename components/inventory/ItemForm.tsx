"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type { InventoryCategory, InventoryItem, Product } from "@/lib/api";
import { decimalInput, num } from "@/lib/num";
import { Icon } from "@/components/ui/Icon";
import { BASE_UNITS, CATEGORIES, PACK_UNIT_SUGGESTIONS } from "./model";

/** What the caller has to save: a new product to create first, or an existing one to stock. */
export type StockDraft = {
  productId: string | null;
  newItem: {
    name: string;
    category: InventoryCategory;
    base_unit: string;
    price_per_unit: number | null;
    units: { unit: string; factor_to_base: number }[];
  } | null;
  quantity: number;
  low_stock_level: number | null;
  location_note: string | null;
};

type Draft = {
  productId: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  quantity: string;
  low: string;
  location: string;
  price: string;
  units: { unit: string; factor: string }[];
};

const NEW = "__new__";

/**
 * Start stocking a product in this warehouse, or edit what is already here.
 *
 * Choosing a product the farm already knows is the common case; creating one is
 * offered inline so nobody has to leave for the catalog and come back.
 */
export function ItemForm({
  item,
  defaultCategory = "feed",
  /** Products the farm knows that this warehouse does not stock yet. */
  available,
  /** The product behind this row, when editing, so its name and unit can be changed here. */
  product,
  saving,
  onCancel,
  onSave,
}: {
  item?: InventoryItem;
  defaultCategory?: InventoryCategory;
  available?: Product[];
  product?: Product;
  saving: boolean;
  onCancel: () => void;
  onSave: (draft: StockDraft) => void;
}) {
  const editing = !!item;
  const choices = available ?? [];
  const [d, setD] = useState<Draft>(() => ({
    // Editing shows the product's own fields; adding starts on the picker.
    productId: editing ? "" : choices.length ? "" : NEW,
    name: product?.name ?? item?.name ?? "",
    category: product?.category ?? item?.category ?? defaultCategory,
    unit: product?.base_unit ?? item?.unit ?? "",
    quantity: "",
    low: item?.low_stock_level != null ? String(num(item.low_stock_level)) : "",
    location: item?.location_note ?? "",
    price: product?.price_per_unit != null ? String(num(product.price_per_unit)) : "",
    units: (product?.units ?? []).map((u) => ({ unit: u.unit, factor: String(num(u.factor_to_base)) })),
  }));
  const set = (patch: Partial<Draft>) => setD((cur) => ({ ...cur, ...patch }));

  // Editing always edits the product itself; adding only when something new is chosen.
  const describing = editing || d.productId === NEW;
  const picked = choices.find((p) => p.id === d.productId) ?? null;
  const name = d.name.trim();
  const clash = choices.some((p) => p.name.trim().toLowerCase() === name.toLowerCase());

  const error = !describing
    ? d.productId
      ? ""
      : "Choose a product"
    : !name
      ? "Enter a name"
      : !editing && clash
        ? "The farm already has a product with that name — choose it from the list instead"
        : !d.unit.trim()
          ? "Pick what it is counted in"
          : d.units.some((u) => !u.unit.trim() || !(num(u.factor) > 0))
            ? "Every pack size needs a name and how many base units it holds"
            : "";
  const touched = !!(d.name || d.unit || d.productId);

  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-accent bg-ink-850 p-3.5">
      {!editing ? (
        <span className="text-sm font-bold text-tx-strong">
          {choices.length ? "Stock a product here" : "Add the first product"}
        </span>
      ) : null}

      {/* With nothing in the catalog yet the picker has nothing to offer, so go
          straight to describing the item rather than showing an empty dropdown. */}
      {!editing && choices.length ? (
        <label className="flex flex-col gap-1">
          <span className="field-label">Product</span>
          <select className="input-sm" value={d.productId} onChange={(e) => set({ productId: e.target.value })}>
            <option value="">Choose…</option>
            {choices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.base_unit})
              </option>
            ))}
            <option value={NEW}>+ Something new</option>
          </select>
          {picked ? <span className="text-[11px] text-tx-faint">Counted in {picked.base_unit}.</span> : null}
        </label>
      ) : null}

      {describing ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="field-label">Name</span>
            <input className="input-sm" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Biolacto" />
          </label>
          <div className="grid grid-cols-[1.3fr_1fr] gap-2">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="field-label">Category</span>
              <select className="input-sm" value={d.category} onChange={(e) => set({ category: e.target.value as InventoryCategory })}>
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="field-label">Counted in</span>
              <select className="input-sm" value={d.unit} onChange={(e) => set({ unit: e.target.value })}>
                <option value="">Pick…</option>
                {BASE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="field-label">Price per {d.unit || "unit"} (optional)</span>
            <input
              className="input-sm font-mono"
              inputMode="decimal"
              value={d.price}
              onChange={(e) => set({ price: decimalInput(e.target.value, 2) })}
              placeholder="—"
            />
            <span className="text-[11px] text-tx-faint">
              What one {d.unit || "unit"} costs. A formula made from this works out its own cost from here.
            </span>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="field-label">How it is bought (optional)</span>
            {d.units.map((u, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  className="input-xs min-w-0 flex-grow"
                  list="item-pack-units"
                  value={u.unit}
                  placeholder="sack"
                  onChange={(e) => set({ units: d.units.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)) })}
                />
                <span className="shrink-0 text-[11px] text-tx-faint">=</span>
                <input
                  className="input-xs w-20 text-right font-mono"
                  inputMode="decimal"
                  value={u.factor}
                  placeholder="30"
                  onChange={(e) =>
                    set({ units: d.units.map((x, j) => (j === i ? { ...x, factor: decimalInput(e.target.value, 6) } : x)) })
                  }
                />
                <span className="w-8 shrink-0 text-[11px] text-tx-faint">{d.unit || "—"}</span>
                <button
                  type="button"
                  aria-label={`Remove pack size ${u.unit || i + 1}`}
                  onClick={() => set({ units: d.units.filter((_, j) => j !== i) })}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-tx-dim hover:text-tx-strong"
                >
                  <Icon name="close" size={11} strokeWidth={2.6} />
                </button>
              </div>
            ))}
            <datalist id="item-pack-units">
              {PACK_UNIT_SUGGESTIONS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            <Button variant="secondary" size="xs" onClick={() => set({ units: [...d.units, { unit: "", factor: "" }] })}>
              Add a pack size
            </Button>
            <span className="text-[11px] text-tx-faint">
              Receive in sacks, dose in {d.unit || "the base unit"} — the same balance either way.
            </span>
          </div>
        </>
      ) : null}

      <div className={`grid gap-2 ${editing ? "grid-cols-1" : "grid-cols-2"}`}>
        {!editing ? (
          <label className="flex min-w-0 flex-col gap-1">
            <span className="field-label">On hand now</span>
            <input className="input-sm font-mono" inputMode="decimal" value={d.quantity} onChange={(e) => set({ quantity: decimalInput(e.target.value, 3) })} placeholder="0" />
          </label>
        ) : null}
        <label className="flex min-w-0 flex-col gap-1">
          <span className="field-label">Low stock at (optional)</span>
          <input className="input-sm font-mono" inputMode="decimal" value={d.low} onChange={(e) => set({ low: decimalInput(e.target.value, 3) })} placeholder="—" />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="field-label">Where it sits (optional)</span>
        <input className="input-sm" value={d.location} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Gudang A, rack 2" />
      </label>

      {error && touched ? <span className="text-xs text-bad">{error}</span> : null}
      <div className="flex justify-end gap-1.5">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!!error || saving}
          onClick={() =>
            onSave({
              productId: describing && !editing ? null : editing ? item!.product_id : d.productId,
              newItem: describing
                ? {
                    name,
                    category: d.category,
                    base_unit: d.unit.trim(),
                    price_per_unit: d.price.trim() && Number.isFinite(num(d.price)) ? num(d.price) : null,
                    units: d.units.map((u) => ({ unit: u.unit.trim(), factor_to_base: num(u.factor) })),
                  }
                : null,
              quantity: num(d.quantity) > 0 ? num(d.quantity) : 0,
              low_stock_level: d.low.trim() && Number.isFinite(num(d.low)) ? num(d.low) : null,
              location_note: d.location.trim() || null,
            })
          }
        >
          {saving ? "Saving…" : editing ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
