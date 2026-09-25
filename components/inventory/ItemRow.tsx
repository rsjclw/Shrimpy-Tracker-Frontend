"use client";

import { useEffect, useState } from "react";

import { Banner, ConfirmStrip } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { api, type InventoryItem, type InventoryMovement, type MovementKind, type Product } from "@/lib/api";
import { decimalInput, num, rupiah } from "@/lib/num";
import { ItemForm } from "./ItemForm";
import { fmtQty, isLow, isNegative, timeAgo } from "./model";

const KIND_LABEL: Record<MovementKind, string> = { receive: "Received", use: "Used", count: "Stock count" };

/**
 * One stocked item. Tapping it opens Receive / Use (operators) and Stock count,
 * Edit, Delete (maintainers), plus the latest changes.
 */
export function ItemRow({
  item,
  open,
  onToggle,
  canAdd,
  canManage,
  product,
  lastStock,
  onChanged,
  onDeleted,
}: {
  item: InventoryItem;
  open: boolean;
  onToggle: () => void;
  canAdd: boolean;
  canManage: boolean;
  /** The product this row stocks, so its name and unit can be edited here too. */
  product?: Product;
  /** True when no other warehouse holds it, so deleting this removes it from the farm. */
  lastStock?: boolean;
  onChanged: (item: InventoryItem) => void;
  onDeleted: (id: string) => void;
}) {
  const [mode, setMode] = useState<MovementKind | "edit" | "delete" | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<InventoryMovement[] | null>(null);
  const low = isLow(item);
  const negative = isNegative(item);

  useEffect(() => {
    if (!open) {
      setMode(null);
      setError(null);
      return;
    }
    let cancelled = false;
    api
      .listInventoryMovements(item.id, 8)
      .then((h) => !cancelled && setHistory(h))
      .catch(() => !cancelled && setHistory([]));
    return () => {
      cancelled = true;
    };
    // Refetch after each change: the quantity moving is the signal.
  }, [open, item.id, item.quantity]);

  function start(m: typeof mode) {
    setMode(mode === m ? null : m);
    setAmount(m === "count" ? String(num(item.quantity)) : "");
    setNote("");
    setError(null);
  }

  async function run<T>(fn: () => Promise<T>, done: (v: T) => void) {
    setBusy(true);
    setError(null);
    try {
      done(await fn());
      setMode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  const amt = num(amount);
  const amountOk = mode === "count" ? amt >= 0 : amt > 0;
  const after = mode === "receive" ? num(item.quantity) + amt : mode === "use" ? num(item.quantity) - amt : amt;

  return (
    <div className={`rounded-[12px] border bg-ink-800 ${open ? "border-accent/60" : low ? "border-warn/40" : "border-line"}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
        <div className="flex min-w-0 flex-grow flex-col gap-px">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold text-tx-strong">{item.name}</span>
            {negative ? (
              <span className="shrink-0 rounded-full border border-bad px-1.5 text-[9px] font-bold tracking-[0.06em] text-bad">BELOW 0</span>
            ) : low ? (
              <span className="shrink-0 rounded-full border border-warn px-1.5 text-[9px] font-bold tracking-[0.06em] text-warn">LOW</span>
            ) : null}
          </span>
          <span className="flex min-w-0 gap-1.5 text-[11px] text-tx-faint">
            {product?.price_per_unit ? <span className="shrink-0 font-mono">{rupiah(product.price_per_unit)}/{item.unit}</span> : null}
            {item.location_note ? <span className="truncate">{item.location_note}</span> : null}
          </span>
        </div>
        <span className="shrink-0 whitespace-nowrap font-mono text-[15px] font-semibold text-tx-strong">
          {fmtQty(item.quantity)} <span className="text-[11px] font-medium text-tx-muted">{item.unit}</span>
        </span>
        <Icon name="chevron" size={14} strokeWidth={2.2} className={`shrink-0 text-tx-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="flex flex-col gap-2.5 px-3 pb-3">
          {item.low_stock_level !== null ? (
            <span className="text-[11px] text-tx-dim">
              Low stock at {fmtQty(item.low_stock_level)} {item.unit}
            </span>
          ) : null}

          {canAdd ? (
            <div className={`grid gap-1.5 ${canManage ? "grid-cols-3" : "grid-cols-2"}`}>
              <ActionButton on={mode === "receive"} tone="text-good" onClick={() => start("receive")}>
                Receive +
              </ActionButton>
              <ActionButton on={mode === "use"} tone="text-warn" onClick={() => start("use")}>
                Use −
              </ActionButton>
              {canManage ? (
                <ActionButton on={mode === "count"} tone="text-accent" onClick={() => start("count")}>
                  Stock count
                </ActionButton>
              ) : null}
            </div>
          ) : null}

          {mode === "receive" || mode === "use" || mode === "count" ? (
            <div className="flex flex-col gap-2 rounded-[10px] bg-ink-850 p-2.5">
              <div className="grid grid-cols-[1fr_1.4fr] gap-2">
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="field-label">{mode === "count" ? `Counted (${item.unit})` : `Amount (${item.unit})`}</span>
                  <input autoFocus className="input-sm font-mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(decimalInput(e.target.value, 3))} placeholder="0" />
                </label>
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="field-label">Note (optional)</span>
                  <input className="input-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "receive" ? "supplier, invoice…" : mode === "use" ? "pond, purpose…" : "monthly count"} />
                </label>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-tx-muted">
                  {amount && amountOk ? `${fmtQty(item.quantity)} → ${fmtQty(after)} ${item.unit}` : ""}
                </span>
                <button
                  type="button"
                  disabled={!amountOk || busy || (mode === "use" && after < 0)}
                  onClick={() =>
                    run(
                      () => api.addInventoryMovement(item.id, { kind: mode, amount: amt, note: note.trim() || null }),
                      onChanged,
                    )
                  }
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-accent-ink disabled:opacity-40"
                >
                  {busy ? "Saving…" : mode === "receive" ? "Add to stock" : mode === "use" ? "Take from stock" : "Set amount"}
                </button>
              </div>
              {mode === "use" && amount && after < 0 ? (
                <span className="text-xs text-warn">
                  Only {fmtQty(item.quantity)} {item.unit} on hand — this will go to {fmtQty(after)} {item.unit}. Do a stock count to correct it.
                </span>
              ) : null}
            </div>
          ) : null}

          {mode === "edit" ? (
            <ItemForm
              item={item}
              product={product}
              saving={busy}
              onCancel={() => setMode(null)}
              onSave={(draft) =>
                run(async () => {
                  // The name and unit belong to the item; the rest to this warehouse's row.
                  if (draft.newItem) await api.updateProduct(item.product_id, draft.newItem);
                  return api.updateInventoryItem(item.id, {
                    low_stock_level: draft.low_stock_level,
                    location_note: draft.location_note,
                  });
                }, onChanged)
              }
            />
          ) : null}

          {mode === "delete" ? (
            <ConfirmStrip
              message={
                lastStock
                  ? `Delete ${item.name}? No other warehouse holds it, so it goes from the farm along with its stock history.`
                  : `Stop stocking ${item.name} here? Its stock history here goes with it; other warehouses keep theirs.`
              }
              onCancel={() => setMode(null)}
              onConfirm={() => run(() => api.deleteInventoryItem(item.id), () => onDeleted(item.id))}
              busy={busy}
            />
          ) : null}

          {error ? <Banner onDismiss={() => setError(null)}>{error}</Banner> : null}

          <div className="flex flex-col">
            <div className="pb-1 text-[10px] uppercase tracking-[0.06em] text-tx-faint">Latest changes</div>
            {history === null ? <div className="py-1 text-xs text-tx-faint">Loading…</div> : null}
            {history?.length === 0 ? <div className="py-1 text-xs text-tx-faint">No changes yet.</div> : null}
            {history?.map((m) => {
              const d = num(m.delta);
              return (
                <div key={m.id} className="flex items-baseline gap-2 border-t border-line-soft py-[5px]">
                  <span className={`w-16 shrink-0 font-mono text-xs font-semibold ${d > 0 ? "text-good" : d < 0 ? "text-warn" : "text-tx-muted"}`}>
                    {d > 0 ? "+" : ""}
                    {fmtQty(d)}
                  </span>
                  <span className="min-w-0 flex-grow truncate text-[11px] text-tx-soft">
                    {KIND_LABEL[m.kind] ?? m.kind}
                    {m.note ? ` · ${m.note}` : ""}
                    <span className="text-tx-faint"> · {m.created_by?.split("@")[0] ?? "—"}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-tx-faint">{timeAgo(m.created_at)}</span>
                </div>
              );
            })}
          </div>

          {canManage && mode !== "edit" && mode !== "delete" ? (
            <div className="flex justify-end gap-1.5">
              <button type="button" onClick={() => start("delete")} className="rounded-md bg-ink-850 px-2.5 py-[5px] text-[11px] font-semibold text-bad">
                Delete
              </button>
              <button type="button" onClick={() => start("edit")} className="rounded-md bg-ink-850 px-2.5 py-[5px] text-[11px] font-semibold text-accent">
                Edit
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ActionButton({ on, tone, onClick, children }: { on: boolean; tone: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-lg border px-1.5 py-2 text-center text-xs font-semibold ${tone} ${on ? "border-accent bg-accent/[0.12]" : "border-line bg-ink-850"}`}
    >
      {children}
    </button>
  );
}
