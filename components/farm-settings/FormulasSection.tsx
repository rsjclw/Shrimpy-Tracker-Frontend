"use client";

import { useState } from "react";

import { BASE_UNITS, CATEGORIES, categoryLabel } from "@/components/inventory/model";
import { Button } from "@/components/ui/Button";
import { Banner, ConfirmStrip } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { CollapsibleSection } from "@/components/ui/Section";
import { api, type InventoryCategory, type Product, type ProductInput, type ProductKind } from "@/lib/api";
import { decimalInput, fmtNum, has, num, rupiah } from "@/lib/num";

/** `query` is what was typed; `productId` is the item it resolved to, empty until it matches. */
type ComponentDraft = { productId: string; query: string; quantity: string };
type Draft = {
  name: string;
  category: InventoryCategory;
  kind: ProductKind;
  baseUnit: string;
  tracked: boolean;
  components: ComponentDraft[];
};

const emptyDraft = (): Draft => ({
  name: "",
  category: "probiotics",
  kind: "formula",
  baseUnit: "",
  tracked: true,
  components: [],
});

const toDraft = (p: Product): Draft => ({
  name: p.name,
  category: p.category,
  kind: p.kind,
  baseUnit: p.base_unit,
  tracked: p.tracked,
  components: p.components.map((c) => ({
    productId: c.component_product_id,
    query: c.component_name ?? "",
    quantity: String(num(c.quantity)),
  })),
});

/** What a formula is made of, as the summary line reads it. */
function recipeLine(p: Product): string {
  if (p.kind !== "formula") return "";
  // Something not counted draws on nothing, so it is not missing a recipe.
  if (!p.tracked) return "";
  if (!p.components.length) return "No recipe yet";
  return p.components
    .map((c) => `${fmtNum(c.quantity, 4)} ${c.component_base_unit ?? ""} ${c.component_name ?? "?"}`.trim())
    .join(" + ");
}

/**
 * The treatment formulas a farm can apply, and what each is made of.
 *
 * A formula is never stocked. Applying one draws on the products it is made of,
 * which is how a single treatment uses several inventory rows at once.
 */
export function FormulasSection({
  farmId,
  products,
  items,
  canManage,
  open,
  onToggle,
  onReload,
}: {
  farmId: string;
  /** Formulas only: what a worker applies. Products live on the inventory page. */
  products: Product[];
  /** The farm's products, offered as ingredients. */
  items: Product[];
  canManage: boolean;
  open: boolean;
  onToggle: () => void;
  onReload: () => Promise<void>;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = products.length
    ? products.map((p) => p.name).slice(0, 3).join(" · ") + (products.length > 3 ? ` +${products.length - 3}` : "")
    : "No formulas yet";

  function startNew() {
    setEditId("new");
    setDraft(emptyDraft());
    setDeleteId(null);
    setError(null);
  }

  function startEdit(p: Product) {
    if (editId === p.id) {
      setEditId(null);
      setDraft(null);
      return;
    }
    setEditId(p.id);
    setDraft(toDraft(p));
    setDeleteId(null);
    setError(null);
  }

  const set = (patch: Partial<Draft>) => setDraft((cur) => (cur ? { ...cur, ...patch } : cur));

  /** Ingredients: the farm's products, plus other formulas when one builds on another. */
  const ingredientChoices = [...items, ...products.filter((p) => p.id !== editId)];

  function validate(d: Draft): string {
    const name = d.name.trim();
    if (!name) return "Enter a name";
    // Products and formulas share one name list, so say which one is in the way.
    const clash = [...products, ...items].find(
      (p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== editId,
    );
    if (clash)
      return clash.kind === "product"
        ? `"${clash.name}" is already a product in your inventory. Give this formula the name of what it does, or rename the product to its brand.`
        : `There is already a formula called "${clash.name}".`;
    if (!d.baseUnit.trim()) return "Pick what it is dosed in";
    if (d.tracked) {
      if (!d.components.length) return "A formula needs at least one ingredient";
      const unknown = d.components.find((c) => !c.productId);
      if (unknown) return unknown.query.trim() ? `Nothing here is called "${unknown.query.trim()}"` : "Pick every ingredient";
      if (d.components.some((c) => !has(c.quantity) || num(c.quantity) <= 0))
        return "Every ingredient needs an amount above 0";
      const ids = d.components.map((c) => c.productId);
      if (new Set(ids).size !== ids.length) return "The same ingredient is listed twice";
    }
    return "";
  }

  async function save() {
    if (!draft || saving) return;
    const problem = validate(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const body: ProductInput = {
      name: draft.name.trim(),
      category: draft.category,
      kind: draft.kind,
      base_unit: draft.baseUnit.trim(),
      // A formula has no price of its own: its cost comes from what it is made of.
      price_per_unit: null,
      tracked: draft.tracked,
      active: true,
      notes: null,
      // Pack sizes are how goods are bought, which belongs to items, not to a mix.
      units: [],
      components: draft.components.map((c) => ({ component_product_id: c.productId, quantity: num(c.quantity) })),
    };
    try {
      if (editId === "new") await api.createProduct({ farm_id: farmId, ...body });
      else if (editId) await api.updateProduct(editId, body);
      setEditId(null);
      setDraft(null);
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the formula.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(id: string) {
    setSaving(true);
    setError(null);
    try {
      await api.deleteProduct(id);
      setDeleteId(null);
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the formula.");
    } finally {
      setSaving(false);
    }
  }

  const editor = draft ? (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-accent bg-ink-850 p-3.5">
      <span className="text-sm font-bold text-tx-strong">{editId === "new" ? "New formula" : draft.name || "Formula"}</span>

      <label className="flex flex-col gap-1">
        <span className="field-label">Name</span>
        <input className="input-sm" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Lactobacillus" />
      </label>

      <div className="grid grid-cols-[1.3fr_1fr] gap-2">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="field-label">Category</span>
          <select className="input-sm" value={draft.category} onChange={(e) => set({ category: e.target.value as InventoryCategory })}>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="field-label">Dosed in</span>
          <select className="input-sm" value={draft.baseUnit} onChange={(e) => set({ baseUnit: e.target.value })}>
            <option value="">Pick…</option>
            {BASE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </div>

      <span className="text-[11px] text-tx-faint">
        A formula is what goes in the pond or the feed, named for what it does. It is never stocked itself —
        applying it takes the products below out of the warehouse. A rebrand is one ingredient: Lactobacillus = 1 Biolacto.
      </span>

      <label className="flex items-start gap-2 rounded-lg bg-ink-800 px-2.5 py-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={!draft.tracked}
          onChange={(e) => set({ tracked: !e.target.checked })}
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-xs text-tx-soft">Not counted</span>
          <span className="text-[11px] text-tx-faint">
            For water and anything else worth naming in a recipe but never taken off a shelf. It can be an
            ingredient, and it never moves stock.
          </span>
        </span>
      </label>

      {/* Recipe */}
      {draft.tracked ? (
      <div className="flex flex-col gap-1.5">
        <span className="field-label">Made from, per 1 {draft.baseUnit || "base unit"}</span>
        {draft.components.map((c, i) => {
          const chosen = ingredientChoices.find((p) => p.id === c.productId);
          const setLine = (patch: Partial<ComponentDraft>) =>
            set({ components: draft.components.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          const unknown = c.query.trim() !== "" && !chosen;
          return (
            <div key={i} className="flex items-center gap-1.5">
              <input
                className={`input-xs min-w-0 flex-grow ${unknown ? "border-bad" : ""}`}
                list="ingredient-options"
                aria-label={`Ingredient ${i + 1}`}
                value={c.query}
                placeholder="Type to search…"
                onChange={(e) => {
                  // Names are unique per farm, so the typed name identifies one item.
                  const query = e.target.value;
                  const match = ingredientChoices.find(
                    (p) => p.name.trim().toLowerCase() === query.trim().toLowerCase(),
                  );
                  setLine({ query, productId: match?.id ?? "" });
                }}
              />
              <input
                className="input-xs w-20 text-right font-mono"
                inputMode="decimal"
                aria-label={`Amount ${i + 1}`}
                value={c.quantity}
                placeholder="0"
                onChange={(e) => setLine({ quantity: decimalInput(e.target.value, 4) })}
              />
              <span className="w-10 shrink-0 truncate text-[11px] text-tx-faint">{chosen?.base_unit ?? ""}</span>
              <button
                type="button"
                aria-label={`Remove ingredient ${i + 1}`}
                onClick={() => set({ components: draft.components.filter((_, j) => j !== i) })}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-tx-dim hover:text-tx-strong"
              >
                <Icon name="close" size={11} strokeWidth={2.6} />
              </button>
            </div>
          );
        })}
        <datalist id="ingredient-options">
          {ingredientChoices.map((p) => (
            <option key={p.id} value={p.name}>
              {p.base_unit}
            </option>
          ))}
        </datalist>
          <Button
            variant="secondary"
            size="xs"
            onClick={() => set({ components: [...draft.components, { productId: "", query: "", quantity: "" }] })}
        >
          Add an ingredient
        </Button>
      </div>
      ) : null}

      {error ? <span className="text-xs text-bad">{error}</span> : null}

      <div className="flex justify-end gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setEditId(null);
            setDraft(null);
            setError(null);
          }}
        >
          Cancel
        </Button>
        <Button variant="primary" size="sm" disabled={saving} onClick={save}>
          {saving ? "Saving…" : editId === "new" ? "Add formula" : "Save"}
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <CollapsibleSection title="Treatment formulas" count={products.length} summary={summary} open={open} onToggle={onToggle}>
      {/* Capped and scrolled: a farm with hundreds of formulas must not push
          everything below it off the screen. */}
      <div className="flex max-h-[22rem] flex-col gap-1.5 overflow-y-auto">
        {CATEGORIES.map((c) => {
          const inGroup = products.filter((p) => p.category === c.key);
          if (!inGroup.length) return null;
          // Stays open while something inside it is being edited, so the form
          // cannot end up hidden behind a collapsed header.
          const editingHere = inGroup.some((p) => p.id === editId);
          const groupOpen = !closedGroups[c.key] || editingHere;
          return (
            <div key={c.key} className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setClosedGroups((g) => ({ ...g, [c.key]: !g[c.key] }))}
                aria-expanded={groupOpen}
                className="flex items-center gap-2 px-0.5 py-1 text-left"
              >
                <Icon
                  name="chevron"
                  size={13}
                  strokeWidth={2.4}
                  className={`shrink-0 text-tx-faint transition-transform ${groupOpen ? "" : "-rotate-90"}`}
                />
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-tx-dim">{c.label}</span>
                <span className="font-mono text-[11px] text-tx-faint">{inGroup.length}</span>
              </button>
              {groupOpen ? inGroup.map((p) => (
              <div key={p.id} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 rounded-[12px] border border-line bg-ink-800 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => (canManage ? startEdit(p) : undefined)}
                    disabled={!canManage}
                    className="flex min-w-0 flex-grow flex-col items-start gap-0.5 text-left disabled:cursor-default"
                  >
                    <span className="flex w-full min-w-0 items-baseline gap-1.5 text-[13px] text-tx-strong">
                      <span className="truncate">{p.name}</span>
                      <span className="shrink-0 font-mono text-[11px] text-tx-faint">{p.base_unit}</span>
                      {!p.tracked ? <span className="shrink-0 text-[10px] uppercase tracking-wide text-tx-faint">not counted</span> : null}
                    </span>
                    <span className="w-full truncate text-[11px] text-tx-dim">
                      {categoryLabel(p.category)}
                      {p.cost_per_unit ? ` · ${rupiah(p.cost_per_unit)}/${p.base_unit}` : ""}
                      {recipeLine(p) ? ` · ${recipeLine(p)}` : ""}
                    </span>
                  </button>
                  {canManage ? (
                    <button
                      type="button"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => {
                        setDeleteId(p.id);
                        setEditId(null);
                        setDraft(null);
                      }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-tx-dim hover:text-tx-strong"
                    >
                      <Icon name="close" size={11} strokeWidth={2.6} />
                    </button>
                  ) : null}
                </div>
                {editId === p.id ? editor : null}
              </div>
              )) : null}
            </div>
          );
        })}
      </div>

      {editId === "new" ? editor : null}

      {deleteId !== null ? (
        <ConfirmStrip
          message={`Remove ${products.find((p) => p.id === deleteId)?.name}?`}
          busy={saving}
          onConfirm={() => doDelete(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      ) : null}

      {error && !draft ? <Banner tone="bad">{error}</Banner> : null}

      {canManage && editId !== "new" ? (
        <Button variant="primary" size="md" onClick={startNew}>
          Add a formula
        </Button>
      ) : null}

      <span className="text-[11px] text-tx-faint">
        Products are the goods you buy, kept on the inventory page. A formula says which of them go in the water,
        and logging a treatment with it takes them off the shelf automatically.
      </span>
    </CollapsibleSection>
  );
}
