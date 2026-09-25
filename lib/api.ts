"use client";

import { clearSession, getToken, type AuthUser } from "./auth";
import { markAllStale } from "./cache";

export type { AuthUser } from "./auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "/backend";

function authHeader(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Pull the backend's `{detail}` out of an error body when there is one. */
function errorMessage(status: number, text: string) {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // not JSON
  }
  return `${status}: ${text}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...authHeader(),
    ...(init.headers ?? {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    if (res.status === 401 && path !== "/auth/login") {
      // Token missing, expired or revoked: drop it and send the user back to sign in.
      clearSession();
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }
    throw new Error(errorMessage(res.status, text));
  }
  // Any successful write can change what cached reads would return.
  if ((init.method ?? "GET").toUpperCase() !== "GET") markAllStale();
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
  is_active: boolean;
  must_change_password: boolean;
};
export type LoginResponse = { access_token: string; token_type: "bearer"; user: AuthUser };
export type CreatedUser = { user: RegisteredUser; temporary_password: string | null };
export type PasswordReset = { temporary_password: string | null };
export type Grid = {
  id: string;
  farm_id: string;
  name: string;
  notes: string | null;
  created_at: string;
  latitude: string | null;
  longitude: string | null;
  // Resolved from the coordinates by the backend; read-only here.
  timezone: string | null;
  elevation_m: string | null;
  weather_synced_at: string | null;
};
export type Pond = {
  id: string;
  grid_id: string;
  name: string;
  area_m2: string | null;
  default_feed_time: string | null;
  /** The warehouse this pond draws from; null means it moves no stock. */
  warehouse_id: string | null;
};
export type PredictionConfig = {
  cycle: {
    preparation_day: number;
    maximum_shrimp_size_g: number;
  };
  growth: {
    target_fcr: number;
    maximum_adg_g_per_day: number;
    initial_feeding_index: number;
    feeding_index_increment: number;
    maximum_feeding_index: number;
  };
  capacity: {
    stable_carrying_capacity_kg_per_m2: number;
    final_carrying_capacity_kg_per_m2: number;
  };
  harvest: {
    minimum_partial_harvest_biomass_kg: number;
    harvest_fixed_cost_per_event: number;
  };
  prices: {
    harvest_price_points: { count_size: number; price_per_kg: number }[];
  };
  costs: {
    pl_price_per_piece: number;
    electricity_kwh: number;
    electricity_price_per_kwh: number;
    labor_cost_per_day: number;
    probiotics_cost_per_day: number;
    disinfection_cost_per_day: number;
    liming_cost_per_day: number;
  };
  feed_plan: { product_id: string; maximum_daily_feed_kg: number; use_until_abw_g: number }[];
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
  feeding_index_increment: string;
  maximum_feeding_index: string | null;
  status: string;
  notes: string | null;
  blind_feeding_template_id: string | null;
  blind_feeding_target_abw_g: string | null;
  prediction_config: PredictionConfig | null;
};
/** An additive on a feeding: by catalog id or name; leave the dose out to use the cycle's last dose. */
export type FeedingAdditiveIn = { product_id?: string; name?: string; dose_per_kg?: number };
/** As stored on a feeding. product_id is null only for entries written before the catalogs merged. */
export type FeedingAdditive = {
  product_id: string | null;
  name: string;
  dose_per_kg: string;
  /** What the dose was in when logged: g, mL or pcs per kg of feed. */
  dose_unit: string;
  amount_g: string | null;
};
/** The dose a cycle is on for an entry: whatever it last used. No stored default. */
export type AdditiveDose = {
  product_id: string | null;
  name: string;
  dose_per_kg: string;
  /** g, mL or pcs, per kg of feed - follows what the product is counted in. */
  dose_unit: string;
  last_used_date: string;
};
export type AdditiveUsage = { date: string; product_id: string | null; name: string; feed_kg: string; amount_g: string; dosage_gr_per_kg: string };
export type BlindFeedingTemplate = {
  id: string;
  farm_id: string;
  name: string;
  daily_feed_per_100k: number[];
  duration_days: number;
  cumulative_feed_per_100k: number;
  created_at: string;
};
/**
 * One feed on a feeding and its share of the amount. `product_id`/`name`/
 * `price_per_unit` are current; `brand`/`type`/`price_per_kg` come back on
 * feedings written before the catalogs merged.
 */
export type FeedingFeedType = {
  product_id: string | null;
  name: string;
  price_per_unit: string | null;
  percentage: string;
  notes: string | null;
  feed_type_id?: string | null;
  brand?: string | null;
  type?: string | null;
  price_per_kg?: string | null;
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
  updated_at?: string | null;
  updated_by?: string | null;
  updated_by_type?: string | null;
};
export type InventoryCategory =
  | "feed"
  | "supplements"
  | "probiotics"
  | "lime_minerals"
  | "disinfectants"
  | "medicine"
  | "equipment"
  | "other";
/** A stock row: which item, in which warehouse, how much. `name`/`category`/`unit` are
 * read-only copies of the item's own fields, folded in by the server. */
export type InventoryItem = {
  id: string;
  warehouse_id: string;
  product_id: string;
  quantity: string;
  low_stock_level: string | null;
  location_note: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  name: string;
  category: InventoryCategory;
  unit: string;
};
/**
 * One entry in the farm catalog, in two kinds shown in different places:
 * - "product" is what you buy and keep (Biolacto) - managed on the inventory page.
 * - "formula" is a treatment formula: what goes in the pond (Lactobacillus, Mix A),
 *   managed in farm settings. Never stocked; applying it draws on its products.
 *
 * Distinct from `Treatment`, which is the log of what was applied on a day.
 */
export type ProductKind = "product" | "formula";
export type ProductUnit = { id: string; unit: string; factor_to_base: string };
export type ProductComponent = {
  id: string;
  component_product_id: string;
  quantity: string;
  component_name: string | null;
  component_base_unit: string | null;
};
export type Product = {
  id: string;
  farm_id: string;
  name: string;
  category: InventoryCategory;
  kind: ProductKind;
  base_unit: string;
  /** What one base unit costs. Set on products; null on formulas. */
  price_per_unit: string | null;
  /** A formula's cost, summed from its ingredients. Null if any of them has no price. */
  cost_per_unit: string | null;
  /** What a dose of this is measured in, per kg of feed: g, mL or pcs. */
  dose_unit: string;
  /** False for water and anything else named in a recipe but never counted. */
  tracked: boolean;
  active: boolean;
  notes: string | null;
  units: ProductUnit[];
  components: ProductComponent[];
  created_at: string;
  updated_at: string;
};
export type ProductInput = {
  name: string;
  category: InventoryCategory;
  kind: ProductKind;
  base_unit: string;
  price_per_unit: number | null;
  tracked: boolean;
  active: boolean;
  notes: string | null;
  units: { unit: string; factor_to_base: number }[];
  components: { component_product_id: string; quantity: number }[];
};
/** One product a dose resolves to, with what the warehouse actually holds. */
export type ExpansionLine = {
  product_id: string;
  name: string;
  amount: string;
  unit: string;
  in_stock: string | null;
  enough: boolean;
};
export type Expansion = { product_id: string; amount: string; unit: string; lines: ExpansionLine[] };
export type Warehouse = {
  id: string;
  grid_id: string;
  name: string;
  notes: string | null;
  created_at: string;
  /** Ponds that draw feed and treatments from here. */
  pond_ids: string[];
};
export type WarehouseInventory = Warehouse & { items: InventoryItem[] };
export type InventoryItemInput = {
  low_stock_level: number | null;
  location_note: string | null;
  notes?: string | null;
};
export type MovementKind = "receive" | "use" | "count";
export type InventoryMovement = {
  id: string;
  item_id: string;
  kind: MovementKind;
  delta: string;
  quantity_after: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type Harvest = {
  id: string;
  daily_log_id: string;
  harvest_time: string;
  biomass_kg: string;
  sampled_abw_g: string;
  total_price: string;
  estimated_count: number;
  notes: string | null;
};
export type WaterParameterSourceKey =
  | "do_am"
  | "do_pm"
  | "ph_am"
  | "ph_pm"
  | "water_clarity_am"
  | "water_clarity_pm"
  | "salinity"
  | "tan"
  | "nitrite"
  | "phosphate"
  | "calcium"
  | "magnesium"
  | "alkalinity"
  | "plankton_ga"
  | "plankton_bga"
  | "plankton_diatom"
  | "plankton_yga"
  | "plankton_eugle"
  | "plankton_dino"
  | "plankton_zoo"
  | "plankton_protozoa"
  | "yellow_vibrio"
  | "green_vibrio"
  | "black_vibrio"
  | "tbc";
export type WaterParametersUpsert = Partial<Record<WaterParameterSourceKey, number | null>>;
export type WaterParameters = Record<WaterParameterSourceKey, string | null> & {
  id: string;
  daily_log_id: string;
  total_plankton: string | null;
  total_vibrio_count: string | null;
  vibrio_percentage: string | null;
};
/** A product line on a treatment, resolved to what left the warehouse when it was saved. */
export type TreatmentItem = {
  product_id: string;
  name: string;
  amount: string;
  unit: string;
  base_amount: string;
  base_unit: string;
};
export type Treatment = {
  id: string;
  daily_log_id: string;
  treatment_time: string;
  action: string;
  worker: string | null;
  notes: string | null;
  /** Which warehouse the stock came out of; null for a treatment logged as text only. */
  warehouse_id: string | null;
  items: TreatmentItem[];
};
/** What a client sends: `unit` defaults to the product's own base unit. */
export type TreatmentItemInput = { product_id: string; amount: number; unit?: string | null };
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
export type LunarDay = {
  illumination: number; // 0-1, display only
  waxing: boolean;
  days_to_full: number; // signed; negative means the full moon has passed
  days_to_new: number;
  window: "full" | "new" | null;
  is_peak: boolean;
  alert: "full" | "new" | null;
};
export type DayEnvironment = {
  date: string;
  temp_min_c: string | null;
  temp_max_c: string | null;
  temp_mean_c: string | null;
  shortwave_radiation_sum_mj: string | null;
  sunshine_duration_hours: string | null;
  cloud_cover_daylight_pct: string | null;
  precipitation_mm: string | null;
  precipitation_hours: string | null;
  precipitation_probability_max_pct: string | null;
  is_forecast: boolean;
  source: string;
  fetched_at: string | null;
};
export type GridEnvironment = {
  grid_id: string;
  timezone: string | null;
  days: DayEnvironment[];
};
export type EnvironmentRefresh = {
  grid_id: string;
  days_written: number;
  timezone: string | null;
  synced_at: string | null;
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
  lunar: LunarDay;
  environment: DayEnvironment | null;
};
export type DaySummary = {
  date: string;
  doc: number;
  daily_feed_kg: string;
  abw_g: string | null;
  estimated_population: number | null;
  estimated_biomass_kg: string | null;
  harvest_biomass_kg: string;
  fcr: string | null;
};
export type PopulationSample = {
  id: string;
  cycle_id: string;
  date: string;
  population: number;
  method: string | null;
  notes: string | null;
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
  initial_abw_g: string | null;
};
export type PredictionRequest = {
  start_date: string;
  target_doc: number;
  optimize_partial_harvests: boolean;
};
export type PredictionResult = {
  summary: {
    initial_abw_g: string;
    final_doc: number;
    final_date: string;
    final_abw_g: string;
    final_biomass_kg: string;
    total_harvested_biomass_kg: string;
    cumulative_feed_kg: string;
    simulated_feed_kg: string;
    final_revenue: string;
    partial_revenue: string;
    total_revenue: string;
    feed_cost: string;
    total_costs: string;
    profit: string;
    profit_per_day: string;
    harvest_count_size: string;
    harvest_price_per_kg: string;
    stop_reason: string;
  };
  daily_rows: {
    date: string;
    doc: number;
    feed_name: string;
    feeding_index: string;
    starting_population: number;
    ending_population: number;
    starting_abw_g: string;
    ending_abw_g: string;
    starting_biomass_kg: string;
    ending_biomass_kg: string;
    actual_feed_kg: string;
    cumulative_feed_kg: string;
    count_size: string;
    harvest_price_per_kg: string;
    partial_harvest_kg: string;
    stop_reason: string;
    feedings: { feed_time: string; amount_kg: string; feed_types: FeedingFeedType[] }[];
  }[];
  partial_harvests: {
    date: string;
    doc: number;
    biomass_kg: string;
    sampled_abw_g: string;
    count_size: string;
    price_per_kg: string;
    total_price: string;
    estimated_count: number;
  }[];
  generated: {
    days: number;
    feedings_created: number;
    harvests_created: number;
    daily_logs_deleted: number;
  } | null;
};
export type PredictionJob = {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "applied";
  error: string | null;
  result: PredictionResult | null;
  created_at: string;
  updated_at: string;
};

// ---- Endpoints ----
export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<AuthUser>("/auth/me"),
  changePassword: (current_password: string, new_password: string) =>
    request<AuthUser>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),
  createUser: (email: string, password?: string) =>
    request<CreatedUser>("/auth/users", {
      method: "POST",
      body: JSON.stringify(password ? { email, password } : { email }),
    }),
  resetUserPassword: (id: string, password?: string) =>
    request<PasswordReset>(`/auth/users/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify(password ? { password } : {}),
    }),
  setUserActive: (id: string, is_active: boolean) =>
    request<RegisteredUser>(`/auth/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active }),
    }),

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
  createGrid: (b: {
    farm_id: string;
    name: string;
    notes?: string;
    latitude?: number | null;
    longitude?: number | null;
  }) => request<Grid>("/grids", { method: "POST", body: JSON.stringify(b) }),
  // Omit latitude/longitude to leave the grid's location untouched.
  updateGrid: (
    id: string,
    b: { name: string; notes?: string; latitude?: number | null; longitude?: number | null },
  ) => request<Grid>(`/grids/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteGrid: (id: string) => request<void>(`/grids/${id}`, { method: "DELETE" }),
  getGridEnvironment: (gridId: string, from: string, to: string) =>
    request<GridEnvironment>(`/grids/${gridId}/environment?from=${from}&to=${to}`),
  refreshGridEnvironment: (gridId: string) =>
    request<EnvironmentRefresh>(`/grids/${gridId}/environment/refresh`, { method: "POST" }),
  listGridPonds: (gridId: string) => request<Pond[]>(`/grids/${gridId}/ponds`),

  updatePond: (id: string, b: { name: string; area_m2?: number; default_feed_time?: string }) =>
    request<Pond>(`/ponds/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deletePond: (id: string) => request<void>(`/ponds/${id}`, { method: "DELETE" }),

  listPonds: (gridId?: string, farmId?: string) =>
    request<Pond[]>(
      `/ponds${gridId ? `?grid_id=${gridId}` : farmId ? `?farm_id=${farmId}` : ""}`,
    ),
  createPond: (b: { grid_id: string; name: string; area_m2?: number; default_feed_time?: string }) =>
    request<Pond>("/ponds", { method: "POST", body: JSON.stringify(b) }),
  getPond: (id: string) => request<Pond>(`/ponds/${id}`),
  listPondCycles: (pondId: string) => request<Cycle[]>(`/ponds/${pondId}/cycles`),

  listCycles: (farmId?: string) =>
    request<Cycle[]>(`/cycles${farmId ? `?farm_id=${farmId}` : ""}`),
  getCycle: (id: string) => request<Cycle>(`/cycles/${id}`),
  updateCycle: (
    id: string,
    b: {
      name?: string;
      planned_end_date?: string | null;
      actual_end_date?: string | null;
      status?: string;
      maximum_daily_feed_capacity_kg?: number | null;
      stable_carrying_capacity_kg_per_m3?: number | null;
      final_carrying_capacity_kg_per_m3?: number | null;
      feeding_index_increment?: number | null;
      maximum_feeding_index?: number | null;
      prediction_config?: PredictionConfig | null;
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
    feeding_index_increment?: number;
    maximum_feeding_index?: number;
    prediction_config?: PredictionConfig;
    planned_end_date?: string;
    notes?: string;
  }) => request<Cycle>("/cycles", { method: "POST", body: JSON.stringify(b) }),
  getCycleDay: (cycleId: string, day: string) =>
    request<DayView>(`/cycles/${cycleId}/days/${day}`),
  /** Full day views for [from, to], oldest first (at most 62 days per call). */
  getCycleDayViews: (cycleId: string, from: string, to: string) =>
    request<DayView[]>(`/cycles/${cycleId}/day-views?from=${from}&to=${to}`),
  listCycleDays: (cycleId: string, from: string, to: string) =>
    request<DaySummary[]>(`/cycles/${cycleId}/days?from=${from}&to=${to}`),
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
  previewPrediction: (cycleId: string, b: PredictionRequest) =>
    request<PredictionResult>(`/cycles/${cycleId}/prediction/preview`, {
      method: "POST",
      body: JSON.stringify(b),
    }),
  startPredictionPreviewJob: (cycleId: string, b: PredictionRequest) =>
    request<PredictionJob>(`/cycles/${cycleId}/prediction/preview-jobs`, {
      method: "POST",
      body: JSON.stringify(b),
    }),
  getLatestPredictionPreviewJob: (cycleId: string) =>
    request<PredictionJob | null>(`/cycles/${cycleId}/prediction/preview-jobs/latest`),
  getPredictionPreviewJob: (cycleId: string, jobId: string) =>
    request<PredictionJob>(`/cycles/${cycleId}/prediction/preview-jobs/${jobId}`),
  generatePredictionFromJob: (cycleId: string, jobId: string) =>
    request<PredictionResult>(`/cycles/${cycleId}/prediction/preview-jobs/${jobId}/generate`, {
      method: "POST",
    }),
  generatePrediction: (cycleId: string, b: PredictionRequest) =>
    request<PredictionResult>(`/cycles/${cycleId}/prediction/generate`, {
      method: "POST",
      body: JSON.stringify(b),
    }),
  createSample: (
    cycleId: string,
    b: { date: string; population: number; method?: string; notes?: string },
  ) =>
    request<PopulationSample>(`/cycles/${cycleId}/samples`, { method: "POST", body: JSON.stringify(b) }),

  createFeeding: (
    dailyLogId: string,
    b: {
      feed_time: string;
      amount_kg: number;
      duration_min?: number;
      additives?: FeedingAdditiveIn[];
      feed_types?: FeedingFeedType[];
      notes?: string;
    },
  ) =>
    request<Feeding>(`/days/${dailyLogId}/feedings`, {
      method: "POST",
      body: JSON.stringify(b),
    }),
  updateFeeding: (id: string, b: Partial<Omit<Feeding, "id" | "daily_log_id" | "additives">> & { additives?: FeedingAdditiveIn[] }) =>
    request<Feeding>(`/feedings/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteFeeding: (id: string) => request<void>(`/feedings/${id}`, { method: "DELETE" }),

  createHarvest: (
    dailyLogId: string,
    b: {
      harvest_time: string;
      biomass_kg: number;
      sampled_abw_g: number;
      total_price: number;
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
      total_price?: number;
      notes?: string | null;
    },
  ) =>
    request<Harvest>(`/harvests/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteHarvest: (id: string) => request<void>(`/harvests/${id}`, { method: "DELETE" }),

  upsertWater: (dailyLogId: string, b: WaterParametersUpsert) =>
    request<WaterParameters>(`/days/${dailyLogId}/water`, {
      method: "PUT",
      body: JSON.stringify(b),
    }),

  createTreatment: (
    dailyLogId: string,
    b: {
      treatment_time: string;
      action?: string;
      worker?: string;
      notes?: string;
      warehouse_id?: string | null;
      items?: TreatmentItemInput[];
    },
  ) =>
    request<Treatment>(`/days/${dailyLogId}/treatments`, {
      method: "POST",
      body: JSON.stringify(b),
    }),
  /** Sending `items` replaces them: the old stock goes back and the new amounts come out. */
  updateTreatment: (
    id: string,
    b: Partial<Omit<Treatment, "id" | "daily_log_id" | "items">> & { items?: TreatmentItemInput[] },
  ) => request<Treatment>(`/treatments/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteTreatment: (id: string) => request<void>(`/treatments/${id}`, { method: "DELETE" }),

  /** `kind: "product"` lists what you buy (Biolacto); `"formula"` what you apply (Lactobacillus). */
  listProducts: (farmId?: string, kind?: ProductKind, includeInactive = false) =>
    request<Product[]>(
      `/products?${new URLSearchParams({
        ...(farmId ? { farm_id: farmId } : {}),
        ...(kind ? { kind } : {}),
        ...(includeInactive ? { include_inactive: "true" } : {}),
      })}`,
    ),
  createProduct: (b: ProductInput & { farm_id: string }) =>
    request<Product>("/products", { method: "POST", body: JSON.stringify(b) }),
  updateProduct: (id: string, b: Partial<ProductInput>) =>
    request<Product>(`/products/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteProduct: (id: string) => request<void>(`/products/${id}`, { method: "DELETE" }),
  /** What applying this much would actually take out of stock, before anyone saves. */
  expandProduct: (id: string, amount: number, unit?: string | null, warehouseId?: string | null) =>
    request<Expansion>(
      `/products/${id}/expand?${new URLSearchParams({
        amount: String(amount),
        ...(unit ? { unit } : {}),
        ...(warehouseId ? { warehouse_id: warehouseId } : {}),
      })}`,
    ),


  getGridInventory: (gridId: string) => request<WarehouseInventory[]>(`/grids/${gridId}/inventory`),
  createWarehouse: (gridId: string, b: { name: string; notes?: string | null; copy_items_from?: string | null }) =>
    request<Warehouse>(`/grids/${gridId}/warehouses`, { method: "POST", body: JSON.stringify(b) }),
  updateWarehouse: (id: string, b: { name?: string; notes?: string | null }) =>
    request<Warehouse>(`/warehouses/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteWarehouse: (id: string) => request<void>(`/warehouses/${id}`, { method: "DELETE" }),
  /** Replaces the set of ponds drawing from this warehouse. */
  setWarehousePonds: (id: string, pond_ids: string[]) =>
    request<Warehouse>(`/warehouses/${id}/ponds`, { method: "PUT", body: JSON.stringify({ pond_ids }) }),
  /**
   * Stock something here: an existing product by `product_id`, or a new one via
   * `new_product`. Creating a product only happens this way, so none can exist
   * without a warehouse holding it.
   */
  createInventoryItem: (
    warehouseId: string,
    b: InventoryItemInput & {
      quantity: number;
      product_id?: string;
      new_product?: {
        name: string;
        category: InventoryCategory;
        base_unit: string;
        price_per_unit: number | null;
        units: { unit: string; factor_to_base: number }[];
      };
    },
  ) =>
    request<InventoryItem>(`/warehouses/${warehouseId}/items`, { method: "POST", body: JSON.stringify(b) }),
  updateInventoryItem: (id: string, b: Partial<InventoryItemInput>) =>
    request<InventoryItem>(`/inventory-items/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteInventoryItem: (id: string) => request<void>(`/inventory-items/${id}`, { method: "DELETE" }),
  addInventoryMovement: (id: string, b: { kind: MovementKind; amount: number; note?: string | null }) =>
    request<InventoryItem>(`/inventory-items/${id}/movements`, { method: "POST", body: JSON.stringify(b) }),
  listInventoryMovements: (id: string, limit = 10) =>
    request<InventoryMovement[]>(`/inventory-items/${id}/movements?limit=${limit}`),

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

  getAdditiveDoses: (cycleId: string, date: string) =>
    request<AdditiveDose[]>(`/cycles/${cycleId}/additive-doses?date=${date}`),
  getAdditiveUsage: (cycleId: string, from: string, to: string) =>
    request<AdditiveUsage[]>(`/cycles/${cycleId}/additive-usage?from=${from}&to=${to}`),
};
