"use client";

import { useEffect, useState } from "react";

import { api, type DayEnvironment, type Grid } from "@/lib/api";
import { addDays, mediumDate } from "@/lib/dates";
import { moonEmoji, moonOn, nextSyzygy } from "@/lib/moon";
import { fmtNum, num } from "@/lib/num";
import { DetailPanel, type ChartSeries } from "./DetailPanel";

type CondKey = "moon" | "sun" | "cloud" | "rain" | "temp";

const f1 = (v: number) => (Number.isFinite(v) ? (Math.round(v * 10) / 10).toFixed(1) : "—");

const CONDS: Record<Exclude<CondKey, "moon">, { label: string; val: (d: DayEnvironment) => number; fmt: (d: DayEnvironment) => string; sub: (d: DayEnvironment) => string }> = {
  sun: {
    label: "Sun on pond",
    val: (d) => num(d.shortwave_radiation_sum_mj),
    fmt: (d) => `${f1(num(d.shortwave_radiation_sum_mj))} MJ/m²`,
    sub: (d) => (d.sunshine_duration_hours ? `${f1(num(d.sunshine_duration_hours))} h sunshine` : ""),
  },
  cloud: {
    label: "Cloud (daylight)",
    val: (d) => num(d.cloud_cover_daylight_pct),
    fmt: (d) => `${fmtNum(d.cloud_cover_daylight_pct, 0)}%`,
    sub: (d) => {
      const c = num(d.cloud_cover_daylight_pct);
      return !Number.isFinite(c) ? "" : c < 25 ? "Mostly clear" : c < 60 ? "Partly cloudy" : "Overcast";
    },
  },
  rain: {
    label: "Rain",
    val: (d) => num(d.precipitation_mm),
    fmt: (d) => `${f1(num(d.precipitation_mm))} mm`,
    sub: (d) => (d.precipitation_probability_max_pct !== null ? `${fmtNum(d.precipitation_probability_max_pct, 0)}% chance` : ""),
  },
  temp: {
    label: "Temp",
    val: (d) => num(d.temp_max_c),
    fmt: (d) => `${f1(num(d.temp_min_c))}–${f1(num(d.temp_max_c))} °C`,
    sub: () => "",
  },
};

const rel = (off: number) => (off === 0 ? "Today" : off === 1 ? "Tmrw" : off === -1 ? "Yday" : off < 0 ? `${-off}d ago` : `in ${off}d`);

/** Grid-level weather and moon chips, with a detail panel per chip. */
export function Conditions({
  grid,
  today,
  onSetLocation,
  canManage,
}: {
  grid: Grid;
  today: string;
  onSetLocation: () => void;
  canManage: boolean;
}) {
  const [days, setDays] = useState<DayEnvironment[] | null>(null);
  const [open, setOpen] = useState<CondKey | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const hasLocation = grid.latitude !== null && grid.longitude !== null;

  useEffect(() => {
    setDays(null);
    setOpen(null);
    if (!hasLocation) return;
    let cancelled = false;
    api
      .getGridEnvironment(grid.id, addDays(today, -7), addDays(today, 5))
      .then((env) => !cancelled && setDays(env.days))
      .catch(() => !cancelled && setDays([]));
    return () => {
      cancelled = true;
    };
  }, [grid.id, hasLocation, today]);

  async function refresh() {
    setRefreshing(true);
    try {
      await api.refreshGridEnvironment(grid.id);
      const env = await api.getGridEnvironment(grid.id, addDays(today, -7), addDays(today, 5));
      setDays(env.days);
    } catch {
      // The chip row keeps saying "not synced"; nothing else to do.
    } finally {
      setRefreshing(false);
    }
  }

  const byDate = new Map((days ?? []).map((d) => [d.date, d]));
  const w0 = byDate.get(today) ?? null;
  const moon = moonOn(today);
  const molt = moon.window !== null;
  const next = nextSyzygy(moon);

  const lat = num(grid.latitude);
  const lng = num(grid.longitude);
  const coords = hasLocation ? `${Math.abs(lat).toFixed(3)}°${lat < 0 ? "S" : "N"}, ${Math.abs(lng).toFixed(3)}°${lng < 0 ? "W" : "E"}` : "";

  const chips: { key: CondKey; emoji: string; text: string; aria: string; warn?: boolean }[] = [
    {
      key: "moon",
      emoji: moonEmoji(moon),
      text: molt ? "Molt window" : `${next.name === "full" ? "Full" : "New"} in ${next.days}d`,
      aria: "Moon",
      warn: molt,
    },
  ];
  if (w0) {
    chips.push(
      { key: "sun", emoji: "☀️", text: `${f1(num(w0.shortwave_radiation_sum_mj))} MJ`, aria: "Sun on pond" },
      { key: "cloud", emoji: "☁️", text: `${fmtNum(w0.cloud_cover_daylight_pct, 0)}%`, aria: "Cloud" },
      { key: "rain", emoji: "🌧️", text: `${f1(num(w0.precipitation_mm))} mm · ${fmtNum(w0.precipitation_probability_max_pct, 0)}%`, aria: "Rain" },
      { key: "temp", emoji: "🌡️", text: `${Math.round(num(w0.temp_min_c))}–${Math.round(num(w0.temp_max_c))}°`, aria: "Temperature" },
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate text-[11px] uppercase tracking-[0.08em] text-tx-muted">Conditions · {grid.name}</span>
        {coords ? <span className="whitespace-nowrap font-mono text-[10px] text-tx-faint">{coords}</span> : null}
        <span className="ml-auto shrink-0 rounded-full border border-dashed border-tx-off px-2 py-0.5 text-[10px] text-tx-muted">
          {w0?.is_forecast === false ? "Actual · today" : "Forecast · today"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const on = open === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setOpen(on ? null : c.key)}
              aria-pressed={on}
              aria-label={`${c.aria} details`}
              className={`inline-flex h-10 items-center gap-[7px] rounded-full border px-3 ${
                on ? "border-accent bg-accent/[0.12]" : c.warn ? "border-warn/50 bg-warn/10" : "border-line-strong bg-ink-800"
              }`}
            >
              <span className="text-base leading-none" aria-hidden>
                {c.emoji}
              </span>
              <span className={`whitespace-nowrap font-mono text-[13px] font-semibold ${c.warn ? "text-warn" : "text-tx-strong"}`}>{c.text}</span>
            </button>
          );
        })}
        {!hasLocation ? (
          <button type="button" onClick={onSetLocation} disabled={!canManage} className="inline-flex h-10 items-center rounded-full border border-dashed border-line-dash px-3 text-xs font-semibold text-tx-muted disabled:opacity-60">
            {canManage ? "Set this grid's location for weather →" : "No location set for this grid"}
          </button>
        ) : days && !w0 ? (
          <button type="button" onClick={refresh} disabled={!canManage || refreshing} className="inline-flex h-10 items-center rounded-full border border-dashed border-line-dash px-3 text-xs font-semibold text-tx-muted disabled:opacity-60">
            {refreshing ? "Syncing weather…" : canManage ? "Weather not synced · sync now" : "Weather not synced yet"}
          </button>
        ) : null}
      </div>
      {open === "moon" ? (
        <MoonDetail today={today} onClose={() => setOpen(null)} />
      ) : open ? (
        <WeatherDetail condKey={open} byDate={byDate} today={today} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}

function MoonDetail({ today, onClose }: { today: string; onClose: () => void }) {
  const m = moonOn(today);
  const next = nextSyzygy(m);
  const title = m.window
    ? `Molt window — around ${m.window === "full" ? "full" : "new"} moon`
    : `No molt window — ${next.name} moon in ${next.days} days`;
  const points = [];
  for (let off = -7; off <= 14; off++) points.push({ x: off, y: Math.round(moonOn(addDays(today, off)).illumination * 100) });
  const rows = [];
  for (let off = 0; off <= 14 && rows.length < 6; off++) {
    const d = addDays(today, off);
    const md = moonOn(d);
    if (off === 0 || md.window || md.isPeak) {
      const tag = md.isPeak ? (Math.abs(md.daysToFull) <= 0.5 ? " · full" : " · new") : "";
      rows.push({ key: d, doc: rel(off), date: mediumDate(d), value: `${Math.round(md.illumination * 100)}%${md.window ? " · molt" : ""}${tag}` });
    }
  }
  return (
    <DetailPanel
      title="Moon"
      lines={[{ value: `${Math.round(m.illumination * 100)}% · ${m.waxing ? "waxing" : "waning"}`, when: title }]}
      chart={{ series: [{ color: "#F5E6B8", points }], xMin: -7, xMax: 14, xStart: mediumDate(addDays(today, -7)), xEnd: mediumDate(addDays(today, 14)), format: (v) => `${Math.round(v)}%` }}
      legend={[{ label: "Illumination %", color: "#F5E6B8" }]}
      rowsTitle="Coming days · molt window opens 4 days before full/new moon"
      rows={rows}
      onClose={onClose}
    />
  );
}

function WeatherDetail({ condKey, byDate, today, onClose }: { condKey: Exclude<CondKey, "moon">; byDate: Map<string, DayEnvironment>; today: string; onClose: () => void }) {
  const c = CONDS[condKey];
  const w0 = byDate.get(today);
  const actual: { x: number; y: number }[] = [];
  const forecast: { x: number; y: number }[] = [];
  const minActual: { x: number; y: number }[] = [];
  const minForecast: { x: number; y: number }[] = [];
  for (let off = -7; off <= 5; off++) {
    const d = byDate.get(addDays(today, off));
    if (!d) continue;
    const y = c.val(d);
    if (!Number.isFinite(y)) continue;
    (d.is_forecast ? forecast : actual).push({ x: off, y });
    if (condKey === "temp") (d.is_forecast ? minForecast : minActual).push({ x: off, y: num(d.temp_min_c) });
  }
  // Join the two lines so the forecast continues from the last actual day.
  if (actual.length && forecast.length) actual.push(forecast[0]);
  if (minActual.length && minForecast.length) minActual.push(minForecast[0]);
  const series: ChartSeries[] = [
    { color: "#2DD4BF", points: actual },
    { color: "#C084FC", points: forecast },
  ];
  const legend = [
    { label: condKey === "temp" ? "Max · actual" : "Actual", color: "#2DD4BF" },
    { label: condKey === "temp" ? "Max · forecast" : "Forecast", color: "#C084FC" },
  ];
  if (condKey === "temp") {
    series.push({ color: "#38BDF8", points: minActual }, { color: "#7DD3FC", points: minForecast });
    legend.push({ label: "Min · actual", color: "#38BDF8" }, { label: "Min · forecast", color: "#7DD3FC" });
  }
  const rows = [];
  for (let off = -2; off <= 3; off++) {
    const iso = addDays(today, off);
    const d = byDate.get(iso);
    if (!d) continue;
    rows.push({ key: iso, doc: rel(off), date: `${mediumDate(iso)}${d.is_forecast ? "" : " · actual"}`, value: c.fmt(d) });
  }
  return (
    <DetailPanel
      title={c.label}
      lines={[{ value: w0 ? c.fmt(w0) : "—", when: `${w0?.is_forecast === false ? "Measured" : "Forecast"} for today · ${mediumDate(today)}${w0 && c.sub(w0) ? ` · ${c.sub(w0)}` : ""}` }]}
      chart={{ series, xMin: -7, xMax: 5, xStart: mediumDate(addDays(today, -7)), xEnd: mediumDate(addDays(today, 5)) }}
      legend={legend}
      rowsTitle="Day by day"
      rows={rows}
      onClose={onClose}
    />
  );
}

