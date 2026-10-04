"use client";

import { useEffect, useState } from "react";

import { api, type FinishCheck } from "@/lib/api";
import { hhmm, niceDate } from "@/lib/dates";
import { fmtDec, fmtInt, fmtNum } from "@/lib/num";

/** The finish check for ending `cycleId` on `endDate`, refetched when the day changes. */
export function useFinishCheck(cycleId: string | null, endDate: string, enabled: boolean) {
  const [check, setCheck] = useState<FinishCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !cycleId) return;
    let live = true;
    setCheck(null);
    setError(null);
    api
      .getFinishCheck(cycleId, endDate)
      .then((c) => live && setCheck(c))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [cycleId, endDate, enabled]);
  return { check, error };
}

/**
 * What ending the cycle on the chosen day gives, and the end-of-cycle order mistakes that would make
 * its numbers wrong: the pond counts as empty after the last harvest of its last day, so that day
 * should be the final harvest day, the final ABW comes after every harvest, and feeds after the
 * final harvest count toward FCR.
 */
export function FinishPreview({
  check,
  error,
  kind,
  onUseDate,
}: {
  check: FinishCheck | null;
  error: string | null;
  kind: "finish" | "crash";
  onUseDate: (iso: string) => void;
}) {
  if (error) return <span className="text-xs text-bad">{error}</span>;
  if (!check) return <span className="text-xs text-tx-faint">Checking the last day…</span>;

  const last = check.last_harvest_date;
  const lastAt = last ? `${niceDate(last)}${check.last_harvest_time ? ` (${hhmm(check.last_harvest_time)})` : ""}` : "";
  const issues: { tone: "bad" | "warn"; text: string; use?: string }[] = [];
  if (last && check.harvests_after_end > 0) {
    issues.push({ tone: "bad", text: `The last harvest is on ${lastAt}; the cycle can't end before it.`, use: last });
  } else if (kind === "finish" && last && last !== check.end_date) {
    issues.push({ tone: "warn", text: `The final harvest was on ${lastAt}. Make that the last day so the pond counts as emptied by it.`, use: last });
  }
  if (check.harvested_count === 0) {
    issues.push({ tone: "warn", text: "No harvest is recorded, so the survival rate will be 0%. Log the harvests first if there were any." });
  }
  if (check.feeds_after_final_harvest.length) {
    const list = check.feeds_after_final_harvest.map((f) => `${hhmm(f.feed_time)} · ${fmtNum(f.amount_kg, 1)} kg`).join(", ");
    issues.push({ tone: "warn", text: `Feeds after the final harvest count toward FCR: ${list}. Delete them on the pond card if they weren't given.` });
  }
  if (check.sample_before_final_harvest) {
    issues.push({
      tone: "warn",
      text: `The last day's ABW sample (${hhmm(check.sample_before_final_harvest)}) is before the final harvest. Redo it with "Use harvest data" to close on the final ABW.`,
    });
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-ink-850 px-2.5 py-2">
      <span className="font-mono text-[11px] text-tx">
        Survival rate {check.survival_rate_pct !== null ? `${fmtDec(check.survival_rate_pct, 1)}%` : "—"} · {fmtInt(check.harvested_count)} harvested of {fmtInt(check.stocked)}
      </span>
      <span className="font-mono text-[11px] text-tx">
        Cycle FCR {check.cycle_fcr !== null ? fmtDec(check.cycle_fcr, 2) : "—"} · {fmtInt(check.feed_kg)} kg feed ÷ {fmtInt(check.harvested_kg)} kg harvested
      </span>
      {issues.map((i) => (
        <div key={i.text} className={`flex items-start justify-between gap-2 text-[11px] ${i.tone === "bad" ? "text-bad" : "text-warn"}`}>
          <span>{i.text}</span>
          {i.use ? (
            <button type="button" onClick={() => onUseDate(i.use!)} className="shrink-0 rounded-md border border-current px-2 py-0.5 font-bold">
              Use {niceDate(i.use)}
            </button>
          ) : null}
        </div>
      ))}
      {!issues.length ? <span className="text-[11px] text-good">Nothing to fix before finishing.</span> : null}
    </div>
  );
}

/** Ending before a harvest is refused by the backend too; block it up front. */
export function finishBlocked(check: FinishCheck | null): boolean {
  return !!check && check.harvests_after_end > 0;
}
