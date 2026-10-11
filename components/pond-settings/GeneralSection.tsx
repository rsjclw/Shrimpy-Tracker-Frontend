"use client";

import { CollapsibleSection } from "@/components/ui/Section";
import { decimalInput, fmtInt, fmtNum } from "@/lib/num";
import { fmt24 } from "@/lib/dates";
import { draftArea, type GeneralDraft, generalErrors, hasSize, num } from "./types";

export function GeneralSection({
  draft,
  gridName,
  open,
  onToggle,
  onChange,
  readOnly,
}: {
  draft: GeneralDraft;
  gridName: string;
  open: boolean;
  onToggle: () => void;
  onChange: (next: GeneralDraft) => void;
  readOnly: boolean;
}) {
  const area = draftArea(draft);
  const sized = hasSize(draft) && num(draft.width) > 0 && num(draft.length) > 0;
  const size = sized ? `${fmtNum(draft.width)} × ${fmtNum(draft.length)} m · ` : "";
  const summary = `${draft.name || "—"} · ${size}${area > 0 ? `${fmtInt(area)} m²` : "— m²"} · first feed ${draft.firstFeed || "—"}`;
  const errors = generalErrors(draft);
  const error = errors[0] ?? "";
  // A pond saved before width and length existed: its area stands until both are filled in.
  const unmeasured = !hasSize(draft) && num(draft.savedArea) > 0;

  return (
    <CollapsibleSection title="General" summary={summary} open={open} onToggle={onToggle}>
      <div className="flex flex-col gap-3 px-0.5 py-1">
        <div className="flex flex-col gap-1">
          <label htmlFor="g-name" className="field-label">
            Pond name
          </label>
          <input
            id="g-name"
            type="text"
            value={draft.name}
            disabled={readOnly}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            className="input"
          />
          <span className="text-[11px] text-tx-faint">In grid {gridName}</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="g-width" className="field-label">
              Width (m)
            </label>
            <input
              id="g-width"
              type="text"
              inputMode="decimal"
              value={draft.width}
              disabled={readOnly}
              onChange={(e) => onChange({ ...draft, width: decimalInput(e.target.value, 2) })}
              className="input font-mono"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="g-length" className="field-label">
              Length (m)
            </label>
            <input
              id="g-length"
              type="text"
              inputMode="decimal"
              value={draft.length}
              disabled={readOnly}
              onChange={(e) => onChange({ ...draft, length: decimalInput(e.target.value, 2) })}
              className="input font-mono"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="field-label">Area</span>
            <div className="input flex items-center border-dashed bg-transparent font-mono text-tx-muted" aria-live="polite">
              {area > 0 ? `${fmtNum(area)} m²` : "—"}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="g-feed" className="field-label">
              First feeding
            </label>
            <input
              id="g-feed"
              type="text"
              inputMode="numeric"
              maxLength={5}
              placeholder="HH:MM"
              value={draft.firstFeed}
              disabled={readOnly}
              onChange={(e) => onChange({ ...draft, firstFeed: fmt24(e.target.value) })}
              className="input font-mono"
            />
          </div>
        </div>
        {unmeasured ? (
          <span className="text-[11px] text-tx-faint">
            Saved as {fmtNum(draft.savedArea)} m² without a width and length. Enter both to replace it.
          </span>
        ) : null}
        {error ? <span className="text-xs text-bad">{error}</span> : null}
      </div>
    </CollapsibleSection>
  );
}
