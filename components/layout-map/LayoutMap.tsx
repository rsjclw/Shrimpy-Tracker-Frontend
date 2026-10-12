"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import "./layout-map.css";
import {
  badge,
  bearingOf,
  clamp,
  corners,
  isArea,
  isInner,
  isSpot,
  nearestOnArea,
  norm360,
  related,
  snap,
  statusOf,
  worldPos,
  type Area,
  type Inner,
  type Model,
  type Spot,
  type Thing,
  type What,
} from "./model";

// Holding still decides the gesture. View mode: DETAILS_MS opens the details. Edit mode: LIFT_MS lifts a
// thing so a drag moves it; TURN_MS shows the turning ring so a drag turns it. A drag before that pans.
const DETAILS_MS = 500;
const LIFT_MS = 300;
const TURN_MS = 800;
const SLACK = 8;
const S_MIN = 0.4;
const S_MAX = 40; // pixels per metre
const R_PX: Record<string, number> = { pump: 13, blower: 15, bore_well: 16, paddlewheel: 16, pln_meter: 13, generator: 14 };
const f1 = (n: number) => n.toFixed(1);
/** Detail grows with zoom: 0 ponds only, 1 machines without labels, 2 everything. */
const lodOf = (s: number) => (s < 2.2 ? 0 : s < 4.5 ? 1 : 2);
const shrink = (L: number) => (L === 2 ? 1 : 0.72);
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

type Pt = { x: number; y: number };
/** The thing being held, moved or turned, drawn over the model until the gesture ends. */
type Live = { id: string; mode: "lift" | "move" | "turn"; x?: number; y?: number; rot?: number; world?: Pt; bearing?: number };
type Gesture = {
  mode: "pending" | "pan" | "lift" | "move" | "turn" | "done";
  id: string | null;
  start: Pt;
  cam0: Pt;
  off?: Pt;
  rot0?: number;
  a0?: number | null;
};

export type MapHandle = {
  fitAll: () => void;
  fitArea: (id: string) => void;
  /** Bring a thing into view, close enough to see machines. */
  showOnMap: (id: string) => void;
};

type Props = {
  m: Model;
  edit: boolean;
  sel: string | null;
  layers: Record<What, boolean>;
  header?: ReactNode;
  footer?: ReactNode;
  /** The paddlewheel editor, beside the wheel. */
  popup?: { anchor: string; node: ReactNode } | null;
  /** The details, beside the thing (a sheet at the bottom on a phone). */
  info?: { anchor: string; node: ReactNode } | null;
  onTap: (id: string | null) => void;
  onHold: (id: string) => void;
  onAreaChange: (id: string, v: { x: number; y: number; rot: number }) => void;
  onSpotMove: (id: string, x: number, y: number) => void;
  /** A paddlewheel let go of at a point on the drawing. */
  onDropInner: (id: string, world: Pt) => void;
  onTurnInner: (id: string, bearing: number) => void;
  onEditInner: (id: string) => void;
  /** Any touch on the map, before the gesture is known. */
  onTouch?: () => void;
};

export const LayoutMap = forwardRef<MapHandle, Props>(function LayoutMap(props, ref) {
  const { m: base, edit, sel, layers, header, footer, popup, info } = props;
  const cardRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const cam = useRef({ x: 0, y: 0, s: 4 });
  const size = useRef({ W: 800, H: 500 });
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [live, setLive] = useState<Live | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const fitted = useRef(false);
  const handlers = useRef(props);
  handlers.current = props;

  // ---- The model with the gesture in progress drawn over it ----
  const m = useMemo<Model>(() => {
    if (!live || (live.x == null && live.rot == null)) return base;
    const t = base.things.get(live.id);
    const things = new Map(base.things);
    if (isArea(t)) {
      const a: Area = { ...t, x: live.x ?? t.x, y: live.y ?? t.y, rot: live.rot ?? t.rot };
      things.set(a.id, a);
      return { ...base, areas: base.areas.map((x) => (x.id === a.id ? a : x)), things };
    }
    if (isSpot(t) && live.x != null && live.y != null) {
      const s: Spot = { ...t, x: live.x, y: live.y };
      things.set(s.id, s);
      return { ...base, spots: base.spots.map((x) => (x.id === s.id ? s : x)), things };
    }
    return base;
  }, [base, live]);
  const mRef = useRef(m);
  mRef.current = m;
  // Without the gesture drawn over it: what a finished move or turn is compared against.
  const baseRef = useRef(base);
  baseRef.current = base;

  // ---- Camera ----
  const sx = (x: number) => (x - cam.current.x) * cam.current.s + size.current.W / 2;
  const sy = (y: number) => (y - cam.current.y) * cam.current.s + size.current.H / 2;
  const toWorld = (px: number, py: number) => ({
    x: (px - size.current.W / 2) / cam.current.s + cam.current.x,
    y: (py - size.current.H / 2) / cam.current.s + cam.current.y,
  });
  const zoomAt = (px: number, py: number, f: number) => {
    const w = toWorld(px, py);
    const s = clamp(cam.current.s * f, S_MIN, S_MAX);
    cam.current = { s, x: w.x - (px - size.current.W / 2) / s, y: w.y - (py - size.current.H / 2) / s };
  };
  const fitPoints = (pts: Pt[], pad: number) => {
    if (!pts.length) return;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const { W, H } = size.current;
    cam.current = {
      s: clamp(Math.min((W - 2 * pad) / Math.max(x1 - x0, 1), (H - 2 * pad) / Math.max(y1 - y0, 1)), S_MIN, S_MAX),
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2,
    };
  };
  const fitAll = useCallback(() => {
    const mm = mRef.current;
    // Room above the "Not placed yet" row for its caption.
    const caption = mm.strip ? [{ x: mm.strip.x, y: mm.strip.y - 7 }] : [];
    fitPoints([...mm.areas.flatMap(corners), ...mm.spots.map((s) => ({ x: s.x, y: s.y })), ...caption], 36);
  }, []);
  // Redraw at most once a frame while panning or zooming.
  const raf = useRef(0);
  const schedule = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      rerender();
    });
  }, []);

  useImperativeHandle(ref, () => ({
    fitAll: () => {
      fitAll();
      rerender();
    },
    fitArea: (id: string) => {
      const a = mRef.current.things.get(id);
      if (isArea(a)) fitPoints(corners(a), 56);
      rerender();
    },
    showOnMap: (id: string) => {
      const p = worldPos(mRef.current, id);
      if (!p) return;
      const area = isArea(mRef.current.things.get(id));
      if (!area && cam.current.s < 4.5) cam.current = { ...cam.current, s: 6 };
      const q = { x: sx(p.x), y: sy(p.y) };
      const { W, H } = size.current;
      if (q.x < 40 || q.x > W - 40 || q.y < 40 || q.y > H - 40 || (!area && lodOf(cam.current.s) < 2)) cam.current = { ...cam.current, x: p.x, y: p.y };
      rerender();
    },
  }));

  // The map follows its box: fit everything the first time it has a size.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      size.current = { W: wrap.clientWidth, H: wrap.clientHeight };
      if (!size.current.W || !size.current.H) return;
      if (!fitted.current) {
        fitAll();
        fitted.current = true;
      }
      rerender();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [fitAll]);

  // ---- Pointer gestures ----
  // View mode: drag pans; hold DETAILS_MS opens details; a tap highlights.
  // Edit mode: drag pans; hold LIFT_MS then drag moves; hold TURN_MS then drag turns; a tap on a wheel edits it.
  const pointers = useRef(new Map<number, Pt>());
  const pinch = useRef<{ d0: number; s0: number; w0: Pt } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const liveRef = useRef<Live | null>(null);
  const timers = useRef<number[]>([]);
  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  const putLive = (l: Live | null) => {
    liveRef.current = l;
    setLive(l);
  };
  const buzz = () => {
    try {
      navigator.vibrate?.(15);
    } catch {
      // not allowed here
    }
  };
  const localPoint = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const canMove = (t: Thing | undefined) => !!t && (isArea(t) || isSpot(t) || isInner(t));
  const canTurn = (t: Thing | undefined) => !!t && (isArea(t) || (isInner(t) && t.kind === "paddlewheel"));
  const isWheelLike = (t: Thing | undefined) => !!t && (isInner(t) || (isSpot(t) && t.kind === "paddlewheel"));

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    svgRef.current?.setPointerCapture(e.pointerId);
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      // Two fingers: pinch to zoom; whatever one finger had started is dropped.
      clearTimers();
      gesture.current = null;
      putLive(null);
      const [a, b] = [...pointers.current.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinch.current = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: cam.current.s, w0: toWorld(mid.x, mid.y) };
      return;
    }
    if (pointers.current.size > 2) return;
    const node = (e.target as Element).closest("[data-id]");
    const id = node ? node.getAttribute("data-id") : null;
    handlers.current.onTouch?.();
    clearTimers();
    const g: Gesture = { mode: "pending", id, start: p, cam0: { x: cam.current.x, y: cam.current.y } };
    gesture.current = g;
    if (!id) return;
    const t = mRef.current.things.get(id);
    if (!edit) {
      timers.current.push(window.setTimeout(() => {
        if (gesture.current !== g || g.mode !== "pending") return;
        g.mode = "done";
        buzz();
        handlers.current.onHold(id);
      }, DETAILS_MS));
      return;
    }
    if (!canMove(t)) return;
    timers.current.push(window.setTimeout(() => {
      if (gesture.current !== g || g.mode !== "pending") return;
      const w = toWorld(g.start.x, g.start.y), pos = worldPos(mRef.current, id) ?? w;
      g.mode = "lift";
      g.off = { x: pos.x - w.x, y: pos.y - w.y };
      putLive({ id, mode: "lift" });
      buzz();
      if (canTurn(t)) timers.current.push(window.setTimeout(() => {
        if (gesture.current !== g || g.mode !== "lift") return;
        g.mode = "turn";
        const tt = mRef.current.things.get(id);
        if (isArea(tt)) {
          g.rot0 = tt.rot;
          g.a0 = null;
          putLive({ id, mode: "turn", rot: tt.rot });
        } else if (isInner(tt)) putLive({ id, mode: "turn", bearing: bearingOf(mRef.current, tt) });
        buzz();
      }, TURN_MS - LIFT_MS));
    }, LIFT_MS));
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);
    if (pinch.current) {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = clamp((pinch.current.s0 * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.d0, S_MIN, S_MAX);
      cam.current = { s, x: pinch.current.w0.x - (mid.x - size.current.W / 2) / s, y: pinch.current.w0.y - (mid.y - size.current.H / 2) / s };
      schedule();
      return;
    }
    const g = gesture.current;
    if (!g) return;
    const far = Math.hypot(p.x - g.start.x, p.y - g.start.y) > SLACK;
    if (g.mode === "pending" && far) {
      clearTimers();
      g.mode = "pan";
      setGrabbing(true);
    }
    if (g.mode === "pan") {
      cam.current = { ...cam.current, x: g.cam0.x - (p.x - g.start.x) / cam.current.s, y: g.cam0.y - (p.y - g.start.y) / cam.current.s };
      schedule();
      return;
    }
    if (g.mode === "lift" && far) {
      clearTimers();
      g.mode = "move";
    }
    if (g.mode === "move" && g.id && g.off) {
      const w = toWorld(p.x, p.y);
      const at = { x: w.x + g.off.x, y: w.y + g.off.y };
      const t = mRef.current.things.get(g.id);
      if (isWheelLike(t)) putLive({ id: g.id, mode: "move", world: at });
      else putLive({ id: g.id, mode: "move", x: snap(at.x), y: snap(at.y), rot: isArea(t) ? t.rot : undefined });
      return;
    }
    if (g.mode === "turn" && g.id) {
      const c = worldPos(mRef.current, g.id);
      if (!c) return;
      const cx = sx(c.x), cy = sy(c.y);
      if (Math.hypot(p.x - cx, p.y - cy) < 12) return; // too close to the middle to read an angle
      const ang = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI;
      const t = mRef.current.things.get(g.id);
      if (isArea(t)) {
        if (g.a0 == null) g.a0 = ang;
        putLive({ id: g.id, mode: "turn", rot: norm360((g.rot0 ?? 0) + ang - g.a0) });
      } else putLive({ id: g.id, mode: "turn", bearing: norm360(ang + 90) });
    }
  }

  function endGesture(e: ReactPointerEvent<SVGSVGElement>, cancelled: boolean) {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      gesture.current = null;
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    clearTimers();
    setGrabbing(false);
    const l = liveRef.current;
    putLive(null);
    if (!g || cancelled) return;
    const h = handlers.current;
    const t = g.id ? baseRef.current.things.get(g.id) : undefined;
    if (g.mode === "pending") {
      if (edit && g.id && isInner(t) && t.kind === "paddlewheel") h.onEditInner(g.id);
      else h.onTap(g.id);
      return;
    }
    if (!g.id || !l || l.id !== g.id) return;
    if (l.mode === "move") {
      if (isWheelLike(t) && l.world) h.onDropInner(g.id, l.world);
      else if (isArea(t) && l.x != null && l.y != null) h.onAreaChange(g.id, { x: l.x, y: l.y, rot: t.rot });
      else if (isSpot(t) && l.x != null && l.y != null) h.onSpotMove(g.id, l.x, l.y);
    } else if (l.mode === "turn") {
      if (isArea(t) && l.rot != null && l.rot !== t.rot) h.onAreaChange(g.id, { x: t.x, y: t.y, rot: l.rot });
      else if (isInner(t) && l.bearing != null && l.bearing !== bearingOf(baseRef.current, t)) h.onTurnInner(g.id, l.bearing);
    }
  }

  // A plain scroll wheel scrolls the page; Ctrl or ⌘ + scroll zooms the map.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const p = localPoint(e);
      zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0025));
      schedule();
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]);

  function onKeyDown(e: ReactKeyboardEvent<SVGSVGElement>) {
    const n = (e.target as Element).closest("[data-id]");
    if (!n) return;
    const id = n.getAttribute("data-id")!;
    const t = mRef.current.things.get(id);
    const h = handlers.current;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (edit && isInner(t) && t.kind === "paddlewheel") h.onEditInner(id);
      else if (!edit) h.onHold(id); // the keyboard's way to hold
      else h.onTap(id);
      return;
    }
    const step = e.shiftKey ? 5 : 1;
    const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[e.key];
    if (!d || !edit) return;
    if (isArea(t)) {
      e.preventDefault();
      h.onAreaChange(id, { x: t.x + d[0], y: t.y + d[1], rot: t.rot });
    } else if (isSpot(t) && t.kind !== "paddlewheel") {
      e.preventDefault();
      h.onSpotMove(id, t.x + d[0], t.y + d[1]);
    }
  }

  // ---- Popups: beside the thing when there's room, else under it; inside the card ----
  useLayoutEffect(() => {
    const card = cardRef.current?.getBoundingClientRect();
    const wrapR = wrapRef.current?.getBoundingClientRect();
    if (!card || !wrapR) return;
    const place = (pop: HTMLDivElement | null, anchor: string | undefined, width: number, isInfo: boolean) => {
      if (!pop || !anchor) return;
      const node = svgRef.current?.querySelector(`[data-id="${anchor}"]`);
      const r = node
        ? node.getBoundingClientRect()
        : ({ left: wrapR.left + wrapR.width / 2, right: wrapR.left + wrapR.width / 2, top: wrapR.top + 40, bottom: wrapR.top + 40, width: 0 } as DOMRect);
      const asSheet = isInfo && card.width < 600;
      pop.classList.toggle("sheet", asSheet);
      if (asSheet) {
        pop.style.left = pop.style.top = pop.style.width = pop.style.maxHeight = "";
        return;
      }
      const pw = Math.min(width, card.width - 24);
      pop.style.width = `${pw}px`;
      if (isInfo) pop.style.maxHeight = `${Math.max(220, Math.min(card.height - 24, window.innerHeight - 32))}px`;
      const ph = pop.offsetHeight;
      let left = r.right - card.left + 14;
      let top = r.top - card.top - 24;
      if (left + pw > card.width - 12) left = r.left - card.left - pw - 14;
      if (left < 12) {
        left = clamp(r.left - card.left + r.width / 2 - pw / 2, 12, card.width - pw - 12);
        top = r.bottom - card.top + 12;
      }
      pop.style.left = `${Math.round(left)}px`;
      pop.style.top = `${Math.round(clamp(top, 12, Math.max(12, card.height - ph - 12)))}px`;
    };
    place(popRef.current, popup?.anchor, 300, false);
    place(infoRef.current, info?.anchor, 360, true);
  });
  useEffect(() => {
    const onResize = () => rerender();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ---- Drawing ----
  const { W, H } = size.current;
  const s = cam.current.s;
  const L = lodOf(s);
  const lit = sel && m.things.has(sel) ? related(m, sel) : null;
  const dim = (id: string) => (lit && !lit.has(id) ? " dim" : "");
  const liveOf = (id: string) => (live && live.id === id ? live : null);

  const screenOf = (id: string): Pt | null => {
    const l = liveOf(id);
    if (l?.world) return { x: sx(l.world.x), y: sy(l.world.y) };
    const p = worldPos(m, id);
    return p ? { x: sx(p.x), y: sy(p.y) } : null;
  };
  /** The end of a line at a place, in screen pixels: the nearest point of an area's outline, or a machine's edge. */
  const endPoint = (id: string, from: Pt): Pt | null => {
    const t = m.things.get(id);
    if (isArea(t)) {
      const w = toWorld(from.x, from.y);
      const n = nearestOnArea(t, w.x, w.y);
      const q = { x: sx(n.x), y: sy(n.y) };
      const d = Math.hypot(from.x - q.x, from.y - q.y) || 1;
      return { x: q.x + ((from.x - q.x) / d) * 4, y: q.y + ((from.y - q.y) / d) * 4 };
    }
    const c = screenOf(id);
    if (!c || !t) return null;
    const d = Math.hypot(from.x - c.x, from.y - c.y) || 1;
    const r = (R_PX[t.kind] ?? 14) * shrink(L) + 4;
    return { x: c.x + ((from.x - c.x) / d) * r, y: c.y + ((from.y - c.y) / d) * r };
  };
  const drawn = (id: string) => {
    const t = m.things.get(id);
    return !!t && (isArea(t) || isInner(t) || (isSpot(t) && !t.parked));
  };

  // Grid dots every 1-500 m, at least 16 px apart.
  let gridM = 500;
  for (const step of [1, 2, 5, 10, 20, 50, 100, 200, 500]) {
    if (step * s >= 16) {
      gridM = step;
      break;
    }
  }
  const gp = gridM * s;
  const mod = (a: number, b: number) => ((a % b) + b) % b;
  let scaleLen = 1;
  for (const step of [1, 2, 5, 10, 20, 50, 100, 200, 500]) if (step * s <= 140) scaleLen = step;

  const rings = (t: Thing, r: number) => {
    const st = statusOf(t);
    const l = liveOf(t.id);
    return (
      <>
        {l && (l.mode === "lift" || l.mode === "move") ? <circle className="lift-ring" r={r + 5} /> : null}
        {sel === t.id ? <circle className="sel-ring" r={r + 8} /> : null}
        {st !== "working" ? <circle className={`st-ring st-${st}`} r={r + 3} /> : null}
      </>
    );
  };

  const areaEl = (a: Area) => {
    const sc = corners(a).map((p) => ({ x: sx(p.x), y: sy(p.y) }));
    const pts = sc.map((p) => `${f1(p.x)},${f1(p.y)}`).join(" ");
    const minX = Math.min(...sc.map((p) => p.x)), maxX = Math.max(...sc.map((p) => p.x)), minY = Math.min(...sc.map((p) => p.y));
    const cx = sx(a.x), cy = sy(a.y);
    const l = liveOf(a.id);
    const cls = `node area ${a.kind}${dim(a.id)}${sel === a.id ? " is-sel" : ""}${l ? " lifted" : ""}${a.recorded ? "" : " suggested"}`;
    const wide = maxX - minX;
    let text: ReactNode;
    if (L === 0) {
      text = (
        <>
          {wide > 22 ? <text className="t-far" x={f1(cx)} y={f1(cy + 4)} textAnchor="middle">{a.code}</text> : null}
          {a.kind === "pond" && wide > 30 ? <text className="t-badge" x={f1(cx)} y={f1(cy + 18)} textAnchor="middle">{badge(m, a)}</text> : null}
        </>
      );
    } else {
      // Labels never run into the next pond: the code at middle zoom, the full name (and area) when there's room.
      const full = L === 2 && wide > 96;
      const name = a.kind === "pond" && full ? `${a.label} (${a.code})` : a.code;
      text = (
        <text x={f1(minX)} y={f1(minY - 8)}>
          <tspan className="t-name">{name}</tspan>
          {full && wide > 170 ? <tspan className="t-sub" dx="6">{num(a.w * a.h)} m²{a.recorded ? "" : " · not placed yet"}</tspan> : null}
        </text>
      );
    }
    const turning = l?.mode === "turn";
    const r = Math.max(wide, 40) / 2 + 14;
    return (
      <g key={a.id} className={cls} data-id={a.id} tabIndex={0} role="button" aria-label={a.kind === "pond" ? `${a.label} (${a.code})` : `Reservoir ${a.code}`}>
        <polygon className={`${a.kind === "pond" ? "pond-body" : "water-body"} focus`} points={pts} />
        {text}
        {turning ? (
          <>
            <circle className="rot-ring" cx={f1(cx)} cy={f1(cy)} r={f1(r)} />
            <text className="rot-label" x={f1(cx)} y={f1(cy - r - 8)} textAnchor="middle">{norm360(a.rot)}°</text>
          </>
        ) : null}
      </g>
    );
  };

  const wheelEl = (t: Inner | Spot) => {
    const l = liveOf(t.id);
    const p = screenOf(t.id);
    if (!p) return null;
    const k = shrink(L);
    const b = l?.bearing ?? (isInner(t) ? bearingOf(m, t) : 90);
    const turning = l?.mode === "turn";
    const dir = b - 90, rad = (dir * Math.PI) / 180;
    const guess = (isInner(t) && !t.known) || (isSpot(t) && t.parked) ? " guess" : "";
    return (
      <g key={t.id} className={`node wheel${guess}${dim(t.id)}`} data-id={t.id} transform={`translate(${f1(p.x)} ${f1(p.y)}) scale(${k})`} tabIndex={0} role="button" aria-label={`${t.code}, paddlewheel`}>
        {turning ? (
          <>
            <circle className="rot-ring" r={34} />
            <line className="rot-line" x1={0} y1={0} x2={f1(Math.cos(rad) * 34)} y2={f1(Math.sin(rad) * 34)} />
            <text className="rot-label" x={f1(-Math.cos(rad) * 50)} y={f1(-Math.sin(rad) * 50 + 4)} textAnchor="middle">{b}°</text>
          </>
        ) : null}
        {rings(t, 18)}
        <circle className="hit focus" r={18} />
        <g transform={`rotate(${dir})`}>
          <line className="w-shaft" x1={0} y1={-13} x2={0} y2={13} />
          <rect className="w-wheel" x={-4} y={-14} width={8} height={8} rx={1.5} />
          <rect className="w-wheel" x={-4} y={6} width={8} height={8} rx={1.5} />
          <circle className="w-motor" r={3} />
          <path className="w-arrow" d="M8,-5 L14,0 L8,5" />
        </g>
        {L === 2 && !turning ? <text className="t-code" x={0} y={31} textAnchor="middle">{t.code}</text> : null}
      </g>
    );
  };

  const spotEl = (t: Spot | Inner) => {
    if (t.kind === "paddlewheel") return wheelEl(t);
    const p = screenOf(t.id);
    if (!p) return null;
    const k = shrink(L);
    let g: ReactNode;
    if (t.kind === "bore_well") {
      g = (
        <>
          <circle className="water-body focus" r={16} />
          <circle className="ring" r={10} />
          <circle className="ring" r={4} />
        </>
      );
    } else if (t.kind === "pump") {
      // The triangle points the way the line leaves: to the nearest point of where the water goes.
      const r = m.routes.find((x) => x.owner === t.id && drawn(x.to));
      const to = r ? endPoint(r.to, p) : null;
      const ang = to ? (Math.atan2(to.y - p.y, to.x - p.x) * 180) / Math.PI : 0;
      g = (
        <>
          <circle className="pump-body focus" r={13} />
          <path className="pump-tri" transform={`rotate(${ang.toFixed(1)})`} d="M-5,-6 L7,0 L-5,6 Z" />
        </>
      );
    } else if (t.kind === "pln_meter") {
      g = (
        <>
          <rect className="power-body focus" x={-12} y={-12} width={24} height={24} rx={5} />
          <path className="bolt" d="M2,-8 L-5,1 L-0.5,1 L-2,8 L5,-1 L0.5,-1 Z" />
        </>
      );
    } else if (t.kind === "generator") {
      g = (
        <>
          <circle className="power-body focus" r={14} />
          <path className="gen-wave" d="M-8,0 C-5,-7 -2,-7 0,0 C2,7 5,7 8,0" />
        </>
      );
    } else {
      g = (
        <>
          <circle className="blower-body focus" r={15} />
          {[0, 120, 240].map((r) => (
            <path key={r} className="blade" transform={`rotate(${r})`} d="M0,0 C3,-3 9,-4 10,-1 C10,1 4,2 0,0 Z" />
          ))}
          <circle className="w-motor" r={2.4} />
        </>
      );
    }
    const guess = (isSpot(t) && t.parked) || (isInner(t) && !t.known) ? " guess" : "";
    const rr = R_PX[t.kind] ?? 14;
    return (
      <g key={t.id} className={`node spot${guess}${dim(t.id)}`} data-id={t.id} transform={`translate(${f1(p.x)} ${f1(p.y)}) scale(${k})`} tabIndex={0} role="button" aria-label={`${t.code}, ${t.kind.replace("_", " ")}`}>
        <circle className="hit" r={18} />
        {rings(t, rr)}
        <g>{g}</g>
        {L === 2 ? <text className="t-code" x={0} y={rr + 17} textAnchor="middle">{t.code}</text> : null}
      </g>
    );
  };

  const seg = (a: Pt, b: Pt, cls: string, mk: string, key: string) => (
    <line key={key} className={cls} x1={f1(a.x)} y1={f1(a.y)} x2={f1(b.x)} y2={f1(b.y)} markerEnd={`url(#${mk})`} />
  );
  const lines = m.routes.map((r, i) => {
    if (!layers[r.what]) return null;
    if (!drawn(r.owner) || !drawn(r.to) || (r.from && !drawn(r.from))) return null;
    const mp = screenOf(r.owner);
    if (!mp) return null;
    const cls = `ln-${r.what}`, mk = { water: "mkW", air: "mkA", power: "mkP" }[r.what];
    const owner = m.things.get(r.owner)!;
    const rm = (R_PX[owner.kind] ?? 14) * shrink(L) + 4;
    const edge = (q: Pt) => {
      const d = Math.hypot(q.x - mp.x, q.y - mp.y) || 1;
      return { x: mp.x + ((q.x - mp.x) / d) * rm, y: mp.y + ((q.y - mp.y) / d) * rm };
    };
    const ok = !lit || [r.owner, r.to, ...(r.from ? [r.from] : [])].every((x) => lit.has(x));
    const from = r.from ? endPoint(r.from, mp) : null;
    const to = endPoint(r.to, mp);
    if (!to) return null;
    return (
      <g key={i} className={ok ? "" : "dim"}>
        {from ? seg(from, edge(from), cls, mk, "a") : null}
        {seg(edge(to), to, cls, mk, "b")}
      </g>
    );
  });

  return (
    <div ref={cardRef} className="lm relative flex flex-col gap-2.5 rounded-[14px] border border-line bg-ink-800 p-3">
      {header}
      <div ref={wrapRef} className={`lm-wrap${edit ? " editing" : ""}`}>
        <svg
          ref={svgRef}
          className={`lm-svg${grabbing ? " grabbing" : ""}`}
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-label="Layout drawing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endGesture(e, false)}
          onPointerCancel={(e) => endGesture(e, true)}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={onKeyDown}
        >
          <defs>
            <pattern id="lm-dots" patternUnits="userSpaceOnUse" width={f1(gp)} height={f1(gp)} x={f1(mod(sx(0), gp))} y={f1(mod(sy(0), gp))}>
              <circle className="dotc" cx={1} cy={1} r={1} />
            </pattern>
            <marker id="mkW" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={6} markerHeight={6} orient="auto">
              <path className="mk-w" d="M0,0 L10,5 L0,10 z" />
            </marker>
            <marker id="mkA" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={6} markerHeight={6} orient="auto">
              <path className="mk-a" d="M0,0 L10,5 L0,10 z" />
            </marker>
            <marker id="mkP" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={7} markerHeight={7} orient="auto">
              <path className="mk-p" d="M0,0 L10,5 L0,10 z" />
            </marker>
          </defs>
          <rect width={W} height={H} fill="url(#lm-dots)" />
          {m.areas.map(areaEl)}
          {L >= 1 ? (
            <>
              <g className="lines">{lines}</g>
              {m.strip ? (
                <text className="t-strip" x={f1(sx(m.strip.x) - 16)} y={f1(sy(m.strip.y) - 28)}>
                  Not placed yet{edit ? " · hold one, then drag it to where it is" : " · press Edit to place them"}
                </text>
              ) : null}
              {m.spots.map((t) => spotEl(t))}
              {m.inner.map((t) => spotEl(t))}
            </>
          ) : null}
          <g aria-hidden="true">
            <line className="scale-l" x1={14} y1={H - 16} x2={f1(14 + scaleLen * s)} y2={H - 16} />
            <line className="scale-l" x1={14} y1={H - 21} x2={14} y2={H - 11} />
            <line className="scale-l" x1={f1(14 + scaleLen * s)} y1={H - 21} x2={f1(14 + scaleLen * s)} y2={H - 11} />
            <text className="scale-t" x={f1(22 + scaleLen * s)} y={H - 12}>{scaleLen} m</text>
          </g>
          <g transform="translate(22 30)" aria-hidden="true">
            <path className="compass-a" d="M0,-16 L6,-3 L0,-6 L-6,-3 Z" />
            <text className="compass-n" x={0} y={11} textAnchor="middle">N</text>
          </g>
        </svg>
        <div className="absolute right-2.5 top-2.5 grid gap-1.5" role="group" aria-label="Zoom">
          {[
            ["+", "Zoom in", () => zoomAt(W / 2, H / 2, 1.5)],
            ["−", "Zoom out", () => zoomAt(W / 2, H / 2, 1 / 1.5)],
            ["Fit", "Fit everything", () => fitAll()],
          ].map(([txt, aria, fn]) => (
            <button
              key={aria as string}
              type="button"
              aria-label={aria as string}
              onClick={() => {
                (fn as () => void)();
                rerender();
              }}
              className={`grid h-[38px] w-[38px] place-items-center rounded-[10px] border border-line-strong bg-ink-750 text-tx-strong hover:border-tx-ghost ${txt === "Fit" ? "text-[11px] font-semibold" : "text-[19px] leading-none"}`}
            >
              {txt as string}
            </button>
          ))}
        </div>
      </div>
      {footer}
      {popup ? (
        <div ref={popRef} className="lm-pop" role="dialog" aria-label="Paddlewheel spot" tabIndex={-1}>
          {popup.node}
        </div>
      ) : null}
      {info ? (
        <div ref={infoRef} className="lm-info" role="dialog" aria-label="Details" tabIndex={-1}>
          {info.node}
        </div>
      ) : null}
    </div>
  );
});
