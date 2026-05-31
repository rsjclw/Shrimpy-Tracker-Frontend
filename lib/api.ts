"use client";

import { getSupabase } from "./supabase";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function authHeader(): Promise<HeadersInit> {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(await authHeader()),
    ...(init.headers ?? {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---- Types ----
export type FarmRole = "admin" | "owner" | "operator" | "viewer";
export type Farm = { id: string; name: string; created_at: string; role: FarmRole };
export type FarmMember = {
  farm_id: string;
  email: string;
  user_id: string | null;
  role: Exclude<FarmRole, "admin">;
  created_at: string;
};
export type RegisteredUser = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
};
export type Grid = { id: string; farm_id: string; name: string; notes: string | null; created_at: string };
export type Pond = {
  id: string;
  grid_id: string;
  name: string;
  area_m2: string | null;
};
export type HarvestPricePoint = {
  count_size: string;
  price_per_kg: string;
};
export type CycleFeedPlanRow = {
  feed_type_id: string;
  brand: string;
  type: string;
  price_per_kg: string;
  use_until_abw_g: string;
  notes: string | null;
};
export type Cycle = {
  id: string;
  pond_id: string;
  name: string;
  start_date: string;
  planned_end_date: string | null;
  actual_end_date: string | null;
  initial_population: number;
  initial_abw_g: string;
  maximum_daily_feed_capacity_kg: string | null;
  stable_carrying_capacity_kg_per_m3: string | null;
  final_carrying_capacity_kg_per_m3: string | null;
  stable_carrying_capacity_kg_per_m2: string | null;
  final_carrying_capacity_kg_per_m2: string | null;
  feeding_index_increment: string;
  maximum_feeding_index: string | null;
  harvest_price_points: HarvestPricePoint[];
  pl_brand: string | null;
  pl_price_per_piece: string | null;
  electricity_kwh_per_day: string | null;
  electricity_price_per_kwh: string | null;
  probiotics_cost_per_day: string | null;
  disinfection_cost_per_day: string | null;
  liming_cost_per_day: string | null;
  minimum_partial_harvest_biomass_kg: string | null;
  feed_plan: CycleFeedPlanRow[];
  status: string;
  notes: string | null;
  blind_feeding_template_id: string | null;
  blind_feeding_target_abw_g: string | null;
};
export type FeedAdditive = { id: number; farm_id: string; name: string; dosage_gr_per_kg: string | null };
export type FeedingAdditive = { name: string; dosage_gr_per_kg: number };
export type FeedType = {
  id: string;
  farm_id: string;
  brand: string;
  type: string;
  price_per_kg: string;
  notes: string | null;
  created_at: string;
};
export type BlindFeedingTemplate = {
  id: string;
  farm_id: string;
  name: string;
  daily_feed_per_100k: number[];
  duration_days: number;
  cumulative_feed_per_100k: number;
  created_at: string;
};
export type FeedingFeedType = {
  feed_type_id: string;
  brand: string;
  type: string;
  price_per_kg: string;
  percentage: string;
  notes: string | null;
};
export type Feeding = {
  id: string;
  daily_log_id: string;
  feed_time: string;
  amount_kg: string;
  duration_min: number | null;
  additives: FeedingAdditive[];
  feed_types: FeedingFeedType[];
  notes: string | null;
};
export type Harvest = {
  id: string;
  daily_log_id: string;
  harvest_time: string;
  biomass_kg: string;
  sampled_abw_g: string;
  price_per_kg: string;
  estimated_count: number;
  notes: string | null;
};
export type WaterParameters = {
  id: string;
  daily_log_id: string;
  do_am: string | null;
  do_pm: string | null;
  ph_am: string | null;
  ph_pm: string | null;
  salinity: string | null;
  tan: string | null;
  nitrite: string | null;
  phosphate: string | null;
  calcium: string | null;
  magnesium: string | null;
  alkalinity: string | null;
};
export type Treatment = {
  id: string;
  daily_log_id: string;
  treatment_time: string;
  action: string;
  worker: string | null;
  notes: string | null;
};
export type DayMetrics = {
  doc: number;
  daily_feed_kg: string;
  feeding_index: string | null;
  cumulative_feed_kg: string;
  cumulative_feed_start_kg: string;
  cumulative_feed_end_kg: string;
  abw_g: string | null;
  estimated_adg_g_per_day: string | null;
  estimated_population: number | null;
  estimated_biomass_kg: string | null;
  harvest_biomass_kg: string;
  fcr: string | null;
};
export type SamplingMetrics = {
  adg_g_per_day: string | null;
  abw_gain_g: string | null;
  feed_since_previous_sample_kg: string | null;
  sample_fcr: string | null;
};
export type DayView = {
  daily_log_id: string | null;
  cycle_id: string;
  date: string;
  abw_g: string | null;
  abw_sample_time: string | null;
  notes: string | null;
  sampling: SamplingMetrics;
  default_feed_types: FeedingFeedType[];
  feedings: Feeding[];
  harvests: Harvest[];
  water: WaterParameters | null;
  treatments: Treatment[];
  metrics: DayMetrics;
};
export type TrendPoint = {
  date: string;
  value: string | null;
  is_future: boolean;
  is_sampling_day: boolean;
  is_harvest_day: boolean;
};
export type TrendSeries = { metric: string; points: TrendPoint[] };
export type BatchImportFeeding = { feed_time: string; amount_kg: number };
export type BatchImportDay = { date: string; abw_g?: number | null; feedings: BatchImportFeeding[] };
export type BatchImportResult = {
  days: number;
  feedings_created: number;
  feedings_updated: number;
  feedings_deleted: number;
  abw_samples_written: number;
};
export type PredictionBaseline = {
  previous_biomass_kg: string;
  feed_since_previous_sample_start_kg: string;
  estimated_population: number;
  harvested_biomass_since_previous_sample_kg: string;
};

// ---- Endpoints ----
export const api = {
  listFarms: () => request<Farm[]>("/farms"),
  getFarm: (id: string) => request<Farm>(`/farms/${id}`),
  createFarm: (b: { name: string }) =>
    request<Farm>("/farms", { method: "POST", body: JSON.stringify(b) }),
  updateFarm: (id: string, b: { name: string }) =>
    request<Farm>(`/farms/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteFarm: (id: string) => request<void>(`/farms/${id}`, { method: "DELETE" }),
  listFarmMembers: (farmId: string) => request<FarmMember[]>(`/farms/${farmId}/members`),
  upsertFarmMember: (
    farmId: string,
    b: { email: string; role: Exclude<FarmRole, "admin"> },
  ) =>
    request<FarmMember>(`/farms/${farmId}/members`, {
      method: "POST",
      body: JSON.stringify(b),
    }),
  deleteFarmMember: (farmId: string, email: string) =>
    request<void>(`/farms/${farmId}/members/${encodeURIComponent(email)}`, { method: "DELETE" }),
  listRegisteredUsers: () => request<RegisteredUser[]>("/farms/registered-users"),

  listGrids: (farmId?: string) => request<Grid[]>(`/grids${farmId ? `?farm_id=${farmId}` : ""}`),
  createGrid: (b: { farm_id: string; name: string; notes?: string }) =>
    request<Grid>("/grids", { method: "POST", body: JSON.stringify(b) }),
  updateGrid: (id: string, b: { name: string; notes?: string }) =>
    request<Grid>(`/grids/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteGrid: (id: string) => request<void>(`/grids/${id}`, { method: "DELETE" }),
  listGridPonds: (gridId: string) => request<Pond[]>(`/grids/${gridId}/ponds`),

  updatePond: (id: string, b: { name: string; area_m2?: number }) =>
    request<Pond>(`/ponds/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deletePond: (id: string) => request<void>(`/ponds/${id}`, { method: "DELETE" }),

  listPonds: (gridId?: string, farmId?: string) =>
    request<Pond[]>(
      `/ponds${gridId ? `?grid_id=${gridId}` : farmId ? `?farm_id=${farmId}` : ""}`,
    ),
  createPond: (b: { grid_id: string; name: string; area_m2?: number }) =>
    request<Pond>("/ponds", { method: "POST", body: JSON.stringify(b) }),
  getPond: (id: string) => request<Pond>(`/ponds/${id}`),
  listPondCycles: (pondId: string) => request<Cycle[]>(`/ponds/${pondId}/cycles`),

  getCycle: (id: string) => request<Cycle>(`/cycles/${id}`),
  updateCycle: (
    id: string,
    b: {
      name?: string;
      planned_end_date?: string;
      actual_end_date?: string;
      status?: string;
      maximum_daily_feed_capacity_kg?: number | null;
      stable_carrying_capacity_kg_per_m3?: number | null;
      final_carrying_capacity_kg_per_m3?: number | null;
      stable_carrying_capacity_kg_per_m2?: number | null;
      final_carrying_capacity_kg_per_m2?: number | null;
      feeding_index_increment?: number | null;
      maximum_feeding_index?: number | null;
      harvest_price_points?: { count_size: number; price_per_kg: number }[];
      pl_brand?: string | null;
      pl_price_per_piece?: number | null;
      electricity_kwh_per_day?: number | null;
      electricity_price_per_kwh?: number | null;
      probiotics_cost_per_day?: number | null;
      disinfection_cost_per_day?: number | null;
      liming_cost_per_day?: number | null;
      minimum_partial_harvest_biomass_kg?: number | null;
      feed_plan?: {
        feed_type_id: string;
        brand: string;
        type: string;
        price_per_kg: number;
        use_until_abw_g: number;
        notes?: string | null;
      }[];
      notes?: string;
    },
  ) => request<Cycle>(`/cycles/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteCycle: (id: string) => request<void>(`/cycles/${id}`, { method: "DELETE" }),
  createCycle: (b: {
    pond_id: string;
    name: string;
    start_date: string;
    initial_population: number;
    initial_abw_g: number;
    blind_feeding_template_id?: string;
    blind_feeding_target_abw_g?: number;
    maximum_daily_feed_capacity_kg?: number;
    stable_carrying_capacity_kg_per_m3?: number;
    final_carrying_capacity_kg_per_m3?: number;
    stable_carrying_capacity_kg_per_m2?: number;
    final_carrying_capacity_kg_per_m2?: number;
    feeding_index_increment?: number;
    maximum_feeding_index?: number;
    harvest_price_points?: { count_size: number; price_per_kg: number }[];
    pl_brand?: string | null;
    pl_price_per_piece?: number | null;
    electricity_kwh_per_day?: number | null;
    electricity_price_per_kwh?: number | null;
    probiotics_cost_per_day?: number | null;
    disinfection_cost_per_day?: number | null;
    liming_cost_per_day?: number | null;
    minimum_partial_harvest_biomass_kg?: number | null;
    feed_plan?: {
      feed_type_id: string;
      brand: string;
      type: string;
      price_per_kg: number;
      use_until_abw_g: number;
      notes?: string | null;
    }[];
    planned_end_date?: string;
    notes?: string;
  }) => request<Cycle>("/cycles", { method: "POST", body: JSON.stringify(b) }),
  getCycleDay: (cycleId: string, day: string) =>
    request<DayView>(`/cycles/${cycleId}/days/${day}`),
  upsertCycleDay: (
    cycleId: string,
    day: string,
    b: { abw_g?: number | null; abw_sample_time?: string | null; notes?: string | null },
  ) =>
    request<DayView>(`/cycles/${cycleId}/days/${day}`, {
      method: "PUT",
      body: JSON.stringify(b),
    }),
  getCycleTrend: (cycleId: string, metric: string, from: string, to: string) =>
    request<TrendSeries>(
      `/cycles/${cycleId}/trends?metric=${metric}&from=${from}&to=${to}`,
    ),
  getPredictionBaseline: (cycleId: string, startDate: string) =>
    request<PredictionBaseline>(
      `/cycles/${cycleId}/prediction-baseline?start_date=${startDate}`,
    ),
  createSample: (cycleId: string, b: { date: string; population: number; method?: string }) =>
    request(`/cycles/${cycleId}/samples`, { method: "POST", body: JSON.stringify(b) }),

  createFeeding: (
    dailyLogId: string,
    b: {
      feed_time: string;
      amount_kg: number;
      duration_min?: number;
      additives?: FeedingAdditive[];
      feed_types?: FeedingFeedType[];
      notes?: string;
    },
  ) =>
    request<Feeding>(`/days/${dailyLogId}/feedings`, {
      method: "POST",
      body: JSON.stringify(b),
    }),
  updateFeeding: (id: string, b: Partial<Omit<Feeding, "id" | "daily_log_id">>) =>
    request<Feeding>(`/feedings/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteFeeding: (id: string) => request<void>(`/feedings/${id}`, { method: "DELETE" }),

  createHarvest: (
    dailyLogId: string,
    b: {
      harvest_time: string;
      biomass_kg: number;
      sampled_abw_g: number;
      price_per_kg: number;
      notes?: string;
    },
  ) =>
    request<Harvest>(`/days/${dailyLogId}/harvests`, {
      method: "POST",
      body: JSON.stringify(b),
    }),
  updateHarvest: (
    id: string,
    b: {
      harvest_time?: string;
      biomass_kg?: number;
      sampled_abw_g?: number;
      price_per_kg?: number;
      notes?: string | null;
    },
  ) =>
    request<Harvest>(`/harvests/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteHarvest: (id: string) => request<void>(`/harvests/${id}`, { method: "DELETE" }),

  upsertWater: (dailyLogId: string, b: Partial<Omit<WaterParameters, "id" | "daily_log_id">>) =>
    request<WaterParameters>(`/days/${dailyLogId}/water`, {
      method: "PUT",
      body: JSON.stringify(b),
    }),

  createTreatment: (
    dailyLogId: string,
    b: { treatment_time: string; action: string; worker?: string; notes?: string },
  ) =>
    request<Treatment>(`/days/${dailyLogId}/treatments`, {
      method: "POST",
      body: JSON.stringify(b),
    }),
  updateTreatment: (id: string, b: Partial<Omit<Treatment, "id" | "daily_log_id">>) =>
    request<Treatment>(`/treatments/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteTreatment: (id: string) => request<void>(`/treatments/${id}`, { method: "DELETE" }),

  listFeedTypes: (farmId?: string) => request<FeedType[]>(`/feed-types${farmId ? `?farm_id=${farmId}` : ""}`),
  createFeedType: (b: { farm_id: string; brand: string; type: string; price_per_kg: number; notes?: string | null }) =>
    request<FeedType>("/feed-types", { method: "POST", body: JSON.stringify(b) }),
  updateFeedType: (
    id: string,
    b: { brand?: string; type?: string; price_per_kg?: number; notes?: string | null },
  ) => request<FeedType>(`/feed-types/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteFeedType: (id: string) => request<void>(`/feed-types/${id}`, { method: "DELETE" }),

  listBlindFeedingTemplates: (farmId?: string) =>
    request<BlindFeedingTemplate[]>(`/blind-feeding-templates${farmId ? `?farm_id=${farmId}` : ""}`),
  createBlindFeedingTemplate: (b: { farm_id: string; name: string; daily_feed_per_100k: number[] }) =>
    request<BlindFeedingTemplate>("/blind-feeding-templates", {
      method: "POST",
      body: JSON.stringify(b),
    }),
  updateBlindFeedingTemplate: (
    id: string,
    b: { name: string; daily_feed_per_100k: number[] },
  ) =>
    request<BlindFeedingTemplate>(`/blind-feeding-templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(b),
    }),
  deleteBlindFeedingTemplate: (id: string) =>
    request<void>(`/blind-feeding-templates/${id}`, { method: "DELETE" }),

  batchImportFeedingsAbw: (
    cycleId: string,
    b: { replace_feedings: boolean; abw_sample_time: string; days: BatchImportDay[] },
  ) =>
    request<BatchImportResult>(`/cycles/${cycleId}/batch-import/feedings-abw`, {
      method: "POST",
      body: JSON.stringify(b),
    }),

  listAdditives: (farmId?: string) => request<FeedAdditive[]>(`/additives${farmId ? `?farm_id=${farmId}` : ""}`),
  createAdditive: (b: { farm_id: string; name: string; dosage_gr_per_kg?: number | null }) =>
    request<FeedAdditive>("/additives", { method: "POST", body: JSON.stringify(b) }),
  updateAdditive: (id: number, b: { name?: string; dosage_gr_per_kg?: number | null }) =>
    request<FeedAdditive>(`/additives/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteAdditive: (id: number) => request<void>(`/additives/${id}`, { method: "DELETE" }),
};
