import type { Equipment, EquipmentKind, EquipmentStatus, Pond } from "@/lib/api";

/**
 * The grid's layout drawing: metres, true north up, x east and y south.
 * Areas (ponds, reservoirs) are rectangles turned around their middle. Machines inside
 * one are placed in its own frame (u from its west side, v from its north side, b from
 * its north side), so turning the area turns them too.
 */

export type Kind = EquipmentKind | "pond";
export type What = "water" | "air" | "power";

export const KIND_LABEL: Record<Kind, string> = {
  pond: "Pond",
  reservoir: "Reservoir",
  bore_well: "Bore well",
  paddlewheel: "Paddlewheel",
  pump: "Pump",
  generator: "Generator",
  pln_meter: "PLN meter",
  blower: "Blower",
};
export const KIND_PLURAL: Record<EquipmentKind, string> = {
  paddlewheel: "Paddlewheels",
  pump: "Pumps",
  blower: "Blowers",
  bore_well: "Bore wells",
  reservoir: "Reservoirs",
  pln_meter: "PLN meters",
  generator: "Generators",
};
export const POWER_KINDS = new Set<Kind>(["pln_meter", "generator"]);
export const STATUS_LABEL: Record<EquipmentStatus, string> = {
  working: "Working",
  broken: "Broken",
  in_repair: "In repair",
  retired: "Retired",
};

type Base = { id: string; kind: Kind; code: string; name: string | null; eq: Equipment | null; pond: Pond | null };
export type Area = Base & {
  kind: "pond" | "reservoir";
  /** "Pond 0", "Reservoir R1". */
  label: string;
  w: number;
  h: number;
  x: number;
  y: number;
  rot: number;
  /** False: not drawn yet, so x/y are only a suggestion. */
  recorded: boolean;
  /** False: no width and length recorded, so the size is a guess. */
  sized: boolean;
};
export type Spot = Base & { x: number; y: number; /** Not drawn yet: waits in the "Not placed yet" row. */ parked: boolean };
export type Inner = Base & { in: string; u: number; v: number; b: number; /** False: its spot isn't recorded, so it is drawn at a guess. */ known: boolean };
export type Stored = Base & { warehouseId: string };
export type Route = { owner: string; from: string | null; to: string; what: What; backup: boolean; note: string | null };
export type Thing = Area | Spot | Inner | Stored;

/** Unsaved layout changes from an edit session. Bearings in `inner` are relative to the area. */
export type Draft = {
  ponds: Record<string, { x: number; y: number; rot: number }>;
  grid: Record<string, { x: number; y: number; rot: number }>;
  inner: Record<string, { in: string; u: number; v: number; b: number; mode: "moved" | "fix" }>;
};
export const emptyDraft = (): Draft => ({ ponds: {}, grid: {}, inner: {} });
export const draftSize = (d: Draft) => Object.keys(d.ponds).length + Object.keys(d.grid).length + Object.keys(d.inner).length;

/** What the paddlewheel popup is typing, shown on the drawing before it is kept. */
export type Preview = { id: string; in: string; u: number; v: number; b: number } | null;

export type Model = {
  areas: Area[];
  spots: Spot[];
  inner: Inner[];
  stored: Stored[];
  routes: Route[];
  /** Where the "Not placed yet" row starts (its first machine's middle), when anything waits in it. */
  strip: { x: number; y: number } | null;
  things: Map<string, Thing>;
};

// ---- Small helpers ----
export const norm360 = (d: number) => ((Math.round(d) % 360) + 360) % 360;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const snap = (v: number) => Math.round(v * 2) / 2;
const num = (s: string | null | undefined) => (s == null || s === "" ? null : Number(s));
const specNum = (sp: Record<string, unknown>, k: string) => {
  const v = sp[k];
  return typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null;
};
/** Natural order: 2 before 10, A2 before A10. */
export const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
export const fm = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

export const pondLabel = (p: Pond) => (/^\d+$/.test(p.name.trim()) ? `Pond ${p.name.trim()}` : p.name);

// ---- Geometry ----
export function areaToWorld(a: Pick<Area, "x" | "y" | "w" | "h" | "rot">, u: number, v: number) {
  const t = (a.rot * Math.PI) / 180, dx = u - a.w / 2, dy = v - a.h / 2;
  return { x: a.x + dx * Math.cos(t) - dy * Math.sin(t), y: a.y + dx * Math.sin(t) + dy * Math.cos(t) };
}
export function worldToArea(a: Pick<Area, "x" | "y" | "w" | "h" | "rot">, x: number, y: number) {
  const t = (-a.rot * Math.PI) / 180, dx = x - a.x, dy = y - a.y;
  return { u: dx * Math.cos(t) - dy * Math.sin(t) + a.w / 2, v: dx * Math.sin(t) + dy * Math.cos(t) + a.h / 2 };
}
export const corners = (a: Pick<Area, "x" | "y" | "w" | "h" | "rot">) =>
  [[0, 0], [a.w, 0], [a.w, a.h], [0, a.h]].map(([u, v]) => areaToWorld(a, u, v));
export function insideArea(a: Area, x: number, y: number) {
  const p = worldToArea(a, x, y);
  return p.u >= 0 && p.u <= a.w && p.v >= 0 && p.v <= a.h;
}
export function nearestOnArea(a: Area, x: number, y: number) {
  const p = worldToArea(a, x, y);
  return areaToWorld(a, clamp(p.u, 0, a.w), clamp(p.v, 0, a.h));
}
function bounds(pts: { x: number; y: number }[]) {
  return {
    x0: Math.min(...pts.map((p) => p.x)),
    x1: Math.max(...pts.map((p) => p.x)),
    y0: Math.min(...pts.map((p) => p.y)),
    y1: Math.max(...pts.map((p) => p.y)),
  };
}
const SIDES = ["north", "east", "south", "west"];
const POINTS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
/** Which compass side an area's own side faces: k 0 its north side, 1 east, 2 south, 3 west. */
export const sideName = (a: Area, k: number) => SIDES[Math.round(norm360(a.rot + k * 90) / 90) % 4];
export const pointOf = (b: number) => POINTS[Math.round(norm360(b) / 45) % 8];
export const dirWords = (b: number) => {
  b = norm360(b);
  return b % 45 === 0 ? `${pointOf(b)} (${b}°)` : `roughly ${pointOf(b)} (${b}°)`;
};

/** A spot inside an area, in words, with the sides named by where they really face. */
export function spotWords(a: Area, u: number, v: number) {
  const near = 4;
  const n = sideName(a, 0), e = sideName(a, 1), s = sideName(a, 2), w = sideName(a, 3);
  const ns = v <= near ? n : a.h - v <= near ? s : "";
  const ew = u <= near ? w : a.w - u <= near ? e : "";
  if (ns && ew) {
    const pair = [ns, ew].sort((x, y) => ["north", "south"].indexOf(y) - ["north", "south"].indexOf(x));
    return `${pair.join("-")} corner`;
  }
  if (ew) return `${ew} side, ${Math.round(v)} m from the ${n}`;
  if (ns) return `${ns} side, ${Math.round(u)} m from the ${w}`;
  return `middle, ${Math.round(u)} m from the ${w} and ${Math.round(v)} m from the ${n}`;
}
export function placementWords(m: Model, t: Inner) {
  if (!t.known) return "spot and direction not recorded yet";
  const a = m.things.get(t.in) as Area;
  return `${spotWords(a, t.u, t.v)}, pushing ${dirWords(a.rot + t.b)}`;
}

// ---- Suggested spots for what isn't drawn yet ----
/** Up to 8 spots 4 m in from the sides, numbered clockwise from the north-west, flowing clockwise. */
function ringSpots(a: { w: number; h: number }, count: number) {
  const i = Math.min(4, a.w / 4, a.h / 4);
  const L = i, R = a.w - i, T = i, B = a.h - i, cx = a.w / 2, cy = a.h / 2;
  const cornersCw = [
    { u: L, v: T, b: 90 },
    { u: R, v: T, b: 180 },
    { u: R, v: B, b: 270 },
    { u: L, v: B, b: 0 },
  ];
  const longMids = a.h >= a.w ? [{ u: R, v: cy, b: 180 }, { u: L, v: cy, b: 0 }] : [{ u: cx, v: T, b: 90 }, { u: cx, v: B, b: 270 }];
  const shortMids = a.h >= a.w ? [{ u: cx, v: T, b: 90 }, { u: cx, v: B, b: 270 }] : [{ u: R, v: cy, b: 180 }, { u: L, v: cy, b: 0 }];
  const chosen = [...cornersCw, ...longMids, ...shortMids].slice(0, Math.min(count, 8));
  // Along the outline clockwise from the north-west corner.
  const around = (p: { u: number; v: number }) =>
    p.v <= T + 0.01 ? p.u : p.u >= R - 0.01 ? a.w + p.v : p.v >= B - 0.01 ? a.w + a.h + (a.w - p.u) : 2 * a.w + a.h + (a.h - p.v);
  chosen.sort((p, q) => around(p) - around(q));
  for (let k = chosen.length; k < count; k++) chosen.push({ u: cx, v: (a.h * (k - 7)) / (count - 6), b: 90 });
  return chosen;
}

const PARK_ORDER: Kind[] = ["bore_well", "pump", "blower", "pln_meter", "generator", "paddlewheel", "reservoir", "pond"];

export function buildModel(ponds: Pond[], equipment: Equipment[], draft: Draft, preview: Preview = null): Model {
  const eqById = new Map(equipment.map((e) => [e.id, e]));
  const pondIds = new Set(ponds.map((p) => p.id));
  const things = new Map<string, Thing>();
  const isGridPlacement = (e: Equipment) =>
    !!e.placement && !e.placement.pond_id && !e.placement.in_equipment_id && !e.placement.warehouse_id;

  // Ponds take their code from their machines' codes ("A0" from A0-K1) when there are any.
  const pondCode = new Map<string, string>();
  for (const e of equipment) {
    const pid = e.placement?.pond_id ?? e.links.find((l) => l.to_pond_id)?.to_pond_id;
    const m = /^([A-Za-z]*\d+)-/.exec(e.code);
    if (pid && m && !pondCode.has(pid)) pondCode.set(pid, m[1]);
  }

  // ---- Areas ----
  const areas: Area[] = [];
  for (const p of [...ponds].sort((a, b) => natural(a.name, b.name))) {
    const width = num(p.width_m), length = num(p.length_m), area = num(p.area_m2);
    const side = area && area > 0 ? Math.sqrt(area) : 30;
    const d = draft.ponds[p.id];
    const x = d ? d.x : num(p.x_m ?? null), y = d ? d.y : num(p.y_m ?? null);
    areas.push({
      id: p.id, kind: "pond", code: pondCode.get(p.id) ?? p.name, name: pondLabel(p), label: pondLabel(p), eq: null, pond: p,
      w: width ?? side, h: length ?? side, x: x ?? 0, y: y ?? 0, rot: d ? d.rot : p.rotation ?? 0,
      recorded: x != null && y != null, sized: width != null && length != null,
    });
  }
  for (const e of equipment.filter((x) => x.kind === "reservoir").sort((a, b) => natural(a.code, b.code))) {
    const w = specNum(e.specs, "width_m"), h = specNum(e.specs, "length_m");
    const d = draft.grid[e.id], pl = isGridPlacement(e) ? e.placement : null;
    const x = d ? d.x : num(pl?.x_m), y = d ? d.y : num(pl?.y_m);
    areas.push({
      id: e.id, kind: "reservoir", code: e.code, name: e.name, label: `Reservoir ${e.code}`, eq: e, pond: null,
      w: w ?? 20, h: h ?? 10, x: x ?? 0, y: y ?? 0, rot: d ? d.rot : pl?.bearing ?? 0,
      recorded: x != null && y != null, sized: w != null && h != null,
    });
  }
  for (const a of areas) things.set(a.id, a);

  // ---- Lines: who moves water, air or power from where to where ----
  const routes: Route[] = [];
  for (const e of equipment) {
    for (const l of e.links) {
      const to = l.to_pond_id ?? l.to_equipment_id;
      if (!to) continue;
      const what: What = e.kind === "blower" ? "air" : POWER_KINDS.has(e.kind) ? "power" : "water";
      const toEq = l.to_equipment_id ? eqById.get(l.to_equipment_id) : null;
      routes.push({
        owner: e.id, from: l.from_pond_id ?? l.from_equipment_id ?? null, to, what, note: l.note,
        backup: what === "power" && e.kind === "generator" && !!toEq && POWER_KINDS.has(toEq.kind),
      });
    }
  }

  // Ponds not drawn yet: in a row east of what is drawn. Reservoirs: just north of the pond they feed.
  const drawn = areas.filter((a) => a.recorded);
  const box = drawn.length ? bounds(drawn.flatMap(corners)) : null;
  let cursor = box ? box.x1 + 12 : 0;
  const top = box ? box.y0 : 0;
  for (const a of areas.filter((x) => !x.recorded && x.kind === "pond")) {
    a.x = cursor + a.w / 2;
    a.y = top + a.h / 2;
    cursor += a.w + 10;
  }
  // Areas already standing somewhere; a suggested reservoir moves east until it clears them.
  const settled = new Set(areas.filter((a) => a.recorded || a.kind === "pond").map((a) => a.id));
  const touching = (a: Area, o: Area) => {
    const p = bounds(corners(a)), q = bounds(corners(o));
    return p.x0 < q.x1 + 3 && q.x0 < p.x1 + 3 && p.y0 < q.y1 + 3 && q.y0 < p.y1 + 3;
  };
  const overlaps = (a: Area) => areas.some((o) => o !== a && settled.has(o.id) && touching(a, o));
  for (const a of areas.filter((x) => !x.recorded && x.kind === "reservoir")) {
    const fed = routes.find((r) => r.from === a.id && pondIds.has(r.to))?.to;
    const pond = fed ? (things.get(fed) as Area) : null;
    if (pond) {
      const pb = bounds(corners(pond));
      a.x = (pb.x0 + pb.x1) / 2;
      a.y = pb.y0 - 9 - a.h / 2;
    } else {
      a.x = cursor + a.w / 2;
      a.y = top + a.h / 2;
      cursor += a.w + 10;
    }
    for (let k = 0; k < 12 && overlaps(a); k++) a.x += a.w + 6;
    settled.add(a.id);
  }

  // ---- Machines inside a pond or reservoir ----
  const inner: Inner[] = [];
  const stored: Stored[] = [];
  const spotsRaw: Equipment[] = [];
  for (const e of equipment) {
    if (e.kind === "reservoir") continue;
    const d = draft.inner[e.id];
    const pl = e.placement;
    const container = d?.in ?? pl?.pond_id ?? pl?.in_equipment_id ?? null;
    if (container && things.has(container)) {
      const known = !!d || (num(pl?.x_m) != null && num(pl?.y_m) != null);
      inner.push({
        id: e.id, kind: e.kind, code: e.code, name: e.name, eq: e, pond: null, in: container,
        u: d ? d.u : num(pl?.x_m) ?? 0, v: d ? d.v : num(pl?.y_m) ?? 0, b: d ? d.b : pl?.bearing ?? 0, known,
      });
    } else if (pl?.warehouse_id && !draft.grid[e.id]) {
      stored.push({ id: e.id, kind: e.kind, code: e.code, name: e.name, eq: e, pond: null, warehouseId: pl.warehouse_id });
    } else spotsRaw.push(e);
  }
  // Spots nobody recorded: around the outline (a reservoir's single wheel in its middle).
  for (const a of areas) {
    const unknown = inner.filter((t) => t.in === a.id && !t.known).sort((p, q) => natural(p.code, q.code));
    if (!unknown.length) continue;
    const spots = a.kind === "reservoir" && unknown.length === 1 ? [{ u: a.w / 2, v: a.h / 2, b: 90 }] : ringSpots(a, unknown.length);
    unknown.forEach((t, k) => {
      const keepB = t.eq?.placement?.bearing;
      Object.assign(t, { u: spots[k].u, v: spots[k].v, b: keepB ?? spots[k].b });
    });
  }
  if (preview) {
    const t = inner.find((x) => x.id === preview.id);
    if (t) Object.assign(t, { in: preview.in, u: preview.u, v: preview.v, b: preview.b, known: true });
  }
  for (const t of inner) things.set(t.id, t);
  for (const t of stored) things.set(t.id, t);

  // ---- Machines on the grid ----
  const spots: Spot[] = [];
  for (const e of spotsRaw) {
    const d = draft.grid[e.id], pl = isGridPlacement(e) ? e.placement : null;
    const x = d ? d.x : num(pl?.x_m), y = d ? d.y : num(pl?.y_m);
    spots.push({ id: e.id, kind: e.kind, code: e.code, name: e.name, eq: e, pond: null, x: x ?? 0, y: y ?? 0, parked: x == null || y == null });
  }
  // What isn't drawn waits in a row north of everything, to be dragged into place.
  const parked = spots.filter((s) => s.parked).sort((p, q) => PARK_ORDER.indexOf(p.kind) - PARK_ORDER.indexOf(q.kind) || natural(p.code, q.code));
  let strip: Model["strip"] = null;
  if (parked.length) {
    const pts = [...areas.flatMap(corners), ...spots.filter((s) => !s.parked)];
    const b = pts.length ? bounds(pts) : { x0: 0, y0: 0, x1: 0, y1: 0 };
    strip = { x: b.x0 + 3, y: b.y0 - 12 };
    parked.forEach((s, k) => {
      s.x = b.x0 + 3 + k * 9;
      s.y = b.y0 - 12;
    });
  }
  for (const s of spots) things.set(s.id, s);

  return { areas, spots, inner, stored, routes, strip, things };
}

// ---- Reading the model ----
export const isArea = (t: Thing | undefined): t is Area => !!t && (t.kind === "pond" || t.kind === "reservoir");
export const isInner = (t: Thing | undefined): t is Inner => !!t && "in" in t;
export const isSpot = (t: Thing | undefined): t is Spot => !!t && "parked" in t;

/** Where a thing is on the drawing, or null when it isn't drawn (stored, or waiting to be placed). */
export function worldPos(m: Model, id: string): { x: number; y: number } | null {
  const t = m.things.get(id);
  if (!t) return null;
  if (isArea(t)) return { x: t.x, y: t.y };
  if (isInner(t)) {
    const a = m.things.get(t.in) as Area;
    return areaToWorld(a, t.u, t.v);
  }
  if (isSpot(t)) return { x: t.x, y: t.y };
  return null;
}
export function bearingOf(m: Model, t: Inner) {
  const a = m.things.get(t.in) as Area;
  return norm360((a?.rot ?? 0) + t.b);
}
export const label = (m: Model, id: string) => {
  const t = m.things.get(id);
  if (!t) return "?";
  return isArea(t) ? (t.kind === "pond" ? `${t.label} (${t.code})` : t.code) : t.code;
};
export const statusOf = (t: Thing): EquipmentStatus => t.eq?.status ?? "working";
export const hpOf = (t: Thing) => {
  const sp = (t.eq?.specs ?? {}) as Record<string, unknown>;
  const motor = (sp.motor ?? {}) as Record<string, unknown>;
  return Number(motor.hp ?? sp.hp ?? 0) || 0;
};
export const innerIn = (m: Model, areaId: string) => m.inner.filter((t) => t.in === areaId);

/** Pond badge when zoomed out: K kincir (paddlewheels), B blowers. */
export function badge(m: Model, a: Area) {
  const k = m.inner.filter((t) => t.in === a.id && t.kind === "paddlewheel").length;
  const b = m.routes.filter((r) => r.to === a.id && r.what === "air").length;
  return [k ? `${k}K` : "", b ? `${b}B` : ""].filter(Boolean).join("·") || "—";
}

/** The chain of water into a pond: well → pump → reservoir → pump → pond. */
export function waterChain(m: Model, id: string, depth = 0): string[] {
  const r = m.routes.find((x) => x.to === id && x.from && x.what === "water");
  if (!r || depth > 6 || !r.from) return [id];
  return [...waterChain(m, r.from, depth + 1), r.owner, id];
}

/** Everything tapping a thing should light up. */
export function related(m: Model, id: string) {
  const s = new Set([id]);
  const t = m.things.get(id);
  if (isArea(t)) {
    innerIn(m, id).forEach((x) => s.add(x.id));
    m.routes.forEach((r) => {
      if (r.to === id || r.from === id) {
        s.add(r.owner);
        s.add(r.to);
        if (r.from) s.add(r.from);
      }
    });
    waterChain(m, id).forEach((x) => s.add(x));
  } else if (isInner(t)) {
    s.add(t.in);
  } else {
    m.routes
      .filter((r) => r.owner === id || r.to === id || r.from === id)
      .forEach((r) => {
        s.add(r.owner);
        s.add(r.to);
        if (r.from) s.add(r.from);
      });
  }
  // A backup generator comes along with the meter it backs up.
  m.routes.forEach((r) => {
    if (r.backup && s.has(r.to)) s.add(r.owner);
  });
  return s;
}

/** Meters and generators feeding a thing, directly or through the pond it serves. */
export function powerFeeds(m: Model, id: string): Route[] {
  let rs = m.routes.filter((r) => r.to === id && r.what === "power");
  if (!rs.length) {
    const t = m.things.get(id);
    const pond = isInner(t) ? t.in : t?.kind === "blower" ? m.routes.find((r) => r.owner === id && isArea(m.things.get(r.to)))?.to : null;
    if (pond) rs = m.routes.filter((r) => r.to === pond && r.what === "power");
  }
  return rs;
}
export const backupsOf = (m: Model, meterId: string) => m.routes.filter((r) => r.to === meterId && r.backup);

/** Which group a machine sits in on the list: its pond, its reservoir, or the shared group. */
export function groupOf(m: Model, t: Thing): string {
  if (isInner(t)) return t.in;
  if (t.kind === "blower") {
    const r = m.routes.find((x) => x.owner === t.id && isArea(m.things.get(x.to)));
    return r ? r.to : "shared";
  }
  if (t.kind === "reservoir") return t.id;
  return "shared";
}
