import type { InventoryCategory, InventoryItem } from "@/lib/api";
import { num } from "@/lib/num";

export const CATEGORIES: { key: InventoryCategory; label: string }[] = [
  { key: "feed", label: "Feed" },
  { key: "supplements", label: "Supplements" },
  { key: "probiotics", label: "Probiotics" },
  { key: "lime_minerals", label: "Lime & minerals" },
  { key: "disinfectants", label: "Disinfectants" },
  { key: "medicine", label: "Medicine" },
  { key: "equipment", label: "Equipment & spares" },
  { key: "other", label: "Other" },
];

export const categoryLabel = (key: string) => CATEGORIES.find((c) => c.key === key)?.label ?? key;

/**
 * Stock is always counted in a real measurement unit, so amounts from different
 * warehouses and recipes add up. This list is closed and mirrors the backend.
 */
export const BASE_UNITS = ["kg", "g", "L", "mL", "pcs"] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

/**
 * How things are bought and talked about. Each one is defined per item with a
 * factor ("1 sack = 30 kg"), so a worker can receive in sacks and dose in kg.
 * Suggestions only - any word can be typed.
 */
export const PACK_UNIT_SUGGESTIONS = ["sack", "jerrycan", "bottle", "pack", "box", "drum", "carton", "bag"];

/**
 * Below zero: more was used than the balance knew about, so the receiving or the
 * counting is behind. Allowed on purpose - what was really applied is the fact
 * worth keeping - and a stock count is what clears it.
 */
export function isNegative(item: InventoryItem): boolean {
  return num(item.quantity) < 0;
}

export function isLow(item: InventoryItem): boolean {
  if (isNegative(item)) return true;
  return item.low_stock_level !== null && num(item.quantity) <= num(item.low_stock_level);
}

/** Up to 3 decimals, no trailing zeros, thousands separators: "1,240", "2.5". */
export function fmtQty(v: string | number): string {
  const n = typeof v === "number" ? v : num(v);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 3 }) : "—";
}

export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
