"use client";

import type { DayEnvironment, LunarDay } from "@/lib/api";

type Props = {
  // Optional at runtime: the backend and frontend deploy separately, so an
  // older API may not send these yet.
  lunar?: LunarDay | null;
  environment?: DayEnvironment | null;
};

const WINDOW_LABEL: Record<"full" | "new", string> = {
  full: "Purnama",
  new: "Bulan mati",
};

/** Moon glyph for the illuminated fraction and the direction of travel. */
function moonGlyph({ illumination, waxing }: LunarDay) {
  if (illumination >= 0.96) return "🌕";
  if (illumination <= 0.04) return "🌑";
  if (illumination >= 0.46 && illumination <= 0.54) return waxing ? "🌓" : "🌗";
  if (illumination > 0.54) return waxing ? "🌔" : "🌖";
  return waxing ? "🌒" : "🌘";
}

function plural(days: number) {
  return days === 1 ? "day" : "days";
}

/**
 * The signed distance is what makes this useful: only the run-up to a syzygy
 * is a cue to dose, the tail of a window is not.
 */
function moonMessage(lunar: LunarDay) {
  const { window, alert, is_peak, days_to_full, days_to_new } = lunar;

  if (is_peak && window) {
    return {
      text: `${WINDOW_LABEL[window]} today — peak molt, keep alkalinity and minerals up`,
      tone: "peak" as const,
    };
  }
  if (alert) {
    const days = Math.round(alert === "full" ? days_to_full : days_to_new);
    return {
      text: `${WINDOW_LABEL[alert]} in ${days} ${plural(days)} — start dosing lime and minerals`,
      tone: "alert" as const,
    };
  }
  if (window) {
    const signed = window === "full" ? days_to_full : days_to_new;
    const days = Math.abs(Math.round(signed));
    return {
      text:
        signed > 0
          ? `${WINDOW_LABEL[window]} in ${days} ${plural(days)}`
          : `${days} ${plural(days)} past ${WINDOW_LABEL[window].toLowerCase()}`,
      tone: "window" as const,
    };
  }

  // The soonest syzygy still ahead of us. Picking by absolute distance would
  // count a syzygy that has already passed and read "purnama in 3 days" three
  // days after the full moon.
  const upcoming = [
    { kind: "full" as const, days: days_to_full },
    { kind: "new" as const, days: days_to_new },
  ]
    .filter((candidate) => candidate.days > 0)
    .sort((a, b) => a.days - b.days)[0];

  if (!upcoming) return { text: "No molt window", tone: "quiet" as const };

  const days = Math.round(upcoming.days);
  return {
    text: `No molt window — ${WINDOW_LABEL[upcoming.kind].toLowerCase()} in ${days} ${plural(days)}`,
    tone: "quiet" as const,
  };
}

const TONE_STYLES = {
  peak: "border-amber-300 bg-amber-50 text-amber-900",
  alert: "border-amber-300 bg-amber-50 text-amber-900",
  window: "border-slate-300 bg-slate-50 text-slate-700",
  quiet: "border-slate-200 bg-white text-slate-500",
} as const;

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {hint ? <div className="text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

function num(value: string | null, digits = 1) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : null;
}

function WeatherSection({ environment }: { environment: DayEnvironment }) {
  const sun = num(environment.shortwave_radiation_sum_mj);
  const hours = num(environment.sunshine_duration_hours);
  const rain = num(environment.precipitation_mm);
  const rainHours = num(environment.precipitation_hours);
  const cloud = num(environment.cloud_cover_daylight_pct, 0);
  const min = num(environment.temp_min_c);
  const max = num(environment.temp_max_c);
  const probability = num(environment.precipitation_probability_max_pct, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium text-slate-700">Weather</h4>
        {environment.is_forecast ? (
          <span className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500">
            Forecast
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Sun on pond"
          value={sun ? `${sun} MJ/m²` : "—"}
          hint={hours ? `${hours} h sunshine` : undefined}
        />
        <Stat label="Cloud (daylight)" value={cloud ? `${cloud}%` : "—"} />
        <Stat
          label="Rain"
          value={rain ? `${rain} mm` : "—"}
          hint={
            environment.is_forecast && probability
              ? `${probability}% chance`
              : rainHours && Number(rainHours) > 0
                ? `${rainHours} h`
                : undefined
          }
        />
        <Stat label="Temp" value={min && max ? `${min}–${max} °C` : "—"} />
      </div>
    </div>
  );
}

function MoonSection({ lunar }: { lunar: LunarDay }) {
  const message = moonMessage(lunar);
  const illumination = Math.round(lunar.illumination * 100);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-slate-700">Moon</h4>
      <div
        className={`flex items-center gap-3 rounded-lg border p-3 ${TONE_STYLES[message.tone]}`}
      >
        <span className="text-2xl leading-none" aria-hidden="true">
          {moonGlyph(lunar)}
        </span>
        <div>
          <div className="text-sm font-medium">{message.text}</div>
          <div className="text-xs opacity-75">
            {illumination}% illuminated · {lunar.waxing ? "waxing" : "waning"}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConditionsCard({ lunar, environment }: Props) {
  // Nothing to show at all only happens against an API that predates both.
  if (!lunar && !environment) return null;

  return (
    <section className="space-y-4 rounded-lg bg-white p-4 shadow">
      <h3 className="font-medium">Conditions</h3>

      {lunar ? <MoonSection lunar={lunar} /> : null}

      {environment ? (
        <WeatherSection environment={environment} />
      ) : (
        <p className="text-sm text-slate-500">
          No weather yet — set this grid&apos;s coordinates to enable it.
        </p>
      )}
    </section>
  );
}
