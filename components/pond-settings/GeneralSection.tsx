"use client";

import { CollapsibleSection } from "@/components/ui/Section";
import { fmtInt } from "@/lib/num";
import { fmt24 } from "@/lib/dates";
import { type GeneralDraft, generalErrors, num } from "./types";

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
  const area = num(draft.area);
  const summary = `${draft.name || "—"} · ${area > 0 ? `${fmtInt(area)} m²` : "— m²"} · first feed ${draft.firstFeed || "—"}`;
  const errors = generalErrors(draft);
  const error = errors[0] ?? "";

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
            <label htmlFor="g-area" className="field-label">
              Area (m²)
            </label>
            <input
              id="g-area"
              type="text"
              inputMode="numeric"
              value={draft.area}
              disabled={readOnly}
              onChange={(e) => onChange({ ...draft, area: e.target.value.replace(/[^0-9.]/g, "") })}
              className="input font-mono"
            />
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
        {error ? <span className="text-xs text-bad">{error}</span> : null}
      </div>
    </CollapsibleSection>
  );
}
