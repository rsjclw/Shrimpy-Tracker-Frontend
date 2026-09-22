"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

export type ChartSeries = { color: string; points: { x: number; y: number }[] };

export type MiniChartData = {
  series: ChartSeries[];
  xMin: number;
  xMax: number;
  xStart: string;
  xEnd: string;
  /** Optional unit formatter for the y labels. */
  format?: (v: number) => string;
};

const W = 300;
const H = 84;
const PAD = 6;

/** Small sparkline-style chart. Stretches to the container width. */
export function MiniChart({ data, legend }: { data: MiniChartData; legend?: { label: string; color: string }[] }) {
  const all = data.series.flatMap((s) => s.points.map((p) => p.y)).filter(Number.isFinite);
  let lo = all.length ? Math.min(...all) : 0;
  let hi = all.length ? Math.max(...all) : 1;
  if (hi === lo) {
    hi += Math.abs(hi) * 0.1 || 1;
    lo -= Math.abs(lo) * 0.1 || 1;
  }
  const span = Math.max(1, data.xMax - data.xMin);
  const px = (x: number) => PAD + ((x - data.xMin) / span) * (W - PAD * 2);
  const py = (y: number) => H - PAD - ((y - lo) / (hi - lo)) * (H - PAD * 2);
  const fmt = data.format ?? ((v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2).replace(/\.?0+$/, "")));

  return (
    <div className="rounded-[10px] bg-ink-800 px-2.5 pb-1.5 pt-2.5">
      <div className="flex justify-between font-mono text-[9px] text-tx-ghost">
        <span>{all.length ? fmt(hi) : ""}</span>
        {legend?.length ? (
          <span className="flex flex-wrap justify-end gap-2.5">
            {legend.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1 text-tx-muted">
                <span className="h-[3px] w-2 rounded-sm" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </span>
        ) : null}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="block" aria-hidden>
        {all.length === 0 ? (
          <text x={W / 2} y={H / 2} textAnchor="middle" className="fill-tx-ghost text-[10px]">
            No readings yet
          </text>
        ) : null}
        {data.series.map((s, i) => (
          <g key={i}>
            {s.points.length > 1 ? (
              <polyline
                points={s.points.map((p) => `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {/* Zero-length round-capped lines keep dots circular in a stretched viewBox. */}
            {s.points.map((p, j) => (
              <line
                key={j}
                x1={px(p.x)}
                x2={px(p.x)}
                y1={py(p.y)}
                y2={py(p.y)}
                stroke={s.color}
                strokeWidth={6}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        ))}
      </svg>
      <div className="flex justify-between font-mono text-[9px] text-tx-ghost">
        <span>{all.length ? fmt(lo) : ""}</span>
        <span>
          {data.xStart} → {data.xEnd}
        </span>
      </div>
    </div>
  );
}

export type DetailLine = { label?: string; value: ReactNode; when?: ReactNode; color?: string };
export type DetailRow = { key: string; doc: string; date: string; value: ReactNode };

/** Expanded "details" card under a tile: headline values, mini chart, recent readings. */
export function DetailPanel({
  title,
  lines,
  chart,
  legend,
  rowsTitle = "Recent readings",
  rows,
  action,
  fullChartHref,
  onClose,
  loading,
}: {
  title: ReactNode;
  lines: DetailLine[];
  chart: MiniChartData;
  legend?: { label: string; color: string }[];
  rowsTitle?: string;
  rows: DetailRow[];
  action?: { label: string; onClick: () => void };
  fullChartHref?: string;
  onClose: () => void;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-ink-850 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-tx-strong">{title}</span>
        <button type="button" onClick={onClose} aria-label="Close details" className="flex h-7 w-7 items-center justify-center rounded-md text-tx-faint hover:text-tx">
          <Icon name="close" size={12} strokeWidth={2.2} />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {lines.map((ln, i) => (
          <div key={i} className="flex flex-wrap items-baseline gap-2">
            {ln.label ? (
              <span className="text-[10px] font-bold tracking-[0.06em]" style={{ color: ln.color }}>
                {ln.label}
              </span>
            ) : null}
            {ln.value !== "" ? <span className="font-mono text-base font-bold text-tx-strong">{ln.value}</span> : null}
            {ln.when ? <span className="text-[11px] text-tx-muted">{ln.when}</span> : null}
          </div>
        ))}
      </div>
      <MiniChart data={chart} legend={legend} />
      <div className="flex flex-col">
        <div className="pb-1 text-[10px] uppercase tracking-[0.06em] text-tx-faint">{rowsTitle}</div>
        {loading ? <div className="py-2 text-xs text-tx-faint">Loading…</div> : null}
        {!loading && rows.length === 0 ? <div className="border-t border-line-soft py-2 text-xs text-tx-faint">Nothing recorded in this window.</div> : null}
        {rows.map((rw) => (
          <div key={rw.key} className="flex items-baseline gap-2 border-t border-line-soft py-[5px]">
            <span className="w-12 shrink-0 font-mono text-[11px] font-semibold text-tx-muted">{rw.doc}</span>
            <span className="shrink-0 whitespace-nowrap text-[11px] text-tx-faint">{rw.date}</span>
            <span className="min-w-0 flex-grow text-right font-mono text-xs font-semibold text-tx">{rw.value}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        {action ? (
          <button type="button" onClick={action.onClick} className="rounded-lg border border-dashed border-line-dash px-2.5 py-1.5 text-xs font-bold text-tx">
            {action.label}
          </button>
        ) : (
          <span />
        )}
        {fullChartHref ? (
          <Link href={fullChartHref} className="px-0.5 py-1 text-xs font-bold text-accent">
            Full chart →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
