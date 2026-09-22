"use client";

import { useState } from "react";
import { api, type BlindFeedingTemplate } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Banner, ConfirmStrip } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { CollapsibleSection } from "@/components/ui/Section";
import { decimalInput, num } from "@/lib/num";

type Draft = { name: string; days: string[] };
const emptyDays = 8;
const emptyDraft: Draft = { name: "", days: new Array(emptyDays).fill("") };

function parsePaste(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => t !== "")
    .map((t) => num(t))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

function draftError(draft: Draft): string {
  if (!draft.name.trim()) return "Give the program a name";
  if (!draft.days.length) return "Add at least one day";
  const bad = draft.days.findIndex((v) => !(num(v) >= 0));
  return bad !== -1 ? `Day ${bad + 1} needs a number` : "";
}

/** Sparkline points for a 96x34 viewBox, matching the mockup's formula. */
function sparkPoints(values: string[] | number[]): string {
  const nums = values.map((v) => (typeof v === "number" ? v : num(v))).filter((n) => Number.isFinite(n));
  if (nums.length < 2) return "";
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo || 1;
  return nums
    .map((n, i) => {
      const x = (2 + (i / (nums.length - 1)) * 92).toFixed(1);
      const y = (31 - ((n - lo) / span) * 28).toFixed(1);
      return `${x},${y}`;
    })
    .join(" ");
}

function summaryFor(days: string[] | number[]): string {
  const nums = days.map((v) => (typeof v === "number" ? v : num(v))).filter((n) => Number.isFinite(n));
  const base = `${days.length} days`;
  if (!nums.length) return base;
  const last = nums[nums.length - 1];
  return `${base} · D1 ${nums[0].toFixed(1)} → D${days.length} ${last.toFixed(1)} kg`;
}

export function BlindFeedingSection({
  farmId,
  templates,
  canManage,
  open,
  onToggle,
  onReload,
}: {
  farmId: string;
  templates: BlindFeedingTemplate[];
  canManage: boolean;
  open: boolean;
  onToggle: () => void;
  onReload: () => Promise<void>;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /** One value per line: pastes into a spreadsheet column, a chat, or another program's "Paste list". */
  async function copyList(t: BlindFeedingTemplate) {
    const text = t.daily_feed_per_100k.map((v) => String(Number(v))).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API is unavailable on plain-http origins; fall back to a hidden textarea.
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } finally {
        area.remove();
      }
    }
    setCopiedId(t.id);
    window.setTimeout(() => setCopiedId((id) => (id === t.id ? null : id)), 2000);
  }

  const summary = templates.length
    ? templates
        .map((p) => `${p.name.split(" · ")[0]} (${p.duration_days}d)`)
        .slice(0, 2)
        .join(" · ") + (templates.length > 2 ? ` +${templates.length - 2}` : "")
    : "No programs yet";

  function openNew() {
    setEditId("new");
    setDraft({ name: "", days: new Array(emptyDays).fill("") });
    setDeleteId(null);
    setPasteOpen(false);
    setPasteText("");
    setError(null);
  }

  function openRow(t: BlindFeedingTemplate) {
    if (editId === t.id) {
      closeEdit();
      return;
    }
    setEditId(t.id);
    setDraft({ name: t.name, days: t.daily_feed_per_100k.map((v) => String(v)) });
    setDeleteId(null);
    setPasteOpen(false);
    setPasteText("");
    setError(null);
  }

  function closeEdit() {
    setEditId(null);
    setDraft(emptyDraft);
    setDeleteId(null);
    setPasteOpen(false);
    setPasteText("");
    setError(null);
  }

  const rows: { id: string; name: string; days: string[]; canDelete: boolean }[] = templates.map((t) => ({
    id: t.id,
    name: editId === t.id ? draft.name || t.name : t.name,
    days: editId === t.id ? draft.days : t.daily_feed_per_100k.map((v) => String(v)),
    canDelete: true,
  }));
  if (editId === "new") {
    rows.push({ id: "new", name: draft.name || "New program", days: draft.days, canDelete: false });
  }

  const validationError = editId ? draftError(draft) : "";
  const touched = draft.name.trim() !== "" || draft.days.some((v) => v.trim() !== "");
  const pasted = parsePaste(pasteText);

  const d10 = draft.days.length ? Math.min(10, draft.days.length) : 0;
  const v10 = d10 ? num(draft.days[d10 - 1]) : NaN;
  const example = Number.isFinite(v10)
    ? `Example: a pond with 150,000 shrimp on D${d10} gets ${v10} × 1.5 = ${(Math.round(v10 * 1.5 * 100) / 100).toFixed(1)} kg that day.`
    : "Each value is scaled by the pond's stocked shrimp ÷ 100,000.";

  async function save() {
    if (!editId || validationError) return;
    setSaving(true);
    setError(null);
    try {
      const clean = {
        name: draft.name.trim(),
        daily_feed_per_100k: draft.days.map((v) => Math.round(num(v) * 100) / 100),
      };
      if (editId === "new") {
        await api.createBlindFeedingTemplate({ farm_id: farmId, ...clean });
      } else {
        await api.updateBlindFeedingTemplate(editId, clean);
      }
      await onReload();
      closeEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save program.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(id: string) {
    setSaving(true);
    setError(null);
    try {
      await api.deleteBlindFeedingTemplate(id);
      await onReload();
      closeEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete program.");
      setSaving(false);
    }
  }

  function setDay(i: number, value: string) {
    const days = draft.days.slice();
    days[i] = decimalInput(value, 2);
    setDraft({ ...draft, days });
  }

  return (
    <CollapsibleSection title="Blind feeding" count={templates.length} summary={summary} open={open} onToggle={onToggle}>
      <span className="text-xs text-tx-dim">Daily feed in kg per 100,000 shrimp, day by day.</span>

      {canManage && editId !== "new" ? (
        <Button variant="dashed" size="sm" className="self-start" onClick={openNew}>
          + New program
        </Button>
      ) : null}

      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          const editing = editId === row.id;
          const original = templates.find((t) => t.id === row.id);
          return (
            <div key={row.id} className={`rounded-[14px] border bg-ink-800 ${editing ? "border-accent" : "border-line"}`}>
              <div className="flex items-center">
                <button
                  type="button"
                  aria-label={`${canManage ? "Edit" : "View"} ${row.name}`}
                  onClick={() => (canManage && original ? openRow(original) : undefined)}
                  disabled={!canManage || !original}
                  className="flex min-w-0 flex-grow items-center gap-3 py-3 pl-3 text-left disabled:cursor-default"
                >
                  <div className="flex min-w-0 flex-grow flex-col gap-[3px]">
                    <span className="truncate text-[15px] font-semibold text-tx-strong">{row.name}</span>
                    <span className="font-mono text-xs text-tx-dim">{summaryFor(row.days)}</span>
                  </div>
                  <svg width="96" height="34" viewBox="0 0 96 34" fill="none" className="shrink-0">
                    <polyline points={sparkPoints(row.days)} fill="none" stroke="#2DD4BF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {original ? (
                  <button
                    type="button"
                    onClick={() => copyList(original)}
                    aria-label={`Copy ${row.name} as a list`}
                    title="Copy the daily values, one per line"
                    className={`mx-1.5 flex h-[38px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold ${copiedId === original.id ? "text-accent" : "text-tx-muted hover:text-tx-strong"}`}
                  >
                    <Icon name={copiedId === original.id ? "check" : "copy"} size={14} />
                    {copiedId === original.id ? "Copied" : "Copy list"}
                  </button>
                ) : null}
              </div>

              {editing ? (
                <div className="flex flex-col gap-3 px-3.5 pb-3.5">
                  <label className="flex flex-col gap-1">
                    <span className="field-label">Program name</span>
                    <input
                      className="input-sm bg-ink-850"
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  </label>

                  <div className="flex items-baseline justify-between">
                    <span className="field-label">kg / day per 100k shrimp</span>
                    <span className="font-mono text-[11px] text-tx-dim">{draft.days.length} days</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {draft.days.map((value, i) => {
                      const invalid = value.trim() === "" || !(num(value) >= 0);
                      return (
                        <label key={i} className="flex min-w-0 flex-col gap-0.5">
                          <span className="pl-0.5 font-mono text-[10px] text-tx-faint">D{i + 1}</span>
                          <input
                            id={`bf-${editId}-${i}`}
                            className={`input-xs bg-ink-850 text-right ${invalid ? "input-error" : ""}`}
                            inputMode="decimal"
                            value={value}
                            onChange={(e) => setDay(i, e.target.value)}
                          />
                        </label>
                      );
                    })}
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="dashed"
                      size="sm"
                      onClick={() => setDraft({ ...draft, days: [...draft.days, ""] })}
                    >
                      + Day
                    </Button>
                    <Button
                      variant="dashed"
                      size="sm"
                      disabled={draft.days.length <= 1}
                      onClick={() => setDraft({ ...draft, days: draft.days.slice(0, -1) })}
                    >
                      Remove last day
                    </Button>
                    <span className="flex-grow" />
                    <Button variant="secondary" size="sm" onClick={() => setPasteOpen(!pasteOpen)}>
                      {pasteOpen ? "Hide paste" : "Paste list"}
                    </Button>
                  </div>

                  {pasteOpen ? (
                    <div className="flex flex-col gap-1.5 rounded-[10px] border border-line bg-ink-850 p-2.5">
                      <label htmlFor={`bf-paste-${editId}`} className="text-xs text-tx-soft">
                        Paste numbers from a spreadsheet: one per day, separated by spaces, commas or new lines.
                      </label>
                      <textarea
                        id={`bf-paste-${editId}`}
                        rows={3}
                        value={pasteText}
                        onChange={(e) => setPasteText(e.target.value)}
                        placeholder="1.5 1.8 2.0 2.3 …"
                        className="w-full resize-y rounded-lg border border-line bg-ink-800 px-2.5 py-2 font-mono text-[13px] text-tx-strong outline-none focus:border-accent"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-tx-dim">{pasted.length ? `${pasted.length} days found` : "No numbers yet"}</span>
                        <Button
                          variant="primary"
                          size="xs"
                          disabled={!pasted.length}
                          onClick={() => {
                            setDraft({ ...draft, days: pasted.map((n) => String(n)) });
                            setPasteOpen(false);
                            setPasteText("");
                          }}
                        >
                          Replace all days
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-[10px] bg-ink-850 px-3 py-2.5 text-xs leading-normal text-tx-dim">{example}</div>

                  {validationError && touched ? <span className="text-xs text-bad">{validationError}</span> : null}
                  {error ? <Banner tone="bad">{error}</Banner> : null}
                  {deleteId === row.id ? (
                    <ConfirmStrip
                      message={`Delete "${row.name}"?`}
                      busy={saving}
                      onConfirm={() => doDelete(row.id)}
                      onCancel={() => setDeleteId(null)}
                    />
                  ) : null}
                  <div className="flex items-center gap-1.5">
                    {row.canDelete ? (
                      <Button variant="danger" size="sm" onClick={() => setDeleteId(row.id)}>
                        Delete
                      </Button>
                    ) : null}
                    <span className="flex-grow" />
                    <Button variant="secondary" size="sm" onClick={closeEdit}>
                      Cancel
                    </Button>
                    <Button variant="primary" size="sm" disabled={!!validationError || saving} onClick={save}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
