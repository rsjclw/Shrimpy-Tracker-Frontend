import type { InventoryItem, Product } from "@/lib/api";
import { num } from "@/lib/num";

/**
 * Formula expansion, mirrored from the backend so the log form can show what a
 * dose will cost before anyone saves it.
 *
 * This is a preview only: the server expands again on save and is the authority
 * on whether the stock is actually there.
 */

const MAX_DEPTH = 10;

/** How many base units one `unit` of this product is. Null when the unit is unknown. */
export function factorToBase(product: Product, unit: string | null | undefined): number | null {
  const wanted = (unit ?? "").trim().toLowerCase();
  if (!wanted || wanted === product.base_unit.trim().toLowerCase()) return 1;
  const match = product.units.find((u) => u.unit.trim().toLowerCase() === wanted);
  return match ? num(match.factor_to_base) : null;
}

/** Every unit a product can be entered in, base first. */
export function unitsFor(product: Product): string[] {
  return [product.base_unit, ...product.units.map((u) => u.unit)];
}

export type ExpandedLine = { product: Product; amount: number };

/**
 * Turn (entry, amount in its base unit) lines into the products they draw on.
 * Untracked entries drop out; the same product reached twice is summed, so it
 * shows as one line.
 */
export function expandLines(products: Product[], lines: { productId: string; baseAmount: number }[]): ExpandedLine[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const totals = new Map<string, number>();

  function walk(productId: string, amount: number, path: string[], depth: number) {
    const product = byId.get(productId);
    if (!product || !product.tracked) return;
    if (product.kind !== "formula") {
      totals.set(productId, (totals.get(productId) ?? 0) + amount);
      return;
    }
    // A loop or runaway nesting is the server's error to report; just stop here.
    if (path.includes(productId) || depth >= MAX_DEPTH) return;
    for (const c of product.components) {
      walk(c.component_product_id, amount * num(c.quantity), [...path, productId], depth + 1);
    }
  }

  for (const line of lines) {
    if (line.baseAmount > 0) walk(line.productId, line.baseAmount, [], 0);
  }

  return [...totals.entries()]
    .map(([id, amount]) => ({ product: byId.get(id)!, amount }))
    .filter((l) => l.product)
    .sort((a, b) => a.product.name.localeCompare(b.product.name));
}

/** What a warehouse holds of each product, by product id. */
export function stockByProduct(items: InventoryItem[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) {
    if (item.product_id) out.set(item.product_id, num(item.quantity));
  }
  return out;
}
