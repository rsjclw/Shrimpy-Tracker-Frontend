"use client";

import { Banner, UnitInput } from "@/components/ui/Field";
import { CollapsibleSection } from "@/components/ui/Section";
import { fmtInt } from "@/lib/num";
import { type CycleDraft, has, num, sizePcsPerKg } from "./types";

type FieldDef = {
  key: keyof Pick<
    CycleDraft,
    "finalDoc" | "initialFi" | "maxFi" | "fiInc" | "maxAdg" | "targetFcr" | "maxSize" | "stableCc" | "finalCc"
  >;
  label: string;
  unit: string;
  group: "Growth" | "Carrying capacity";
  optional?: boolean;
};

const FIELDS: FieldDef[] = [
  { key: "finalDoc", label: "Target final DOC", unit: "days", group: "Growth", optional: true },
  { key: "initialFi", label: "Initial feeding index", unit: "", group: "Growth" },
  { key: "maxFi", label: "Max feeding index", unit: "", group: "Growth" },
  { key: "fiInc", label: "Index increment", unit: "/ day", group: "Growth" },
  { key: "maxAdg", label: "Max ADG", unit: "g/day", group: "Growth" },
  { key: "targetFcr", label: "Target FCR", unit: "", group: "Growth" },
  { key: "maxSize", label: "Max shrimp size", unit: "g", group: "Growth" },
  { key: "stableCc", label: "Stable", unit: "kg/m²", group: "Carrying capacity" },
  { key: "finalCc", label: "Final", unit: "kg/m²", group: "Carrying capacity" },
];

export function TargetsSection({
  cycleName,
  draft,
  areaM2,
  open,
  onToggle,
  onChange,
  readOnly,
  usedDefaults,
}: {
  cycleName: string;
  draft: CycleDraft;
  areaM2: number;
  open: boolean;
  onToggle: () => void;
  onChange: (next: CycleDraft) => void;
  readOnly: boolean;
  usedDefaults: boolean;
}) {
  const summary = `DOC ${draft.finalDoc || "—"} · FCR ${draft.targetFcr || "—"} · ${draft.maxSize || "—"} g · ${draft.stableCc || "—"}–${draft.finalCc || "—"} kg/m²`;
  const groups: Record<string, FieldDef[]> = { Growth: [], "Carrying capacity": [] };
  FIELDS.forEach((f) => groups[f.group].push(f));

  function hintFor(f: FieldDef): string {
    const v = num(draft[f.key]);
    if (!(v > 0)) return "";
    if (f.group === "Carrying capacity" && areaM2 > 0) return `= ${fmtInt(v * areaM2)} kg in this pond`;
    if (f.key === "maxSize") {
      const size = sizePcsPerKg(v);
      return size ? `≈ size ${size} pcs/kg` : "";
    }
    return "";
  }

  return (
    <CollapsibleSection title={`${cycleName} targets`} summary={summary} open={open} onToggle={onToggle}>
      <div className="flex flex-col gap-4 px-0.5 py-1">
        {usedDefaults ? <Banner tone="info">No prediction settings yet — defaults shown; save to apply.</Banner> : null}
        {(["Growth", "Carrying capacity"] as const).map((groupName) => (
          <div key={groupName} className="flex flex-col gap-2">
            <span className="text-[10px] uppercase tracking-[0.08em] text-tx-dim">{groupName}</span>
            <div className="grid grid-cols-2 gap-2.5">
              {groups[groupName].map((f) => {
                const value = draft[f.key];
                const invalid = f.optional ? false : !has(value) || num(value) <= 0;
                return (
                  <div key={f.key} className="flex min-w-0 flex-col gap-1">
                    <label htmlFor={`t-${f.key}`} className="text-[11px] text-tx-soft">
                      {f.label}
                    </label>
                    <UnitInput
                      id={`t-${f.key}`}
                      unit={f.unit}
                      inputMode="decimal"
                      value={value}
                      disabled={readOnly}
                      invalid={invalid}
                      onChange={(e) => onChange({ ...draft, [f.key]: e.target.value.replace(/[^0-9.]/g, "") })}
                    />
                    <span className="min-h-[14px] font-mono text-[11px] text-accent">{hintFor(f)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
