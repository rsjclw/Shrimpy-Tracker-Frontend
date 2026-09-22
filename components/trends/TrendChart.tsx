"use client";

import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";

import { metricDef } from "@/lib/metrics";
import { SAFE_RANGES, outOfRange } from "@/lib/thresholds";

// Lane geometry in viewBox units. The SVG scales uniformly with the card width.
export const W = 390;
const PADL = 40;
const PADR = 36;
const PW = W - PADL - PADR;
const LANE_H = 120;
const TOP = 8;
const BOT = 112;

export type Pt = { x: number; v: number; future: boolean; date: string; doc: number; sampling: boolean; harvest: boolean };

export type ChartSeries = {
  key: string;
  metric: string;
  label: string; // "ABW · A1 C3"
  short: string; // for the readout
  color: string;
  dash: string;
  opacity: number;
  points: Pt[];
  /** False until this series' data has arrived. */
  loaded: boolean;
  /** Readout context for a cursor position: x -> "where" text. */
  whereAt: (x: number) => string;
  /** Whether x lies inside this series' cycle (for "before stocking" etc.). */
  coverage: (x: number) => "in" | "before" | "after" | "ahead";
};

export type Target = { metric: string; value: number; label: string };
export type ChartEvent = { x: number; kind: "S" | "H"; color: string; text: string };

export type Layers = { targets: boolean; safe: boolean; events: boolean; molt: boolean; gaps: boolean };

function niceTicks(lo: number, hi: number, target: number) {
  const range = hi - lo;
  if (!(range > 0)) return { step: 1, ticks: [lo] };
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) ticks.push(Math.round(v / step) * step);
  return { step, ticks };
}

function median(xs: number[]) {
  if (!xs.length) return 1;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function fmtValue(v: number) {
  const a = Math.abs(v);
  if (a >= 10000) return `${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`;
  if (a >= 100) return Math.round(v).toLocaleString("en-US");
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

type Lane = { key: string; series: ChartSeries[]; side: "left" | "right" };

/**
 * Stacked lanes, one per unit (axis group). With exactly two lanes, "overlay"
 * merges them onto left/right axes. A shared cursor scrubs every lane.
 */
export function TrendChart({
  series,
  from,
  to,
  axis,
  layers,
  targets,
  events,
  moltRanges,
  xLabel,
  overlay,
  onToggleOverlay,
}: {
  series: ChartSeries[];
  from: number;
  to: number;
  axis: "doc" | "date";
  layers: Layers;
  targets: Target[];
  events: ChartEvent[];
  moltRanges: [number, number][];
  xLabel: (x: number) => string;
  overlay: boolean;
  onToggleOverlay: () => void;
}) {
  const [cursor, setCursor] = useState<number | null>(null);
  // Where the pointer is inside the chart (CSS px), so the readout can float next to it.
  const [pointer, setPointer] = useState<{ x: number; y: number; touch: boolean } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const span = Math.max(1, to - from);
  const xpx = (x: number) => PADL + ((x - from) / span) * PW;

  const laneOrder: string[] = [];
  series.forEach((s) => {
    const k = metricDef(s.metric).axisGroup;
    if (!laneOrder.includes(k)) laneOrder.push(k);
  });
  const canOverlay = laneOrder.length === 2;
  const merged = overlay && canOverlay;
  const lanes: Lane[][] = merged
    ? [[{ key: laneOrder[0], series: series.filter((s) => metricDef(s.metric).axisGroup === laneOrder[0]), side: "left" }, { key: laneOrder[1], series: series.filter((s) => metricDef(s.metric).axisGroup === laneOrder[1]), side: "right" }]]
    : laneOrder.map((k) => [{ key: k, series: series.filter((s) => metricDef(s.metric).axisGroup === k), side: "left" as const }]);

  function scrub(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const scale = r.width / W;
    const ratio = (e.clientX - r.left - PADL * scale) / (PW * scale);
    setCursor(Math.round(from + Math.max(0, Math.min(1, ratio)) * span));
    setPointer({ x: e.clientX - r.left, y: e.clientY - r.top, touch: e.pointerType !== "mouse" });
  }

  const cx = cursor;

  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-line-soft bg-ink-850 pb-2 pt-2.5">
      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-[11px] text-tx-dim">
          {merged ? "Overlay · left and right axes" : lanes.length > 1 ? `${lanes.length} lanes · one per unit · x = ${axis === "doc" ? "DOC" : "date"}` : `x = ${axis === "doc" ? "DOC" : "date"}`}
        </span>
        {canOverlay ? (
          <button
            type="button"
            onClick={onToggleOverlay}
            aria-pressed={merged}
            className={`flex h-7 items-center rounded-lg border px-2.5 text-[11px] font-bold ${merged ? "border-accent text-accent" : "border-line-strong text-tx-soft"}`}
          >
            Overlay
          </button>
        ) : null}
      </div>

      <div ref={wrap} className="relative">
        {lanes.map((group) => {
          const title = group.map((l) => [...new Set(l.series.map((s) => metricDef(s.metric).label))].join(" · ")).join("  |  ");
          const unit = group.map((l) => metricDef(l.series[0].metric).unit || "—").join(" · ");
          return (
            <div key={group.map((l) => l.key).join("+")} className="flex flex-col">
              <div className="flex items-baseline justify-between pl-10 pr-3 pt-1.5">
                <span className="truncate text-[11px] font-semibold text-tx-soft">{title}</span>
                <span className="shrink-0 pl-2 font-mono text-[10px] text-tx-faint">{merged ? `← ${unit} →` : unit}</span>
              </div>
              <svg viewBox={`0 0 ${W} ${LANE_H}`} width="100%" className="block overflow-visible" aria-hidden>
                {layers.molt
                  ? moltRanges.map(([a, b], i) => (
                      <rect key={i} x={xpx(Math.max(from, a - 0.5))} y={6} width={Math.max(2, ((Math.min(to, b + 0.5) - Math.max(from, a - 0.5)) / span) * PW)} height={108} fill="#F5E6B8" opacity={0.06} />
                    ))
                  : null}
                {group.map((lane) => (
                  <LaneBody key={lane.key} lane={lane} from={from} to={to} xpx={xpx} layers={layers} targets={targets} cursor={cx} />
                ))}
                <line x1={PADL} x2={W - PADR} y1={BOT} y2={BOT} stroke="#4C5B56" strokeWidth={1} />
                {cx !== null ? <line x1={xpx(cx)} x2={xpx(cx)} y1={4} y2={116} stroke="#E7EEEC" strokeWidth={1} opacity={0.55} /> : null}
              </svg>
            </div>
          );
        })}

        {layers.events && events.length ? (
          <svg viewBox={`0 0 ${W} 38`} width="100%" className="block" aria-hidden>
            <line x1={PADL} x2={W - PADR} y1={10} y2={10} stroke="#1F2B27" strokeWidth={1} />
            {(() => {
              const perX = new Map<number, number>();
              return events
                .filter((e) => e.x >= from && e.x <= to)
                .map((e, i) => {
                  const n = perX.get(e.x) ?? 0;
                  perX.set(e.x, n + 1);
                  const y = 10 + n * 14;
                  return (
                    <g key={i}>
                      <circle cx={xpx(e.x)} cy={y} r={6.5} fill={e.color} opacity={0.18} />
                      <text x={xpx(e.x)} y={y + 3.2} textAnchor="middle" fontSize={9} fontWeight={700} fill={e.color} fontFamily="var(--font-plex-mono)">
                        {e.kind}
                      </text>
                    </g>
                  );
                });
            })()}
            {cx !== null ? <line x1={xpx(cx)} x2={xpx(cx)} y1={2} y2={36} stroke="#E7EEEC" strokeWidth={1} opacity={0.55} /> : null}
          </svg>
        ) : null}

        <svg viewBox={`0 0 ${W} 18`} width="100%" className="block" aria-hidden>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const x = Math.round(from + span * t);
            return (
              <text key={t} x={xpx(x)} y={13} textAnchor="middle" fontSize={10} fill="#C9D6D2" fontFamily="var(--font-plex-mono)">
                {xLabel(x)}
              </text>
            );
          })}
        </svg>

        <div
          aria-hidden
          onPointerDown={scrub}
          onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons ? scrub(e) : undefined)}
          onPointerLeave={() => setCursor(null)}
          onPointerEnter={(e) => e.pointerType === "mouse" && scrub(e)}
          onPointerUp={(e) => e.pointerType !== "mouse" && setCursor(null)}
          onPointerCancel={() => setCursor(null)}
          className="absolute inset-0 cursor-crosshair touch-pan-y"
        />

        {cx !== null && pointer && series.length ? (
          <Readout series={series} cx={cx} xLabel={xLabel} axis={axis} events={events.filter((e) => e.x === cx)} pointer={pointer} container={wrap.current} />
        ) : null}
      </div>
    </div>
  );
}

function LaneBody({
  lane,
  from,
  to,
  xpx,
  layers,
  targets,
  cursor,
}: {
  lane: Lane;
  from: number;
  to: number;
  xpx: (x: number) => number;
  layers: Layers;
  targets: Target[];
  cursor: number | null;
}) {
  const right = lane.side === "right";
  const metrics = [...new Set(lane.series.map((s) => s.metric))];
  const vis: number[] = [];
  lane.series.forEach((s) => s.points.forEach((p) => p.x >= from - 0.01 && p.x <= to + 0.01 && vis.push(p.v)));
  // A target far above the data (e.g. max size 100 g at DOC 30) would flatten the lane; show it only when it is in reach.
  const dataMax = vis.length ? Math.max(...vis) : 0;
  const laneTargets = layers.targets ? targets.filter((t) => metrics.includes(t.metric) && t.value <= Math.max(dataMax * 1.6, 0)) : [];
  laneTargets.forEach((t) => vis.push(t.value));
  // One band per lane, and only when every metric in it shares the same limit (yellow/green/black vibrio don't).
  const ranges = metrics.map((m) => JSON.stringify(SAFE_RANGES[m] ?? null));
  const safe = layers.safe && metrics.length && ranges.every((r) => r === ranges[0]) ? SAFE_RANGES[metrics[0]] : undefined;
  // Readings outside a safe range: stretch the scale to the nearest boundary so the gap is visible.
  if (safe && safe.kind === "range" && vis.length) {
    if (dataMax < safe.lo) vis.push(safe.lo);
    else if (Math.min(...vis) > safe.hi) vis.push(safe.hi);
  }
  let lo = vis.length ? Math.min(...vis) : 0;
  let hi = vis.length ? Math.max(...vis) : 1;
  if (hi === lo) {
    hi += Math.abs(hi) * 0.1 || 1;
    lo -= Math.abs(lo) * 0.1 || 1;
  }
  const pad = (hi - lo) * 0.08;
  const allPositive = vis.every((v) => v >= 0);
  lo -= pad;
  hi += pad;
  if (lo < 0 && allPositive) lo = 0;
  const ypx = (v: number) => BOT - ((v - lo) / (hi - lo)) * (BOT - TOP);
  const clampY = (v: number) => Math.max(TOP, Math.min(BOT, ypx(v)));
  const nt = niceTicks(lo, hi, 4);
  const tdec = nt.step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(nt.step)));
  const tick = (raw: number) => {
    const v = Math.abs(raw) < nt.step / 1000 ? 0 : raw;
    return Math.abs(v) >= 10000 ? `${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k` : v.toLocaleString("en-US", { minimumFractionDigits: tdec, maximumFractionDigits: tdec });
  };

  const axisX = right ? W - PADR : PADL;

  // Nothing measured in the window: no scale to draw, and a safe band would paint the whole lane.
  if (dataMax === 0 && !lane.series.some((s) => s.points.some((p) => p.x >= from - 0.01 && p.x <= to + 0.01))) {
    return (
      <g>
        <line x1={axisX} x2={axisX} y1={6} y2={BOT} stroke="#4C5B56" strokeWidth={1} />
        {!right ? (
          <text x={PADL + PW / 2} y={(TOP + BOT) / 2 + 4} textAnchor="middle" fontSize={11} fill="#6B7C77">
            {lane.series.every((x) => x.loaded) ? "No readings in this range" : "Loading…"}
          </text>
        ) : null}
      </g>
    );
  }

  return (
    <g>
      {safe && safe.kind === "min" && safe.lo > lo ? <rect x={PADL} y={clampY(safe.lo)} width={PW} height={BOT - clampY(safe.lo)} fill="#F87171" opacity={0.12} /> : null}
      {safe && safe.kind === "max" && safe.hi < hi ? <rect x={PADL} y={TOP} width={PW} height={clampY(safe.hi) - TOP} fill="#F87171" opacity={0.12} /> : null}
      {safe && safe.kind === "range" ? <rect x={PADL} y={clampY(safe.hi)} width={PW} height={clampY(safe.lo) - clampY(safe.hi)} fill="#4ADE80" opacity={0.08} /> : null}
      {nt.ticks.map((v) => (
        <g key={v}>
          {!right ? <line x1={PADL} x2={W - PADR} y1={ypx(v)} y2={ypx(v)} stroke="#1A2522" strokeWidth={1} /> : null}
          <line x1={right ? W - PADR : PADL - 4} x2={right ? W - PADR + 4 : PADL} y1={ypx(v)} y2={ypx(v)} stroke="#4C5B56" strokeWidth={1} />
          <text x={right ? W - PADR + 6 : PADL - 6} y={ypx(v) + 3} textAnchor={right ? "start" : "end"} fontSize={10} fill="#C9D6D2" fontFamily="var(--font-plex-mono)">
            {tick(v)}
          </text>
        </g>
      ))}
      <line x1={axisX} x2={axisX} y1={6} y2={BOT} stroke="#4C5B56" strokeWidth={1} />
      {laneTargets.map((t) => (
        <g key={t.metric}>
          <line x1={PADL} x2={W - PADR} y1={ypx(t.value)} y2={ypx(t.value)} stroke="#9AABA6" strokeWidth={1.2} strokeDasharray="4 4" />
          <text x={W - PADR - 2} y={ypx(t.value) - 4} textAnchor="end" fontSize={9} fill="#9AABA6" fontFamily="var(--font-plex-mono)">
            {t.label}
          </text>
        </g>
      ))}
      {lane.series.map((s) => {
        const pts = s.points.filter((p) => p.x >= from - 0.01 && p.x <= to + 0.01);
        const spacing = median(pts.slice(1).map((p, i) => p.x - pts[i].x));
        const segs: { d: string; future: boolean }[] = [];
        let cur: string[] = [];
        let curF: boolean | null = null;
        pts.forEach((p, i) => {
          const prev = pts[i - 1];
          const gap = prev && !layers.gaps && p.x - prev.x > Math.max(2, spacing * 2.5);
          const xy = `${xpx(p.x).toFixed(1)},${ypx(p.v).toFixed(1)}`;
          if (prev && (gap || p.future !== curF)) {
            if (!gap) cur.push(xy);
            if (cur.length > 1) segs.push({ d: cur.join(" "), future: !!curF });
            cur = gap ? [] : [`${xpx(prev.x).toFixed(1)},${ypx(prev.v).toFixed(1)}`];
          }
          curF = p.future;
          cur.push(xy);
        });
        if (cur.length > 1) segs.push({ d: cur.join(" "), future: !!curF });
        const showDots = spacing > 1 || pts.length <= 45;
        const hit = cursor !== null ? pts.find((p) => p.x === cursor) : undefined;
        return (
          <g key={s.key} opacity={s.opacity}>
            {segs.map((sg, i) => (
              <polyline key={i} points={sg.d} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={sg.future ? "3 3" : s.dash} strokeLinecap="round" strokeLinejoin="round" opacity={sg.future ? 0.6 : 1} />
            ))}
            {showDots ? pts.map((p) => <circle key={p.x} cx={xpx(p.x)} cy={ypx(p.v)} r={spacing > 1 ? 2.6 : 1.6} fill={s.color} opacity={p.future ? 0.5 : 1} />) : null}
            {hit ? <circle cx={xpx(hit.x)} cy={ypx(hit.v)} r={4} fill="#0E1614" stroke={s.color} strokeWidth={2} /> : null}
          </g>
        );
      })}
    </g>
  );
}

const TIP_W = 196;
// Gap between the readout's bottom edge and the pointer. A finger needs more room than a
// cursor: the readout sits well above the thumb so the hand doesn't cover it.
const GAP_MOUSE = 14;
const GAP_TOUCH = 56;

function Readout({
  series,
  cx,
  xLabel,
  axis,
  events,
  pointer,
  container,
}: {
  series: ChartSeries[];
  cx: number;
  xLabel: (x: number) => string;
  axis: "doc" | "date";
  events: ChartEvent[];
  pointer: { x: number; y: number; touch: boolean };
  container: HTMLDivElement | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    if (ref.current) setHeight(ref.current.offsetHeight);
  });

  // Date axis counts days from today; on the DOC axis the viewed cycle's own point says whether it is past today.
  const pastToday = axis === "date" ? cx > 0 : !!series[0]?.points.find((p) => p.x === cx)?.future;

  const width = container?.clientWidth ?? 390;
  const left = Math.max(4, Math.min(width - TIP_W - 4, pointer.x - TIP_W / 2));
  const gap = pointer.touch ? GAP_TOUCH : GAP_MOUSE;
  let top = pointer.y - gap - height;
  // Keep it on screen: if there is no room above (near the top of the viewport), drop it below the pointer.
  const viewportTop = container ? -container.getBoundingClientRect().top + 8 : -Infinity;
  if (top < viewportTop) top = pointer.y + (pointer.touch ? GAP_TOUCH : GAP_MOUSE + 8);

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      style={{ left, top, width: TIP_W, visibility: height ? "visible" : "hidden" }}
      className="pointer-events-none absolute z-20 flex flex-col gap-1.5 rounded-[10px] border border-line-dash bg-ink-850/95 px-2.5 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
    >
      <div className="flex flex-col gap-px">
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[13px] font-bold text-tx-strong">{axis === "doc" ? `DOC ${cx}` : xLabel(cx)}</span>
          {pastToday ? <span className="rounded-full border border-dashed border-line-dash px-1.5 text-[9px] uppercase tracking-[0.06em] text-tx-muted">after today</span> : null}
        </span>
        <span className="text-[10px] text-tx-muted">{series[0].whereAt(cx)}</span>
      </div>
      {series.map((s) => {
        const exact = s.points.find((p) => p.x === cx);
        const before = exact ?? [...s.points].reverse().find((p) => p.x < cx);
        const cov = s.coverage(cx);
        let value = "—";
        let sub = "";
        let color = "text-tx-strong";
        // Swatch matches the line at this point: dashed and faded once it is predicted or forecast.
        const future = cov === "in" && !!before?.future;
        if (cov === "in" && before) {
          const unit = metricDef(s.metric).unit;
          value = `${fmtValue(before.v)}${unit ? ` ${unit}` : ""}`;
          if (!exact) {
            sub = `last reading ${cx - before.x}d before`;
            color = "text-tx-muted";
          }
          if (before.future) sub = "predicted / forecast";
          if (!before.future && outOfRange(s.metric, before.v)) color = "text-bad";
        } else {
          sub = !s.loaded ? "loading…" : cov === "ahead" ? "not reached yet" : cov === "before" ? "before stocking" : cov === "after" ? "cycle had ended" : "no reading";
          color = "text-tx-faint";
        }
        return (
          <div key={s.key} className="flex items-start gap-1.5">
            <svg width="12" height="8" viewBox="0 0 12 8" className="mt-1 shrink-0">
              <line x1="1" x2="11" y1="4" y2="4" stroke={s.color} strokeWidth="2.5" strokeDasharray={future ? "2 2" : s.dash} strokeLinecap="round" opacity={future ? 0.6 : 1} />
            </svg>
            <div className="flex min-w-0 flex-grow flex-col">
              <span className="truncate text-[10px] text-tx-soft">{s.short}</span>
              {sub ? <span className="truncate text-[9px] text-tx-faint">{sub}</span> : null}
            </div>
            <span className={`shrink-0 whitespace-nowrap font-mono text-xs font-semibold ${color}`}>{value}</span>
          </div>
        );
      })}
      {events.length ? (
        <div className="flex flex-col gap-0.5 border-t border-line pt-[5px]">
          {events.map((e, i) => (
            <span key={i} className="text-[10px]" style={{ color: e.color }}>
              {e.text}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
