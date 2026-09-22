"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { MONTHS_LONG, addDays, docFor, fromIso, isoForDoc, longDate, toIso } from "@/lib/dates";
import type { DayKind } from "./model";

const KIND_STYLE: Record<DayKind, { text: string; bg: string; border: string; solid: string }> = {
  today: { text: "text-accent", bg: "bg-accent/10", border: "border-accent/45", solid: "bg-accent" },
  past: { text: "text-tx-muted", bg: "bg-tx-muted/[0.07]", border: "border-tx-muted/45", solid: "bg-tx-muted" },
  future: { text: "text-violet", bg: "bg-violet/[0.07]", border: "border-violet/45", solid: "bg-violet" },
};

export function kindOf(viewDate: string, today: string): DayKind {
  return viewDate === today ? "today" : viewDate < today ? "past" : "future";
}

export function kindLabel(viewDate: string, today: string): string {
  const diff = docFor(today, viewDate) - 1;
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return diff < 0 ? `${-diff} days ago` : `In ${diff} days`;
}

/** Prev / DOC+date button (opens the month picker) / next, plus "Back to today". */
export function DayNavigator({
  startDate,
  viewDate,
  today,
  maxDate,
  onChange,
  dayNote,
}: {
  startDate: string;
  viewDate: string;
  today: string;
  maxDate: string;
  onChange: (iso: string) => void;
  dayNote: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [month, setMonth] = useState(() => viewDate.slice(0, 7));
  const [gotoDoc, setGotoDoc] = useState("");

  const kind = kindOf(viewDate, today);
  const style = KIND_STYLE[kind];
  const doc = docFor(startDate, viewDate);
  const maxDoc = docFor(startDate, maxDate);
  const todayDoc = docFor(startDate, today);

  function go(iso: string) {
    if (iso < startDate || iso > maxDate) return;
    onChange(iso);
    setMonth(iso.slice(0, 7));
  }

  function submitGoto() {
    const n = parseInt(gotoDoc, 10);
    if (!Number.isFinite(n) || n < 1 || n > maxDoc) return;
    go(isoForDoc(startDate, n));
    setGotoDoc("");
    setPickerOpen(false);
  }

  // Month grid, Monday first.
  const first = fromIso(`${month}-01`);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toIso(new Date(first.getFullYear(), first.getMonth(), d)));
  while (cells.length % 7) cells.push(null);
  const shiftMonth = (delta: number) => setMonth(toIso(new Date(first.getFullYear(), first.getMonth() + delta, 1)).slice(0, 7));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          onClick={() => go(addDays(viewDate, -1))}
          disabled={viewDate <= startDate}
          aria-label="Previous day"
          className="flex w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-ink-850 text-tx disabled:opacity-30"
        >
          <Icon name="back" size={16} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          onClick={() => {
            setPickerOpen((o) => !o);
            setMonth(viewDate.slice(0, 7));
          }}
          aria-expanded={pickerOpen}
          aria-label="Pick a day or DOC"
          className={`flex min-w-0 flex-grow items-center justify-between gap-2 rounded-xl border px-3 py-2 ${style.bg} ${style.border}`}
        >
          <div className="flex min-w-0 flex-col gap-px text-left">
            <span className="font-mono text-[17px] font-bold leading-tight text-tx-strong">DOC {doc}</span>
            <span className="whitespace-nowrap text-[11px] text-tx-muted">{longDate(viewDate)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`whitespace-nowrap rounded-full border px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.06em] ${style.text} border-current`}>
              {kindLabel(viewDate, today)}
            </span>
            <Icon name="calendar" size={16} strokeWidth={1.8} className="text-tx-muted" />
          </div>
        </button>
        <button
          type="button"
          onClick={() => go(addDays(viewDate, 1))}
          disabled={viewDate >= maxDate}
          aria-label="Next day"
          className="flex w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-ink-850 text-tx disabled:opacity-30"
        >
          <Icon name="forward" size={16} strokeWidth={2.2} />
        </button>
      </div>

      {pickerOpen ? (
        <div className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-ink-850 p-3">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="flex h-8 w-8 items-center justify-center rounded-lg text-tx-muted">
              <Icon name="back" size={14} strokeWidth={2.2} />
            </button>
            <span className="text-[13px] font-semibold text-tx-strong">
              {MONTHS_LONG[first.getMonth()]} {first.getFullYear()}
            </span>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="flex h-8 w-8 items-center justify-center rounded-lg text-tx-muted">
              <Icon name="forward" size={14} strokeWidth={2.2} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] uppercase tracking-[0.04em] text-tx-ghost">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-[3px]">
            {cells.map((iso, i) => {
              if (!iso) return <span key={`e${i}`} />;
              const n = docFor(startDate, iso);
              const valid = iso >= startDate && iso <= maxDate;
              const sel = iso === viewDate;
              const isToday = iso === today;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!valid}
                  onClick={() => {
                    go(iso);
                    setPickerOpen(false);
                  }}
                  aria-label={`${longDate(iso)}${valid ? `, DOC ${n}` : ""}`}
                  aria-current={sel ? "date" : undefined}
                  className={`flex min-h-9 flex-col items-center justify-center gap-px rounded-lg border py-[5px] ${sel ? `${style.solid} border-transparent` : isToday ? "border-accent" : "border-transparent"}`}
                >
                  <span className={`text-[13px] font-semibold ${sel ? "text-accent-ink" : !valid ? "text-tx-off" : n > todayDoc ? "text-tx-faint" : "text-tx"}`}>
                    {fromIso(iso).getDate()}
                  </span>
                  <span className={`font-mono text-[9px] ${sel ? "text-accent-ink" : isToday ? "text-accent" : n > todayDoc ? "text-tx-ghost" : "text-tx-faint"}`}>
                    {valid ? `D${n}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-end gap-2 border-t border-line pt-2.5">
            <div className="flex min-w-0 flex-grow flex-col gap-1">
              <label htmlFor={`goto-${startDate}`} className="text-[10px] uppercase tracking-[0.05em] text-tx-faint">
                Go to DOC
              </label>
              <input
                id={`goto-${startDate}`}
                inputMode="numeric"
                placeholder={`DOC 1–${maxDoc}`}
                value={gotoDoc}
                onChange={(e) => setGotoDoc(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && submitGoto()}
                className="w-full rounded-lg border border-line bg-ink-800 px-2.5 py-2 font-mono text-sm font-semibold text-tx-strong outline-none focus:border-accent"
              />
            </div>
            <button type="button" onClick={submitGoto} className="rounded-lg bg-accent px-4 py-[9px] text-[13px] font-bold text-accent-ink">
              Go
            </button>
          </div>
        </div>
      ) : null}

      {kind !== "today" ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-tx-muted">{dayNote}</span>
          <button
            type="button"
            onClick={() => go(today <= maxDate ? today : maxDate)}
            className="flex shrink-0 items-center gap-[5px] rounded-full bg-accent px-2.5 py-[5px] text-[11px] font-bold text-accent-ink"
          >
            <Icon name="reset" size={12} strokeWidth={2.4} />
            Back to today
          </button>
        </div>
      ) : null}
    </div>
  );
}
