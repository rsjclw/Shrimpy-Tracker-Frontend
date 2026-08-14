"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api, type BlindFeedingTemplate, type Cycle, type Farm, type FarmRole, type FeedType, type Grid, type Pond, type PredictionConfig } from "@/lib/api";

function canAdd(role: FarmRole | null) {
  return role === "admin" || role === "owner" || role === "operator";
}

function canManage(role: FarmRole | null) {
  return role === "admin" || role === "owner";
}

const STATUS_OPTIONS = ["active", "completed", "crashed"];
const DEFAULT_PRICE_POINTS = [
  { count_size: "200", price_per_kg: "20000" },
  { count_size: "100", price_per_kg: "52000" },
  { count_size: "90", price_per_kg: "53000" },
  { count_size: "80", price_per_kg: "55000" },
  { count_size: "70", price_per_kg: "57000" },
  { count_size: "60", price_per_kg: "60000" },
  { count_size: "50", price_per_kg: "64000" },
  { count_size: "40", price_per_kg: "70000" },
  { count_size: "30", price_per_kg: "75000" },
  { count_size: "20", price_per_kg: "82000" },
];
const DEFAULT_FEED_PLAN = [
  { feed_type_id: "", maximum_daily_feed_kg: "50", use_until_abw_g: "10" },
  { feed_type_id: "", maximum_daily_feed_kg: "65", use_until_abw_g: "998" },
  { feed_type_id: "", maximum_daily_feed_kg: "65", use_until_abw_g: "999" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyCycleForm() {
  return {
    name: "",
    start_date: todayIso(),
    target_doc: "",
    initial_population: "",
    initial_abw_g: "0",
    maximum_daily_feed_capacity_kg: "",
    stable_carrying_capacity_kg_per_m3: "",
    final_carrying_capacity_kg_per_m3: "",
    feeding_index_increment: "0.010",
    maximum_feeding_index: "",
    blind_feeding_template_id: "",
    blind_feeding_target_abw_g: "",
    prediction_preparation_day: "20",
    prediction_maximum_shrimp_size_g: "100",
    prediction_target_fcr: "1.3",
    prediction_maximum_adg_g_per_day: "0.5",
    prediction_initial_feeding_index: "0.55",
    prediction_feeding_index_increment: "0.010",
    prediction_maximum_feeding_index: "0.7",
    prediction_stable_carrying_capacity_kg_per_m2: "2",
    prediction_final_carrying_capacity_kg_per_m2: "3",
    prediction_minimum_partial_harvest_biomass_kg: "350",
    prediction_harvest_fixed_cost_per_event: "500000",
    prediction_pl_price_per_piece: "54",
    prediction_electricity_kwh: "6",
    prediction_electricity_price_per_kwh: "1590",
    prediction_labor_cost_per_day: "100000",
    prediction_probiotics_cost_per_day: "42000",
    prediction_disinfection_cost_per_day: "70000",
    prediction_liming_cost_per_day: "30000",
    prediction_price_points: DEFAULT_PRICE_POINTS.map((row) => ({ ...row })),
    prediction_feed_plan: DEFAULT_FEED_PLAN.map((row) => ({ ...row })),
  };
}

function docToPlannedDate(startDate: string, docStr: string): string | undefined {
  const doc = Math.floor(Number(docStr));
  if (!startDate || !Number.isFinite(doc) || doc < 1) return undefined;
  const d = new Date(startDate);
  d.setUTCDate(d.getUTCDate() + doc - 1);
  return d.toISOString().slice(0, 10);
}

function plannedDateToDoc(startDate: string, endDate: string | null): string {
  if (!startDate || !endDate) return "";
  const diff = Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000,
  );
  return diff >= 0 ? String(diff + 1) : "";
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

function nullableNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

function requiredNumber(value: string) {
  return Number(value.trim());
}

function withDefaultFeedTypes<T extends ReturnType<typeof emptyCycleForm>>(form: T, feedTypes: FeedType[]): T {
  if (!feedTypes.length || form.prediction_feed_plan.some((row) => row.feed_type_id)) return form;
  return {
    ...form,
    prediction_feed_plan: form.prediction_feed_plan.map((row) => ({
      ...row,
      feed_type_id: feedTypes[0].id,
    })),
  };
}

function buildPredictionConfig(form: ReturnType<typeof emptyCycleForm>): PredictionConfig {
  return {
    cycle: {
      preparation_day: Math.floor(requiredNumber(form.prediction_preparation_day)),
      maximum_shrimp_size_g: requiredNumber(form.prediction_maximum_shrimp_size_g),
    },
    growth: {
      target_fcr: requiredNumber(form.prediction_target_fcr),
      maximum_adg_g_per_day: requiredNumber(form.prediction_maximum_adg_g_per_day),
      initial_feeding_index: requiredNumber(form.prediction_initial_feeding_index),
      feeding_index_increment: requiredNumber(form.prediction_feeding_index_increment),
      maximum_feeding_index: requiredNumber(form.prediction_maximum_feeding_index),
    },
    capacity: {
      stable_carrying_capacity_kg_per_m2: requiredNumber(form.prediction_stable_carrying_capacity_kg_per_m2),
      final_carrying_capacity_kg_per_m2: requiredNumber(form.prediction_final_carrying_capacity_kg_per_m2),
    },
    harvest: {
      minimum_partial_harvest_biomass_kg: requiredNumber(form.prediction_minimum_partial_harvest_biomass_kg),
      harvest_fixed_cost_per_event: requiredNumber(form.prediction_harvest_fixed_cost_per_event),
    },
    prices: {
      harvest_price_points: form.prediction_price_points.map((row) => ({
        count_size: requiredNumber(row.count_size),
        price_per_kg: requiredNumber(row.price_per_kg),
      })),
    },
    costs: {
      pl_price_per_piece: requiredNumber(form.prediction_pl_price_per_piece),
      electricity_kwh: requiredNumber(form.prediction_electricity_kwh),
      electricity_price_per_kwh: requiredNumber(form.prediction_electricity_price_per_kwh),
      labor_cost_per_day: requiredNumber(form.prediction_labor_cost_per_day),
      probiotics_cost_per_day: requiredNumber(form.prediction_probiotics_cost_per_day),
      disinfection_cost_per_day: requiredNumber(form.prediction_disinfection_cost_per_day),
      liming_cost_per_day: requiredNumber(form.prediction_liming_cost_per_day),
    },
    feed_plan: form.prediction_feed_plan.map((row) => ({
      feed_type_id: row.feed_type_id,
      maximum_daily_feed_kg: requiredNumber(row.maximum_daily_feed_kg),
      use_until_abw_g: requiredNumber(row.use_until_abw_g),
    })),
  };
}

function formatIndex(value: string | null | undefined) {
  return value ? Number(value).toFixed(3) : "";
}

function formatKg(value: string | null | undefined) {
  return value ? `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 })} kg` : null;
}

function formatCapacity(value: string | null | undefined) {
  return value ? `${Number(value).toFixed(3)} kg/m3` : null;
}

function formatTemplateOption(template: BlindFeedingTemplate) {
  return `${template.name} - ${template.duration_days}d - ${Number(template.cumulative_feed_per_100k).toLocaleString(undefined, { maximumFractionDigits: 3 })} kg/100k`;
}

export default function PondPage() {
  const { pondId } = useParams<{ pondId: string }>();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [grids, setGrids] = useState<Grid[]>([]);
  const [pond, setPond] = useState<Pond | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [blindFeedingTemplates, setBlindFeedingTemplates] = useState<BlindFeedingTemplate[]>([]);
  const [feedTypes, setFeedTypes] = useState<FeedType[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyCycleForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    status: "active",
    target_doc: "",
    actual_doc: "",
    maximum_daily_feed_capacity_kg: "",
    stable_carrying_capacity_kg_per_m3: "",
    final_carrying_capacity_kg_per_m3: "",
    feeding_index_increment: "0.010",
    maximum_feeding_index: "",
    notes: "",
  });

  useEffect(() => {
    reload();
  }, [pondId]);

  async function reload() {
    const [visibleFarms, visibleGrids, currentPond, pondCycles] = await Promise.all([
      api.listFarms(),
      api.listGrids(),
      api.getPond(pondId),
      api.listPondCycles(pondId),
    ]);
    const currentFarmId = visibleGrids.find((grid) => grid.id === currentPond.grid_id)?.farm_id;
    const [templates, catalogFeeds] = currentFarmId
      ? await Promise.all([api.listBlindFeedingTemplates(currentFarmId), api.listFeedTypes(currentFarmId)])
      : [[], []];
    setFarms(visibleFarms);
    setGrids(visibleGrids);
    setPond(currentPond);
    setCycles(pondCycles);
    setBlindFeedingTemplates(templates);
    setFeedTypes(catalogFeeds);
    setForm((current) => withDefaultFeedTypes(current, catalogFeeds));
  }

  async function createCycle(e: React.FormEvent) {
    e.preventDefault();
    await api.createCycle({
      pond_id: pondId,
      name: form.name.trim(),
      start_date: form.start_date,
      planned_end_date: docToPlannedDate(form.start_date, form.target_doc),
      initial_population: Number(form.initial_population),
      initial_abw_g: Number(form.initial_abw_g),
      blind_feeding_template_id: form.blind_feeding_template_id || undefined,
      blind_feeding_target_abw_g: form.blind_feeding_template_id ? optionalNumber(form.blind_feeding_target_abw_g) : undefined,
      maximum_daily_feed_capacity_kg: optionalNumber(form.maximum_daily_feed_capacity_kg),
      stable_carrying_capacity_kg_per_m3: optionalNumber(form.stable_carrying_capacity_kg_per_m3),
      final_carrying_capacity_kg_per_m3: optionalNumber(form.final_carrying_capacity_kg_per_m3),
      feeding_index_increment: optionalNumber(form.feeding_index_increment) ?? 0.01,
      maximum_feeding_index: optionalNumber(form.maximum_feeding_index),
      ...(feedTypes.length ? { prediction_config: buildPredictionConfig(form) } : {}),
    });
    setShowForm(false);
    setForm(emptyCycleForm());
    reload();
  }

  async function saveEdit(e: React.FormEvent, id: string) {
    e.preventDefault();
    const cycleStartDate = cycles.find((c) => c.id === id)?.start_date ?? "";
    const actualEndDate =
      editForm.status === "active"
        ? null
        : docToPlannedDate(cycleStartDate, editForm.actual_doc) ?? todayIso();
    await api.updateCycle(id, {
      name: editForm.name.trim(),
      status: editForm.status,
      planned_end_date: docToPlannedDate(cycleStartDate, editForm.target_doc),
      actual_end_date: actualEndDate,
      maximum_daily_feed_capacity_kg: nullableNumber(editForm.maximum_daily_feed_capacity_kg),
      stable_carrying_capacity_kg_per_m3: nullableNumber(editForm.stable_carrying_capacity_kg_per_m3),
      final_carrying_capacity_kg_per_m3: nullableNumber(editForm.final_carrying_capacity_kg_per_m3),
      feeding_index_increment: nullableNumber(editForm.feeding_index_increment) ?? 0.01,
      maximum_feeding_index: nullableNumber(editForm.maximum_feeding_index),
      notes: editForm.notes.trim() || undefined,
    });
    setEditingId(null);
    reload();
  }

  async function deleteCycle(id: string, cycleName: string) {
    if (!confirm(`Delete cycle "${cycleName}" and all its daily logs? This cannot be undone.`)) return;
    await api.deleteCycle(id);
    reload();
  }

  const farmId = grids.find((grid) => grid.id === pond?.grid_id)?.farm_id;
  const role = farms.find((farm) => farm.id === farmId)?.role ?? null;

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <Link href="/" className="text-sm text-slate-500 hover:underline">
        &larr; Farm
      </Link>
      <h1 className="text-2xl font-semibold">{pond?.name ?? "..."}</h1>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Cycles</h2>
          {canAdd(role) && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-sm bg-primary text-white px-3 py-1 rounded"
          >
            + New cycle
          </button>
          )}
        </div>

        {showForm && (
          <form
            onSubmit={createCycle}
            className="bg-white p-4 rounded-lg shadow space-y-3"
          >
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm">Name</span>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Start date (DOC 1)</span>
                <input
                  type="date"
                  required
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Target final DOC</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 120"
                  value={form.target_doc}
                  onChange={(e) => setForm({ ...form, target_doc: e.target.value })}
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Initial population</span>
                <input
                  required
                  type="number"
                  value={form.initial_population}
                  onChange={(e) =>
                    setForm({ ...form, initial_population: e.target.value })
                  }
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Maximum daily feed capacity (kg)</span>
                <input
                  type="number"
                  step="any"
                  value={form.maximum_daily_feed_capacity_kg}
                  onChange={(e) =>
                    setForm({ ...form, maximum_daily_feed_capacity_kg: e.target.value })
                  }
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Maximum feeding index</span>
                <input
                  type="number"
                  step="any"
                  value={form.maximum_feeding_index}
                  onChange={(e) =>
                    setForm({ ...form, maximum_feeding_index: e.target.value })
                  }
                  onBlur={(e) =>
                    setForm({ ...form, maximum_feeding_index: formatIndex(e.target.value) })
                  }
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Feeding index increment</span>
                <input
                  type="number"
                  step="any"
                  value={form.feeding_index_increment}
                  onChange={(e) =>
                    setForm({ ...form, feeding_index_increment: e.target.value })
                  }
                  onBlur={(e) =>
                    setForm({
                      ...form,
                      feeding_index_increment: (optionalNumber(e.target.value) ?? 0.01).toFixed(3),
                    })
                  }
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Stable carrying capacity (kg/m3)</span>
                <input
                  type="number"
                  step="any"
                  value={form.stable_carrying_capacity_kg_per_m3}
                  onChange={(e) =>
                    setForm({ ...form, stable_carrying_capacity_kg_per_m3: e.target.value })
                  }
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Final carrying capacity (kg/m3)</span>
                <input
                  type="number"
                  step="any"
                  value={form.final_carrying_capacity_kg_per_m3}
                  onChange={(e) =>
                    setForm({ ...form, final_carrying_capacity_kg_per_m3: e.target.value })
                  }
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">Initial ABW (g)</span>
                <input
                  required
                  type="number"
                  step="any"
                  value={form.initial_abw_g}
                  onChange={(e) =>
                    setForm({ ...form, initial_abw_g: e.target.value })
                  }
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm">Blind feeding template</span>
                <select
                  value={form.blind_feeding_template_id}
                  onChange={(e) => setForm({ ...form, blind_feeding_template_id: e.target.value })}
                  className="mt-1 w-full border rounded px-3 py-2"
                >
                  <option value="">No blind feeding</option>
                  {blindFeedingTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {formatTemplateOption(template)}
                    </option>
                  ))}
                </select>
              </label>
              {form.blind_feeding_template_id && (
                <label className="block sm:col-span-2">
                  <span className="text-sm">Target ABW after blind feeding (g)</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={form.blind_feeding_target_abw_g}
                    onChange={(e) => setForm({ ...form, blind_feeding_target_abw_g: e.target.value })}
                    className="mt-1 w-full border rounded px-3 py-2"
                    placeholder="e.g. 1.5"
                  />
                  <span className="text-xs text-slate-500">
                    A sampling day will be created automatically on the day after blind feeding ends.
                  </span>
                </label>
              )}
            </div>
            <div className="space-y-3 border-t pt-3">
              <h3 className="text-sm font-medium">Prediction settings</h3>
              <div className="grid sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-sm">Preparation days</span>
                  <input required type="number" min="0" step="1" value={form.prediction_preparation_day} onChange={(e) => setForm({ ...form, prediction_preparation_day: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm">Max shrimp size (g)</span>
                  <input required type="number" min="0.0001" step="any" value={form.prediction_maximum_shrimp_size_g} onChange={(e) => setForm({ ...form, prediction_maximum_shrimp_size_g: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm">Target FCR</span>
                  <input required type="number" min="0.0001" step="any" value={form.prediction_target_fcr} onChange={(e) => setForm({ ...form, prediction_target_fcr: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm">Max ADG (g/day)</span>
                  <input required type="number" min="0.0001" step="any" value={form.prediction_maximum_adg_g_per_day} onChange={(e) => setForm({ ...form, prediction_maximum_adg_g_per_day: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm">Initial feeding index</span>
                  <input required type="number" min="0.0001" step="any" value={form.prediction_initial_feeding_index} onChange={(e) => setForm({ ...form, prediction_initial_feeding_index: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm">Prediction index increment</span>
                  <input required type="number" min="0.0001" step="any" value={form.prediction_feeding_index_increment} onChange={(e) => setForm({ ...form, prediction_feeding_index_increment: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm">Prediction max index</span>
                  <input required type="number" min="0.0001" step="any" value={form.prediction_maximum_feeding_index} onChange={(e) => setForm({ ...form, prediction_maximum_feeding_index: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm">Stable capacity (kg/m2)</span>
                  <input required type="number" min="0.0001" step="any" value={form.prediction_stable_carrying_capacity_kg_per_m2} onChange={(e) => setForm({ ...form, prediction_stable_carrying_capacity_kg_per_m2: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm">Final capacity (kg/m2)</span>
                  <input required type="number" min="0.0001" step="any" value={form.prediction_final_carrying_capacity_kg_per_m2} onChange={(e) => setForm({ ...form, prediction_final_carrying_capacity_kg_per_m2: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm">Min partial harvest (kg)</span>
                  <input required type="number" min="0.0001" step="any" value={form.prediction_minimum_partial_harvest_biomass_kg} onChange={(e) => setForm({ ...form, prediction_minimum_partial_harvest_biomass_kg: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm">Harvest fixed cost</span>
                  <input required type="number" min="0" step="any" value={form.prediction_harvest_fixed_cost_per_event} onChange={(e) => setForm({ ...form, prediction_harvest_fixed_cost_per_event: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm">PL price/piece</span>
                  <input required type="number" min="0" step="any" value={form.prediction_pl_price_per_piece} onChange={(e) => setForm({ ...form, prediction_pl_price_per_piece: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm">Electricity kW</span>
                  <input required type="number" min="0" step="any" value={form.prediction_electricity_kwh} onChange={(e) => setForm({ ...form, prediction_electricity_kwh: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm">Electricity price/kWh</span>
                  <input required type="number" min="0" step="any" value={form.prediction_electricity_price_per_kwh} onChange={(e) => setForm({ ...form, prediction_electricity_price_per_kwh: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm">Labor/day</span>
                  <input required type="number" min="0" step="any" value={form.prediction_labor_cost_per_day} onChange={(e) => setForm({ ...form, prediction_labor_cost_per_day: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm">Probiotics/day</span>
                  <input required type="number" min="0" step="any" value={form.prediction_probiotics_cost_per_day} onChange={(e) => setForm({ ...form, prediction_probiotics_cost_per_day: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm">Disinfection/day</span>
                  <input required type="number" min="0" step="any" value={form.prediction_disinfection_cost_per_day} onChange={(e) => setForm({ ...form, prediction_disinfection_cost_per_day: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm">Liming/day</span>
                  <input required type="number" min="0" step="any" value={form.prediction_liming_cost_per_day} onChange={(e) => setForm({ ...form, prediction_liming_cost_per_day: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" />
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Feed plan</h4>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, prediction_feed_plan: [...form.prediction_feed_plan, { feed_type_id: feedTypes[0]?.id ?? "", maximum_daily_feed_kg: "", use_until_abw_g: "" }] })}
                    disabled={!feedTypes.length}
                    className="text-xs border px-2 py-1 rounded"
                  >
                    + Feed
                  </button>
                </div>
                {form.prediction_feed_plan.map((row, index) => (
                  <div key={index} className="grid sm:grid-cols-[1fr_120px_120px_52px] gap-2">
                    <select
                      required={feedTypes.length > 0}
                      value={row.feed_type_id}
                      onChange={(e) => {
                        const next = [...form.prediction_feed_plan];
                        next[index] = { ...row, feed_type_id: e.target.value };
                        setForm({ ...form, prediction_feed_plan: next });
                      }}
                      className="border rounded px-3 py-2"
                    >
                      <option value="">Select feed</option>
                      {feedTypes.map((feed) => (
                        <option key={feed.id} value={feed.id}>
                          {feed.brand} {feed.type} - {Number(feed.price_per_kg).toLocaleString(undefined, { maximumFractionDigits: 0 })}/kg
                        </option>
                      ))}
                    </select>
                    <input
                      required
                      type="number"
                      min="0.0001"
                      step="any"
                      value={row.maximum_daily_feed_kg}
                      onChange={(e) => {
                        const next = [...form.prediction_feed_plan];
                        next[index] = { ...row, maximum_daily_feed_kg: e.target.value };
                        setForm({ ...form, prediction_feed_plan: next });
                      }}
                      placeholder="Max kg"
                      className="border rounded px-3 py-2"
                    />
                    <input
                      required
                      type="number"
                      min="0.0001"
                      step="any"
                      value={row.use_until_abw_g}
                      onChange={(e) => {
                        const next = [...form.prediction_feed_plan];
                        next[index] = { ...row, use_until_abw_g: e.target.value };
                        setForm({ ...form, prediction_feed_plan: next });
                      }}
                      placeholder="Max ABW"
                      className="border rounded px-3 py-2"
                    />
                    <button
                      type="button"
                      disabled={form.prediction_feed_plan.length === 1}
                      onClick={() => setForm({ ...form, prediction_feed_plan: form.prediction_feed_plan.filter((_, i) => i !== index) })}
                      className="border rounded px-2 py-2 text-xs disabled:opacity-40"
                    >
                      Del
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Harvest prices</h4>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, prediction_price_points: [...form.prediction_price_points, { count_size: "", price_per_kg: "" }] })}
                    className="text-xs border px-2 py-1 rounded"
                  >
                    + Price
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {form.prediction_price_points.map((row, index) => (
                    <div key={index} className="grid grid-cols-[1fr_1fr_52px] gap-2">
                      <input
                        required
                        type="number"
                        min="0.0001"
                        step="any"
                        value={row.count_size}
                        onChange={(e) => {
                          const next = [...form.prediction_price_points];
                          next[index] = { ...row, count_size: e.target.value };
                          setForm({ ...form, prediction_price_points: next });
                        }}
                        placeholder="Count"
                        className="border rounded px-3 py-2"
                      />
                      <input
                        required
                        type="number"
                        min="0.0001"
                        step="any"
                        value={row.price_per_kg}
                        onChange={(e) => {
                          const next = [...form.prediction_price_points];
                          next[index] = { ...row, price_per_kg: e.target.value };
                          setForm({ ...form, prediction_price_points: next });
                        }}
                        placeholder="Price/kg"
                        className="border rounded px-3 py-2"
                      />
                      <button
                        type="button"
                        disabled={form.prediction_price_points.length === 1}
                        onClick={() => setForm({ ...form, prediction_price_points: form.prediction_price_points.filter((_, i) => i !== index) })}
                        className="border rounded px-2 py-2 text-xs disabled:opacity-40"
                      >
                        Del
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="bg-primary text-white px-4 py-2 rounded">Create</button>
              <button type="button" onClick={() => setShowForm(false)} className="border px-4 py-2 rounded">
                Cancel
              </button>
            </div>
          </form>
        )}

        {cycles.length === 0 ? (
          <p className="text-slate-500 text-sm">No cycles yet.</p>
        ) : (
          <ul className="grid gap-3">
            {cycles.map((c) => (
              <li key={c.id} className="bg-white rounded-lg shadow p-4">
                {editingId === c.id ? (
                  <form onSubmit={(e) => saveEdit(e, c.id)} className="space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-sm">Name</span>
                        <input
                          autoFocus
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="mt-1 w-full border rounded px-2 py-1"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm">Status</span>
                        <select
                          value={editForm.status}
                          onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                          className="mt-1 w-full border rounded px-2 py-1"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-sm">Target final DOC</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="e.g. 120"
                          value={editForm.target_doc}
                          onChange={(e) =>
                            setEditForm({ ...editForm, target_doc: e.target.value })
                          }
                          className="mt-1 w-full border rounded px-2 py-1"
                        />
                      </label>
                      {editForm.status !== "active" ? (
                        <label className="block">
                          <span className="text-sm">Actual final DOC</span>
                          <input
                            required
                            type="number"
                            min="1"
                            step="1"
                            value={editForm.actual_doc}
                            onChange={(e) =>
                              setEditForm({ ...editForm, actual_doc: e.target.value })
                            }
                            className="mt-1 w-full border rounded px-2 py-1"
                          />
                        </label>
                      ) : null}
                      <label className="block">
                        <span className="text-sm">Maximum daily feed capacity (kg)</span>
                        <input
                          type="number"
                          step="any"
                          value={editForm.maximum_daily_feed_capacity_kg}
                          onChange={(e) =>
                            setEditForm({ ...editForm, maximum_daily_feed_capacity_kg: e.target.value })
                          }
                          className="mt-1 w-full border rounded px-2 py-1"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm">Maximum feeding index</span>
                        <input
                          type="number"
                          step="any"
                          value={editForm.maximum_feeding_index}
                          onChange={(e) =>
                            setEditForm({ ...editForm, maximum_feeding_index: e.target.value })
                          }
                          onBlur={(e) =>
                            setEditForm({ ...editForm, maximum_feeding_index: formatIndex(e.target.value) })
                          }
                          className="mt-1 w-full border rounded px-2 py-1"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm">Feeding index increment</span>
                        <input
                          type="number"
                          step="any"
                          value={editForm.feeding_index_increment}
                          onChange={(e) =>
                            setEditForm({ ...editForm, feeding_index_increment: e.target.value })
                          }
                          onBlur={(e) =>
                            setEditForm({
                              ...editForm,
                              feeding_index_increment: (optionalNumber(e.target.value) ?? 0.01).toFixed(3),
                            })
                          }
                          className="mt-1 w-full border rounded px-2 py-1"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm">Stable carrying capacity (kg/m3)</span>
                        <input
                          type="number"
                          step="any"
                          value={editForm.stable_carrying_capacity_kg_per_m3}
                          onChange={(e) =>
                            setEditForm({ ...editForm, stable_carrying_capacity_kg_per_m3: e.target.value })
                          }
                          className="mt-1 w-full border rounded px-2 py-1"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm">Final carrying capacity (kg/m3)</span>
                        <input
                          type="number"
                          step="any"
                          value={editForm.final_carrying_capacity_kg_per_m3}
                          onChange={(e) =>
                            setEditForm({ ...editForm, final_carrying_capacity_kg_per_m3: e.target.value })
                          }
                          className="mt-1 w-full border rounded px-2 py-1"
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-sm">Notes</span>
                      <textarea
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        rows={2}
                        className="mt-1 w-full border rounded px-2 py-1"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button className="text-xs bg-primary text-white px-3 py-1 rounded">
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-xs border px-3 py-1 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <Link href={`/cycles/${c.id}`} className="block">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs uppercase tracking-wide text-slate-500">
                          {c.status}
                        </span>
                      </div>
                      <div className="text-sm text-slate-500">
                        Started {c.start_date}
                        {plannedDateToDoc(c.start_date, c.planned_end_date) && (
                          <> &middot; Target DOC {plannedDateToDoc(c.start_date, c.planned_end_date)}</>
                        )}
                        {" "}&middot; {c.initial_population.toLocaleString()} stocked
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Index +{Number(c.feeding_index_increment).toFixed(3)}
                        {c.maximum_feeding_index
                          ? ` - max ${Number(c.maximum_feeding_index).toFixed(3)}`
                          : ""}
                      </div>
                      {(c.maximum_daily_feed_capacity_kg ||
                        c.stable_carrying_capacity_kg_per_m3 ||
                        c.final_carrying_capacity_kg_per_m3) && (
                        <div className="text-xs text-slate-400 mt-1">
                          {[
                            formatKg(c.maximum_daily_feed_capacity_kg)
                              ? `Max feed ${formatKg(c.maximum_daily_feed_capacity_kg)}`
                              : null,
                            formatCapacity(c.stable_carrying_capacity_kg_per_m3)
                              ? `Stable ${formatCapacity(c.stable_carrying_capacity_kg_per_m3)}`
                              : null,
                            formatCapacity(c.final_carrying_capacity_kg_per_m3)
                              ? `Final ${formatCapacity(c.final_carrying_capacity_kg_per_m3)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" - ")}
                        </div>
                      )}
                      {c.notes && (
                        <div className="text-xs text-slate-400 mt-1">{c.notes}</div>
                      )}
                    </Link>
                    {canManage(role) && (
                    <div className="flex gap-3 mt-2">
                      <button
                        onClick={() => {
                          setEditingId(c.id);
                          const fallbackEndDate =
                            c.planned_end_date && c.planned_end_date < todayIso()
                              ? c.planned_end_date
                              : todayIso();
                          setEditForm({
                            name: c.name,
                            status: c.status,
                            target_doc: plannedDateToDoc(c.start_date, c.planned_end_date),
                            actual_doc: plannedDateToDoc(
                              c.start_date,
                              c.actual_end_date ?? fallbackEndDate,
                            ),
                            maximum_daily_feed_capacity_kg: c.maximum_daily_feed_capacity_kg ?? "",
                            stable_carrying_capacity_kg_per_m3:
                              c.stable_carrying_capacity_kg_per_m3 ?? "",
                            final_carrying_capacity_kg_per_m3:
                              c.final_carrying_capacity_kg_per_m3 ?? "",
                            feeding_index_increment: Number(c.feeding_index_increment).toFixed(3),
                            maximum_feeding_index: formatIndex(c.maximum_feeding_index),
                            notes: c.notes ?? "",
                          });
                          setShowForm(false);
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => deleteCycle(c.id, c.name)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        delete
                      </button>
                    </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
