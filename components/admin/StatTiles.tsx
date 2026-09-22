"use client";

export type StatTile = {
  key: string;
  value: number | string;
  label: string;
  /** Tailwind text-* class for the value. */
  valueClass?: string;
  /** When set, the tile is a toggleable filter button. */
  onToggle?: () => void;
  active?: boolean;
};

/** The 4-up stat tile row at the top of a list column; some tiles double as filters. */
export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {tiles.map((t) => {
        const interactive = !!t.onToggle;
        return (
          <button
            key={t.key}
            type="button"
            disabled={!interactive}
            aria-pressed={interactive ? !!t.active : undefined}
            onClick={t.onToggle}
            className={`flex flex-col gap-1 rounded-xl border px-4 py-3.5 text-left ${
              interactive ? "cursor-pointer" : "cursor-default"
            } ${t.active ? "border-accent bg-accent/[0.08]" : "border-line-soft bg-ink-850"}`}
          >
            <span className={`font-mono text-2xl font-bold ${t.valueClass ?? "text-tx-strong"}`}>{t.value}</span>
            <span className="text-xs text-tx-dim">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
