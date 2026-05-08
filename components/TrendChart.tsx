"use client";

import { differenceInCalendarDays, parseISO } from "date-fns";
import { useMemo } from "react";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TrendPoint } from "@/lib/api";

type Props = {
  metric: string;
  points: TrendPoint[];
  startDate: string;
  brushStartIndex?: number;
  brushEndIndex?: number;
  onRangeChange?: (range: {
    startIndex: number;
    endIndex: number;
    startDate: string;
    endDate: string;
    startDoc: number;
    endDoc: number;
  }) => void;
};

const PAST_COLOR = "#0ea5a4";
const FUTURE_COLOR = "#94a3b8";

type DotProps = {
  cx?: number;
  cy?: number;
  payload?: {
    value: number | null;
    is_sampling_day: boolean;
  };
};

function SamplingDot({ cx, cy, payload }: DotProps) {
  if (!payload?.is_sampling_day || payload.value === null || cx == null || cy == null) {
    return null;
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill="#f59e0b"
      stroke="#fff7ed"
      strokeWidth={2}
    />
  );
}

type ChartRow = {
  date: string;
  doc: number;
  past: number | null;
  future: number | null;
  value: number | null;
  is_sampling_day: boolean;
};

type TooltipEntry = {
  dataKey?: string;
  value?: number | null;
  color?: string;
  payload?: ChartRow;
};

type TrendTooltipProps = {
  active?: boolean;
  metric: string;
  label?: string;
  payload?: TooltipEntry[];
};

function TrendTooltip({ active, metric, label, payload }: TrendTooltipProps) {
  if (!active || !payload?.length) return null;

  const entry =
    payload.find((item) => item.dataKey === "past" && item.value != null) ??
    payload.find((item) => item.dataKey === "future" && item.value != null);

  if (!entry || entry.value == null) return null;

  const color = entry.dataKey === "future" ? FUTURE_COLOR : PAST_COLOR;

  return (
    <div className="rounded border border-slate-200 bg-white px-3 py-2 shadow text-sm">
      <div className="font-medium text-slate-900">{label}</div>
      <div className="text-xs text-slate-500">DOC {entry.payload?.doc ?? "-"}</div>
      <div className="font-semibold" style={{ color }}>
        {metric}: {entry.value}
      </div>
      {entry.payload?.is_sampling_day ? (
        <div className="text-xs text-amber-600">Sampling day</div>
      ) : null}
    </div>
  );
}

export function TrendChart({
  metric,
  points,
  startDate,
  brushStartIndex,
  brushEndIndex,
  onRangeChange,
}: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const data = useMemo(() => {
    const rows = points.map((p) => ({
      date: p.date,
      doc: differenceInCalendarDays(parseISO(p.date), parseISO(startDate)) + 1,
      past: !p.is_future && p.value !== null ? Number(p.value) : null,
      future: p.is_future && p.value !== null ? Number(p.value) : null,
      value: p.value !== null ? Number(p.value) : null,
      is_sampling_day: p.is_sampling_day,
    }));

    // Connect the last past point with the first future point so the line
    // doesn't visually break at the today boundary.
    const todayIdx = rows.findIndex((d) => d.date === today);
    if (todayIdx >= 0 && rows[todayIdx].past !== null) {
      rows[todayIdx].future = rows[todayIdx].past;
    }

    return rows;
  }, [points, startDate, today]);

  const lastIndex = Math.max(data.length - 1, 0);
  const effectiveStartIndex = Math.max(0, Math.min(brushStartIndex ?? 0, lastIndex));
  const effectiveEndIndex = Math.max(
    effectiveStartIndex,
    Math.min(brushEndIndex ?? lastIndex, lastIndex),
  );
  const startRow = data[effectiveStartIndex];
  const endRow = data[effectiveEndIndex];

  function handleBrushRangeCommit(range?: { startIndex?: number; endIndex?: number }) {
    if (!onRangeChange || !data.length || range?.startIndex == null || range?.endIndex == null) {
      return;
    }

    const nextStart = Math.max(0, Math.min(range.startIndex, data.length - 1));
    const nextEnd = Math.max(nextStart, Math.min(range.endIndex, data.length - 1));
    const nextStartRow = data[nextStart];
    const nextEndRow = data[nextEnd];

    onRangeChange({
      startIndex: nextStart,
      endIndex: nextEnd,
      startDate: nextStartRow.date,
      endDate: nextEndRow.date,
      startDoc: nextStartRow.doc,
      endDoc: nextEndRow.doc,
    });
  }

  const formatAxisDate = (date: string) => date.slice(5);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
        <h3 className="font-medium capitalize">{metric.replace(/_/g, " ")}</h3>
        {startRow && endRow ? (
          <div className="text-xs text-slate-500">
            {startRow.date} - {endRow.date} | DOC {startRow.doc}-{endRow.doc}
          </div>
        ) : null}
      </div>
      <div style={{ width: "100%", height: 360 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              minTickGap={24}
              tickFormatter={formatAxisDate}
            />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<TrendTooltip metric={metric} />} />
            <ReferenceLine x={today} stroke={PAST_COLOR} strokeDasharray="4 4" label="today" />
            <Line
              type="monotone"
              dataKey="past"
              stroke={PAST_COLOR}
              strokeWidth={2}
              dot={<SamplingDot />}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="future"
              stroke={FUTURE_COLOR}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={<SamplingDot />}
              connectNulls
              isAnimationActive={false}
            />
            {data.length > 1 ? (
              <Brush
                dataKey="date"
                height={34}
                travellerWidth={12}
                stroke={PAST_COLOR}
                fill="#f8fafc"
                startIndex={effectiveStartIndex}
                endIndex={effectiveEndIndex}
                tickFormatter={formatAxisDate}
                onDragEnd={handleBrushRangeCommit}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs text-slate-500 mt-2 flex gap-4">
        <span>
          <span className="inline-block w-3 h-0.5 bg-primary align-middle mr-1" /> past
        </span>
        <span>
          <span
            className="inline-block w-3 h-0.5 align-middle mr-1"
            style={{
              background: "repeating-linear-gradient(90deg, #94a3b8 0 4px, transparent 4px 8px)",
            }}
          />{" "}
          future
        </span>
        <span>
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 align-middle mr-1" />{" "}
          sampling
        </span>
      </div>
    </div>
  );
}
