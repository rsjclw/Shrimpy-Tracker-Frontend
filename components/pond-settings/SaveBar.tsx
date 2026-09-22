"use client";

import { Button } from "@/components/ui/Button";

export function SaveBar({
  hint,
  hasError,
  saving,
  onDiscard,
  onSave,
}: {
  hint: string;
  hasError: boolean;
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div className="sticky bottom-4 mt-2 flex items-center gap-2 rounded-2xl border border-accent bg-ink-750 py-2.5 pl-4 pr-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
      <div className="flex min-w-0 flex-grow flex-col gap-px">
        <span className="text-[13px] font-bold text-tx-strong">Unsaved changes</span>
        <span className={`truncate text-[11px] ${hasError ? "text-bad" : "text-tx-muted"}`}>{hint}</span>
      </div>
      <Button variant="secondary" size="md" onClick={onDiscard} disabled={saving}>
        Discard
      </Button>
      <Button variant="primary" size="md" onClick={onSave} disabled={saving || hasError}>
        Save
      </Button>
    </div>
  );
}
