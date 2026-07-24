export type MetricGroup = "Daily metrics" | "Water parameters" | "Plankton & Bacteria";

export type MetricDef = {
  key: string;
  label: string;
  group: MetricGroup;
  unit: string;
  /**
   * Metrics sharing an axis group are plotted against the same Y axis, so
   * am/pm pairs (ph_am vs ph_pm) stay directly comparable.
   */
  axisGroup: string;
};

export const METRIC_DEFS: MetricDef[] = [
  { key: "daily_feed_kg", label: "Daily feed", group: "Daily metrics", unit: "kg", axisGroup: "daily_feed" },
  { key: "feeding_index", label: "Feeding index", group: "Daily metrics", unit: "%", axisGroup: "feeding_index" },
  { key: "cumulative_feed_start_kg", label: "Cumulative feed (start)", group: "Daily metrics", unit: "kg", axisGroup: "cumulative_feed" },
  { key: "cumulative_feed_end_kg", label: "Cumulative feed (end)", group: "Daily metrics", unit: "kg", axisGroup: "cumulative_feed" },
  { key: "abw_g", label: "ABW", group: "Daily metrics", unit: "g", axisGroup: "abw" },
  { key: "adg_g_per_day", label: "Average daily gain", group: "Daily metrics", unit: "g/day", axisGroup: "adg" },
  { key: "estimated_population", label: "Population", group: "Daily metrics", unit: "pcs", axisGroup: "population" },
  { key: "estimated_biomass_kg", label: "Biomass", group: "Daily metrics", unit: "kg", axisGroup: "biomass" },
  { key: "harvest_biomass_kg", label: "Harvest biomass", group: "Daily metrics", unit: "kg", axisGroup: "biomass" },
  { key: "fcr", label: "FCR", group: "Daily metrics", unit: "", axisGroup: "fcr" },
  { key: "sample_fcr", label: "Sample FCR", group: "Daily metrics", unit: "", axisGroup: "fcr" },

  { key: "do_am", label: "DO am", group: "Water parameters", unit: "mg/L", axisGroup: "do" },
  { key: "do_pm", label: "DO pm", group: "Water parameters", unit: "mg/L", axisGroup: "do" },
  { key: "ph_am", label: "pH am", group: "Water parameters", unit: "", axisGroup: "ph" },
  { key: "ph_pm", label: "pH pm", group: "Water parameters", unit: "", axisGroup: "ph" },
  { key: "water_clarity_am", label: "Water clarity am", group: "Water parameters", unit: "cm", axisGroup: "clarity" },
  { key: "water_clarity_pm", label: "Water clarity pm", group: "Water parameters", unit: "cm", axisGroup: "clarity" },
  { key: "salinity", label: "Salinity", group: "Water parameters", unit: "ppt", axisGroup: "salinity" },
  { key: "tan", label: "TAN", group: "Water parameters", unit: "mg/L", axisGroup: "tan" },
  { key: "nitrite", label: "Nitrite", group: "Water parameters", unit: "mg/L", axisGroup: "nitrite" },
  { key: "phosphate", label: "Phosphate", group: "Water parameters", unit: "mg/L", axisGroup: "phosphate" },
  { key: "calcium", label: "Calcium", group: "Water parameters", unit: "mg/L", axisGroup: "calcium" },
  { key: "magnesium", label: "Magnesium", group: "Water parameters", unit: "mg/L", axisGroup: "magnesium" },
  { key: "alkalinity", label: "Alkalinity", group: "Water parameters", unit: "mg/L", axisGroup: "alkalinity" },

  { key: "plankton_ga", label: "GA", group: "Plankton & Bacteria", unit: "cells/mL", axisGroup: "plankton" },
  { key: "plankton_bga", label: "BGA", group: "Plankton & Bacteria", unit: "cells/mL", axisGroup: "plankton" },
  { key: "plankton_diatom", label: "Diatom", group: "Plankton & Bacteria", unit: "cells/mL", axisGroup: "plankton" },
  { key: "plankton_yga", label: "YGA", group: "Plankton & Bacteria", unit: "cells/mL", axisGroup: "plankton" },
  { key: "plankton_eugle", label: "Eugle", group: "Plankton & Bacteria", unit: "cells/mL", axisGroup: "plankton" },
  { key: "plankton_dino", label: "Dino", group: "Plankton & Bacteria", unit: "cells/mL", axisGroup: "plankton" },
  { key: "plankton_zoo", label: "Zoo", group: "Plankton & Bacteria", unit: "cells/mL", axisGroup: "plankton" },
  { key: "plankton_protozoa", label: "Protozoa", group: "Plankton & Bacteria", unit: "cells/mL", axisGroup: "plankton" },
  { key: "total_plankton", label: "Total plankton", group: "Plankton & Bacteria", unit: "cells/mL", axisGroup: "total_plankton" },
  { key: "yellow_vibrio", label: "Yellow Vibrio", group: "Plankton & Bacteria", unit: "CFU/mL", axisGroup: "vibrio" },
  { key: "green_vibrio", label: "Green Vibrio", group: "Plankton & Bacteria", unit: "CFU/mL", axisGroup: "vibrio" },
  { key: "black_vibrio", label: "Black Vibrio", group: "Plankton & Bacteria", unit: "CFU/mL", axisGroup: "vibrio" },
  { key: "total_vibrio_count", label: "Total Vibrio count", group: "Plankton & Bacteria", unit: "CFU/mL", axisGroup: "total_vibrio" },
  { key: "tbc", label: "TBC", group: "Plankton & Bacteria", unit: "CFU/mL", axisGroup: "tbc" },
  { key: "vibrio_percentage", label: "Vibrio percentage", group: "Plankton & Bacteria", unit: "%", axisGroup: "vibrio_pct" },
];

export const METRIC_GROUPS: MetricGroup[] = [
  "Daily metrics",
  "Water parameters",
  "Plankton & Bacteria",
];

const BY_KEY = new Map(METRIC_DEFS.map((m) => [m.key, m]));

export function metricDef(key: string): MetricDef {
  return (
    BY_KEY.get(key) ?? {
      key,
      label: key.replace(/_/g, " "),
      group: "Daily metrics",
      unit: "",
      axisGroup: key,
    }
  );
}

export function metricLabel(key: string): string {
  return metricDef(key).label;
}

/** Compact number formatting shared by the axis, tooltip and legend. */
export function formatMetricValue(value: number, unit?: string): string {
  const abs = Math.abs(value);
  let text: string;
  if (abs >= 1_000_000) text = `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  else if (abs >= 10_000) text = `${(value / 1000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  else if (abs >= 100) text = value.toFixed(0);
  else if (abs >= 1) text = trimZeros(value.toFixed(2));
  else text = trimZeros(value.toFixed(3));
  return unit ? `${text} ${unit}` : text;
}

function trimZeros(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}
