"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { CollapsibleSection } from "@/components/ui/Section";
import type { BlindFeedingTemplate, FeedType } from "@/lib/api";
import { fmtInt, fmtNum } from "@/lib/num";
import { type FeedPlanRow, has, num } from "./types";

function sortPlan(rows: FeedPlanRow[]): FeedPlanRow[] {
  return [...rows].sort((a, b) => num(a.cutoff) - num(b.cutoff));
}

function feedLabel(feedTypes: FeedType[], id: string): string {
  const f = feedTypes.find((x) => x.id === id);
  return f ? `${f.brand} · ${f.type}` : "—";
}

function feedCode(feedTypes: FeedType[], id: string): string {
  const f = feedTypes.find((x) => x.id === id);
  return f ? f.type : "—";
}

function sparkPoints(values: number[]): string {
  if (values.length < 2) return "";
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  return values.map((n, i) => `${(2 + (i / (values.length - 1)) * 92).toFixed(1)},${(31 - ((n - lo) / span) * 28).toFixed(1)}`).join(" ");
}

type PlanEdit = { feed_type_id: string; max: string; cutoff: string };

export function FeedingProgramSection({
  farmId,
  template,
  feedTypes,
  feedPlan,
  onChangePlan,
  open,
  onToggle,
  readOnly,
}: {
  farmId: string;
  template: BlindFeedingTemplate | null;
  feedTypes: FeedType[];
  feedPlan: FeedPlanRow[];
  onChangePlan: (next: FeedPlanRow[]) => void;
  open: boolean;
  onToggle: () => void;
  readOnly: boolean;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<PlanEdit | null>(null);

  const summary = `${template ? `${template.name.split(" · ")[0]} blind feeding` : "No blind feeding"} · ${feedPlan.length ? feedPlan.map((r) => feedCode(feedTypes, r.feed_type_id)).join(" → ") : "no feed plan"}`;

  function planError(pd: PlanEdit, editKey: string | null): string {
    if (!(num(pd.max) > 0)) return "Enter the max daily feed";
    if (!(num(pd.cutoff) > 0)) return "Enter the ABW cutoff";
    const clash = feedPlan.some((x) => x.key !== editKey && has(x.cutoff) && num(x.cutoff) === num(pd.cutoff));
    return clash ? `Another step already ends at ${num(pd.cutoff)} g` : "";
  }

  function startEdit(row: FeedPlanRow) {
    if (editingKey === row.key) {
      setEditingKey(null);
      setEditDraft(null);
    } else {
      setEditingKey(row.key);
      setEditDraft({ feed_type_id: row.feed_type_id, max: row.max, cutoff: row.cutoff });
    }
  }

  function startAdd() {
    const last = feedPlan[feedPlan.length - 1];
    setEditingKey("new");
    setEditDraft({ feed_type_id: last ? last.feed_type_id : feedTypes[0]?.id ?? "", max: "", cutoff: "" });
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditDraft(null);
  }

  function applyEdit() {
    if (!editDraft || !editingKey) return;
    if (planError(editDraft, editingKey === "new" ? null : editingKey)) return;
    const row = { feed_type_id: editDraft.feed_type_id, max: String(num(editDraft.max)), cutoff: num(editDraft.cutoff).toFixed(1) };
    let next: FeedPlanRow[];
    if (editingKey === "new") {
      next = [...feedPlan, { key: `fp-new-${Date.now()}`, ...row }];
    } else {
      next = feedPlan.map((x) => (x.key === editingKey ? { ...x, ...row } : x));
    }
    onChangePlan(sortPlan(next));
    cancelEdit();
  }

  function removeRow(key: string) {
    onChangePlan(feedPlan.filter((x) => x.key !== key));
    cancelEdit();
  }

  const errNow = editDraft ? planError(editDraft, editingKey === "new" ? null : editingKey) : "";

  return (
    <CollapsibleSection title="Feeding program" summary={summary} open={open} onToggle={onToggle}>
      <div className="flex flex-col gap-4 px-0.5 py-1">
        <div className="flex flex-col gap-2">
          <span className="field-label">Blind feeding template</span>
          {template ? (
            <div className="flex items-center gap-3 rounded-[10px] bg-ink-850 px-3 py-2.5">
              <svg width="96" height="34" viewBox="0 0 96 34" fill="none" className="shrink-0">
                <polyline points={sparkPoints(template.daily_feed_per_100k)} fill="none" stroke="#2DD4BF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="font-mono text-xs text-tx-muted">
                {template.duration_days} days · D1 {fmtNum(template.daily_feed_per_100k[0], 1)} → D{template.duration_days} {fmtNum(template.daily_feed_per_100k[template.daily_feed_per_100k.length - 1], 1)} kg / 100k
              </span>
            </div>
          ) : (
            <div className="rounded-[10px] bg-ink-850 px-3 py-2.5 text-xs text-tx-dim">No blind feeding template set for this cycle.</div>
          )}
          <span className="text-[11px] text-tx-faint">
            Set when the cycle starts. Templates are managed in{" "}
            <Link href={`/farms/${farmId}/settings`} className="underline">
              Farm settings
            </Link>
            .
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="field-label">Feed plan</span>
            <span className="text-[11px] text-tx-faint">Which feed to use as the shrimp grow, switching at each ABW cutoff.</span>
          </div>

          {feedPlan.map((row, i) => {
            const editing = editingKey === row.key;
            const prev = i === 0 ? null : feedPlan[i - 1].cutoff;
            return (
              <div key={row.key} className={`rounded-xl bg-ink-850 border ${editing ? "border-accent" : "border-line"}`}>
                <button
                  type="button"
                  aria-label={`Edit feed plan step ${i + 1}`}
                  onClick={() => !readOnly && startEdit(row)}
                  disabled={readOnly}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left disabled:cursor-default"
                >
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-line text-[11px] font-bold text-tx-soft">{i + 1}</span>
                  <div className="flex min-w-0 flex-grow flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-tx-strong">{feedLabel(feedTypes, row.feed_type_id)}</span>
                    <span className="font-mono text-xs text-tx-muted">
                      {prev ? `${fmtNum(prev, 1)} g` : "Start"} → {fmtNum(row.cutoff, 1)} g ABW
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="font-mono text-sm font-semibold text-tx-strong">{fmtInt(row.max)} kg</span>
                    <span className="text-[10px] text-tx-dim">max / day</span>
                  </div>
                </button>
                {editing && editDraft ? (
                  <div className="flex flex-col gap-2.5 px-3 pb-3">
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`pf-${row.key}`} className="field-label">
                        Feed type
                      </label>
                      <select
                        id={`pf-${row.key}`}
                        value={editDraft.feed_type_id}
                        onChange={(e) => setEditDraft({ ...editDraft, feed_type_id: e.target.value })}
                        className="input-sm"
                      >
                        {feedTypes.map((ft) => (
                          <option key={ft.id} value={ft.id}>
                            {ft.brand} · {ft.type}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        <label htmlFor={`pm-${row.key}`} className="field-label">
                          Max daily feed (kg)
                        </label>
                        <input
                          id={`pm-${row.key}`}
                          type="text"
                          inputMode="decimal"
                          value={editDraft.max}
                          onChange={(e) => setEditDraft({ ...editDraft, max: e.target.value.replace(/[^0-9.]/g, "") })}
                          className="input-xs font-mono"
                        />
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <label htmlFor={`pc-${row.key}`} className="field-label">
                          ABW cutoff (g)
                        </label>
                        <input
                          id={`pc-${row.key}`}
                          type="text"
                          inputMode="decimal"
                          value={editDraft.cutoff}
                          onChange={(e) => setEditDraft({ ...editDraft, cutoff: e.target.value.replace(/[^0-9.]/g, "") })}
                          className="input-xs font-mono"
                        />
                      </div>
                    </div>
                    {errNow ? <span className="text-xs text-bad">{errNow}</span> : null}
                    <div className="flex items-center gap-1.5">
                      <Button variant="danger" size="sm" onClick={() => removeRow(row.key)}>
                        Remove
                      </Button>
                      <span className="flex-grow" />
                      <Button variant="secondary" size="sm" onClick={cancelEdit}>
                        Cancel
                      </Button>
                      <Button variant="primary" size="sm" onClick={applyEdit} disabled={!!errNow}>
                        Done
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {feedPlan.length === 0 && editingKey !== "new" ? <span className="px-0.5 py-1 text-xs text-tx-dim">No feed plan yet.</span> : null}

          {editingKey === "new" && editDraft ? (
            <div className="flex flex-col gap-2.5 rounded-xl border border-accent bg-ink-850 p-3">
              <span className="text-sm font-bold text-tx-strong">New feed plan step</span>
              <div className="flex flex-col gap-1">
                <label htmlFor="np-feed" className="field-label">
                  Feed type
                </label>
                <select id="np-feed" value={editDraft.feed_type_id} onChange={(e) => setEditDraft({ ...editDraft, feed_type_id: e.target.value })} className="input-sm">
                  <option value="">Select feed</option>
                  {feedTypes.map((ft) => (
                    <option key={ft.id} value={ft.id}>
                      {ft.brand} · {ft.type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor="np-max" className="field-label">
                    Max daily feed (kg)
                  </label>
                  <input
                    id="np-max"
                    type="text"
                    inputMode="decimal"
                    value={editDraft.max}
                    onChange={(e) => setEditDraft({ ...editDraft, max: e.target.value.replace(/[^0-9.]/g, "") })}
                    className="input-xs font-mono"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor="np-cut" className="field-label">
                    ABW cutoff (g)
                  </label>
                  <input
                    id="np-cut"
                    type="text"
                    inputMode="decimal"
                    value={editDraft.cutoff}
                    onChange={(e) => setEditDraft({ ...editDraft, cutoff: e.target.value.replace(/[^0-9.]/g, "") })}
                    className="input-xs font-mono"
                  />
                </div>
              </div>
              {errNow ? <span className="text-xs text-bad">{errNow}</span> : null}
              <div className="flex justify-end gap-1.5">
                <Button variant="secondary" size="sm" onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={applyEdit} disabled={!!errNow || !editDraft.feed_type_id}>
                  Add step
                </Button>
              </div>
            </div>
          ) : null}

          {!readOnly && editingKey !== "new" ? (
            <Button variant="dashed" size="md" block onClick={startAdd}>
              <Icon name="plus" size={14} strokeWidth={2.4} />
              Add feed plan step
            </Button>
          ) : null}
        </div>
      </div>
    </CollapsibleSection>
  );
}
