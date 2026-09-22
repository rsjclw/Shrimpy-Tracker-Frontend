"use client";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { UnitInput } from "@/components/ui/Field";
import { CollapsibleSection } from "@/components/ui/Section";
import { fmtInt, rupiah } from "@/lib/num";
import { type CycleDraft, type PricePointRow, has, nextKey, num } from "./types";

type ScalarField = {
  key: keyof Pick<CycleDraft, "minHarvest" | "harvestFixedCost" | "plPrice" | "elecKwh" | "elecPrice" | "labor" | "probiotics" | "disinfection" | "liming">;
  label: string;
  unit: string;
  group: "Harvest" | "Costs";
};

const FIELDS: ScalarField[] = [
  { key: "minHarvest", label: "Min partial harvest", unit: "kg", group: "Harvest" },
  { key: "harvestFixedCost", label: "Fixed cost / event", unit: "Rp", group: "Harvest" },
  { key: "plPrice", label: "PL price / piece", unit: "Rp", group: "Costs" },
  { key: "elecKwh", label: "Electricity", unit: "kWh/day", group: "Costs" },
  { key: "elecPrice", label: "Electricity price", unit: "Rp/kWh", group: "Costs" },
  { key: "labor", label: "Labour", unit: "Rp/day", group: "Costs" },
  { key: "probiotics", label: "Probiotics", unit: "Rp/day", group: "Costs" },
  { key: "disinfection", label: "Disinfection", unit: "Rp/day", group: "Costs" },
  { key: "liming", label: "Liming", unit: "Rp/day", group: "Costs" },
];

function sortPoints(rows: PricePointRow[]): PricePointRow[] {
  return [...rows].sort((a, b) => num(b.count) - num(a.count));
}

export function HarvestSection({
  draft,
  open,
  onToggle,
  onChange,
  readOnly,
}: {
  draft: CycleDraft;
  open: boolean;
  onToggle: () => void;
  onChange: (next: CycleDraft) => void;
  readOnly: boolean;
}) {
  const summary = `${draft.pricePoints.length} price points · min harvest ${draft.minHarvest ? fmtInt(draft.minHarvest) : "—"} kg`;

  function updatePoint(key: string, field: "count" | "price", value: string) {
    onChange({ ...draft, pricePoints: draft.pricePoints.map((p) => (p.key === key ? { ...p, [field]: value.replace(/[^0-9.]/g, "") } : p)) });
  }

  function addPoint() {
    onChange({ ...draft, pricePoints: sortPoints([...draft.pricePoints, { key: nextKey("pp"), count: "", price: "" }]) });
  }

  function removePoint(key: string) {
    onChange({ ...draft, pricePoints: draft.pricePoints.filter((p) => p.key !== key) });
  }

  function reorderPoints() {
    onChange({ ...draft, pricePoints: sortPoints(draft.pricePoints) });
  }

  return (
    <CollapsibleSection title="Harvest & prices" summary={summary} open={open} onToggle={onToggle}>
      <div className="flex flex-col gap-4 px-0.5 py-1">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.08em] text-tx-dim">Harvest</span>
          <div className="grid grid-cols-2 gap-2.5">
            {FIELDS.filter((f) => f.group === "Harvest").map((f) => (
              <ScalarInput key={f.key} field={f} draft={draft} onChange={onChange} readOnly={readOnly} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.08em] text-tx-dim">Harvest price points</span>
            <span className="text-[11px] text-tx-faint">Count size (pcs/kg) → price paid per kg, largest shrimp first.</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {draft.pricePoints.map((p) => {
              const invalid = !has(p.count) || num(p.count) <= 0 || !has(p.price) || num(p.price) <= 0;
              return (
                <div key={p.key} className="flex items-center gap-2">
                  <div className="flex-1">
                    <UnitInput
                      unit="pcs/kg"
                      inputMode="decimal"
                      value={p.count}
                      disabled={readOnly}
                      invalid={invalid}
                      onChange={(e) => updatePoint(p.key, "count", e.target.value)}
                      onBlur={reorderPoints}
                      className="input-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <UnitInput
                      unit="Rp/kg"
                      inputMode="decimal"
                      value={p.price}
                      disabled={readOnly}
                      invalid={invalid}
                      onChange={(e) => updatePoint(p.key, "price", e.target.value)}
                      className="input-sm"
                    />
                  </div>
                  {!readOnly ? (
                    <button type="button" aria-label="Remove price point" onClick={() => removePoint(p.key)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-tx-dim hover:text-bad">
                      <Icon name="trash" size={15} strokeWidth={2} />
                    </button>
                  ) : null}
                </div>
              );
            })}
            {draft.pricePoints.length === 0 ? <span className="text-xs text-tx-dim">No price points yet.</span> : null}
          </div>
          {!readOnly ? (
            <Button variant="dashed" size="md" block onClick={addPoint}>
              <Icon name="plus" size={14} strokeWidth={2.4} />
              Add price point
            </Button>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.08em] text-tx-dim">Costs</span>
          <div className="grid grid-cols-2 gap-2.5">
            {FIELDS.filter((f) => f.group === "Costs").map((f) => (
              <ScalarInput key={f.key} field={f} draft={draft} onChange={onChange} readOnly={readOnly} />
            ))}
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}

function ScalarInput({
  field,
  draft,
  onChange,
  readOnly,
}: {
  field: ScalarField;
  draft: CycleDraft;
  onChange: (next: CycleDraft) => void;
  readOnly: boolean;
}) {
  const value = draft[field.key];
  const invalid = !has(value) || num(value) < 0;
  const hint = field.unit.startsWith("Rp") && has(value) && num(value) > 0 ? rupiah(value) : "";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={`h-${field.key}`} className="text-[11px] text-tx-soft">
        {field.label}
      </label>
      <UnitInput
        id={`h-${field.key}`}
        unit={field.unit}
        inputMode="decimal"
        value={value}
        disabled={readOnly}
        invalid={invalid}
        onChange={(e) => onChange({ ...draft, [field.key]: e.target.value.replace(/[^0-9.]/g, "") })}
      />
      <span className="min-h-[14px] font-mono text-[11px] text-accent">{hint}</span>
    </div>
  );
}
