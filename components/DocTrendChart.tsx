"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMetricValue } from "@/lib/metrics";

export type ChartSeries = {
  id: string;
  cycleLabel: string;
  metricLabel: string;
  unit: string;
  axisGroup: string;
  color: string;
  dash?: string;
  /** doc -> value, already filtered to the points that actually have data */
  values: Map<number, number>;
  /**
   * First DOC that is a prediction rather than a recorded value, or null when
   * nothing predicted is being shown. Everything from here on is drawn faded.
   */
  futureFromDoc: number | null;
};

const FUTURE_OPACITY = 0.32;

type Props = {
  series: ChartSeries[];
  docFrom: number;
  docTo: number;
  smoothWindow: number;
  normalize: boolean;
  connectNulls: boolean;
  hidden: Set<string>;
  onToggleSeries: (id: string) => void;
};

type RawMap = Record<string, number | null>;
type ChartRow = { doc: number; __raw: RawMap } & Record<string, number | null | RawMap>;

const NORM_AXIS = "__norm";

/**
 * Centered moving average across DOC. Windows are built from the points that
 * exist, so weekly-sampled parameters keep their shape instead of collapsing
 * toward zero on the days in between.
 */
function smoothValues(values: Map<number, number>, window: number): Map<number, number> {
  if (window <= 1) return values;

  const half = Math.floor(window / 2);
  const smoothed = new Map<number, number>();

  for (const doc of values.keys()) {
    let sum = 0;
    let count = 0;
    for (let offset = -half; offset <= half; offset += 1) {
      const neighbour = values.get(doc + offset);
      if (neighbour != null) {
        sum += neighbour;
        count += 1;
      }
    }
    if (count) smoothed.set(doc, sum / count);
  }

  return smoothed;
}

function normalizeValues(values: Map<number, number>): Map<number, number> {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values.values()) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return values;

  const span = max - min;
  const normalized = new Map<number, number>();
  for (const [doc, value] of values) {
    normalized.set(doc, span === 0 ? 50 : ((value - min) / span) * 100);
  }
  return normalized;
}

type TooltipEntry = { dataKey?: string | number; payload?: ChartRow };
type ChartTooltipProps = {
  active?: boolean;
  label?: number;
  payload?: TooltipEntry[];
  series: ChartSeries[];
};

function ChartTooltip({ active, label, payload, series }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const raw = payload[0]?.payload?.__raw ?? {};
  const rows = series
    .map((s) => ({ series: s, value: raw[s.id] ?? null }))
    .filter((row) => row.value != null)
    .sort((a, b) => (b.value as number) - (a.value as number));

  if (!rows.length) return null;

  return (
    <div className="rounded border border-slate-200 bg-white px-3 py-2 shadow text-sm max-w-xs">
      <div className="font-medium text-slate-900 mb-1">DOC {label}</div>
      <div className="space-y-0.5">
        {rows.map(({ series: s, value }) => (
          <div key={s.id} className="flex items-baseline gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: s.color }}
            />
            <span className="text-xs text-slate-500 truncate">{s.cycleLabel}</span>
            <span className="text-xs text-slate-700">{s.metricLabel}</span>
            <span className="ml-auto font-semibold tabular-nums">
              {formatMetricValue(value as number, s.unit)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DocTrendChart({
  series,
  docFrom,
  docTo,
  smoothWindow,
  normalize,
  connectNulls,
  hidden,
  onToggleSeries,
}: Props) {
  const visible = useMemo(() => series.filter((s) => !hidden.has(s.id)), [series, hidden]);

  const prepared = useMemo(
    () =>
      visible.map((s) => {
        const smoothed = smoothValues(s.values, smoothWindow);
        const plotted = normalize ? normalizeValues(smoothed) : smoothed;

        // Split into a recorded segment and a predicted segment so each can be
        // drawn with its own opacity. The last recorded point is repeated into
        // the predicted map so the two segments join without a visible gap.
        const past = new Map<number, number>();
        const future = new Map<number, number>();
        const boundary = s.futureFromDoc;
        let lastPastDoc: number | null = null;

        for (const doc of Array.from(plotted.keys()).sort((a, b) => a - b)) {
          const value = plotted.get(doc)!;
          if (boundary == null || doc < boundary) {
            past.set(doc, value);
            lastPastDoc = doc;
          } else {
            future.set(doc, value);
          }
        }
        if (boundary != null && lastPastDoc != null) {
          future.set(lastPastDoc, plotted.get(lastPastDoc)!);
        }

        return { series: s, plotted, past, future, raw: s.values };
      }),
    [visible, smoothWindow, normalize],
  );

  // At most two axes can be shown without the chart turning into a ruler
  // museum: the first two axis groups get the left and right scales, anything
  // beyond that shares the left one (or use normalize).
  const axisGroups = useMemo(
    () => Array.from(new Set(visible.map((s) => s.axisGroup))),
    [visible],
  );
  const leftGroup = normalize ? NORM_AXIS : axisGroups[0];
  const rightGroup = normalize ? undefined : axisGroups[1];

  const axisIdFor = (axisGroup: string) => {
    if (normalize) return NORM_AXIS;
    return axisGroup === rightGroup ? rightGroup : leftGroup;
  };

  const axisUnit = (axisGroup?: string) =>
    visible.find((s) => s.axisGroup === axisGroup)?.unit ?? "";

  const data = useMemo(() => {
    const rows: ChartRow[] = [];
    for (let doc = docFrom; doc <= docTo; doc += 1) {
      const raw: RawMap = {};
      const row: ChartRow = { doc, __raw: raw };
      for (const { series: s, past, future, raw: rawValues } of prepared) {
        row[s.id] = past.get(doc) ?? null;
        row[`${s.id}__fut`] = future.get(doc) ?? null;
        raw[s.id] = rawValues.get(doc) ?? null;
      }
      rows.push(row);
    }
    return rows;
  }, [prepared, docFrom, docTo]);

  // One vertical marker per cycle at its prediction boundary. Cycles share a
  // boundary across their metrics, so dedupe by (colour, doc) to avoid drawing
  // the same line several times.
  const predictionMarkers = useMemo(() => {
    const seen = new Map<string, { doc: number; color: string }>();
    for (const s of visible) {
      if (s.futureFromDoc == null) continue;
      seen.set(`${s.color}:${s.futureFromDoc}`, { doc: s.futureFromDoc, color: s.color });
    }
    return Array.from(seen.values());
  }, [visible]);

  const hasPredicted = predictionMarkers.length > 0;

  const formatAxis = (value: number) => (normalize ? `${Math.round(value)}%` : formatMetricValue(value));

  if (!series.length) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-sm text-slate-500">
        Pick at least one cycle and one parameter to plot.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-3 sm:p-4">
      <div style={{ width: "100%", height: 420 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 24, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="doc"
              type="number"
              domain={[docFrom, docTo]}
              allowDecimals={false}
              tick={{ fontSize: 12 }}
              tickCount={10}
              label={{ value: "DOC", position: "insideBottom", offset: -12, fontSize: 12 }}
            />
            {leftGroup ? (
              <YAxis
                yAxisId={leftGroup}
                orientation="left"
                tick={{ fontSize: 12 }}
                width={56}
                tickFormatter={formatAxis}
                domain={normalize ? [0, 100] : ["auto", "auto"]}
                label={
                  normalize
                    ? undefined
                    : { value: axisUnit(leftGroup), angle: -90, position: "insideLeft", fontSize: 11 }
                }
              />
            ) : null}
            {rightGroup ? (
              <YAxis
                yAxisId={rightGroup}
                orientation="right"
                tick={{ fontSize: 12 }}
                width={56}
                tickFormatter={formatAxis}
                label={{
                  value: axisUnit(rightGroup),
                  angle: 90,
                  position: "insideRight",
                  fontSize: 11,
                }}
              />
            ) : null}
            <Tooltip content={<ChartTooltip series={visible} />} />
            {predictionMarkers.map((marker) => (
              <ReferenceLine
                key={`pred-${marker.color}-${marker.doc}`}
                yAxisId={leftGroup}
                x={marker.doc}
                stroke={marker.color}
                strokeOpacity={0.5}
                strokeDasharray="2 4"
                strokeWidth={1}
                ifOverflow="hidden"
              />
            ))}
            {prepared.flatMap(({ series: s, past, future }) => {
              const lines = [
                <Line
                  key={s.id}
                  yAxisId={axisIdFor(s.axisGroup)}
                  dataKey={s.id}
                  name={`${s.cycleLabel} - ${s.metricLabel}`}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.dash}
                  dot={past.size <= 45 ? { r: 2.5, strokeWidth: 0, fill: s.color } : false}
                  activeDot={{ r: 4 }}
                  connectNulls={connectNulls}
                  isAnimationActive={false}
                />,
              ];
              if (future.size > 1) {
                lines.push(
                  <Line
                    key={`${s.id}__fut`}
                    yAxisId={axisIdFor(s.axisGroup)}
                    dataKey={`${s.id}__fut`}
                    name={`${s.cycleLabel} - ${s.metricLabel} (predicted)`}
                    stroke={s.color}
                    strokeOpacity={FUTURE_OPACITY}
                    strokeWidth={2}
                    strokeDasharray={s.dash}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls={connectNulls}
                    isAnimationActive={false}
                  />,
                );
              }
              return lines;
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {series.map((s) => {
          const isHidden = hidden.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => onToggleSeries(s.id)}
              title={isHidden ? "Show series" : "Hide series"}
              className={`flex items-center gap-1.5 text-xs ${
                isHidden ? "text-slate-400" : "text-slate-700"
              }`}
            >
              <svg width="18" height="8" className="shrink-0">
                <line
                  x1="0"
                  y1="4"
                  x2="18"
                  y2="4"
                  stroke={isHidden ? "#cbd5e1" : s.color}
                  strokeWidth="2.5"
                  strokeDasharray={s.dash}
                />
              </svg>
              <span className={isHidden ? "line-through" : ""}>
                {s.cycleLabel} - {s.metricLabel}
              </span>
              {s.values.size === 0 ? (
                <span className="text-slate-400">(no data)</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {hasPredicted ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          <svg width="34" height="8" className="shrink-0">
            <line x1="0" y1="4" x2="15" y2="4" stroke="#64748b" strokeWidth="2" />
            <line
              x1="19"
              y1="4"
              x2="34"
              y2="4"
              stroke="#64748b"
              strokeWidth="2"
              strokeOpacity={FUTURE_OPACITY}
            />
          </svg>
          <span>solid = recorded, faded = predicted (dashed line marks where each cycle&apos;s prediction starts)</span>
        </div>
      ) : null}

      {axisGroups.length > 2 && !normalize ? (
        <p className="mt-2 text-xs text-amber-600">
          {axisGroups.length} different scales are on this chart but only two axes fit - turn on
          Normalize to compare their shapes.
        </p>
      ) : null}
    </div>
  );
}
