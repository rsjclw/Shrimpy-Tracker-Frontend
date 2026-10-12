"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Details } from "@/components/layout-map/Details";
import { LayoutMap, type MapHandle } from "@/components/layout-map/LayoutMap";
import { MachineList } from "@/components/layout-map/MachineList";
import {
  buildModel,
  clamp,
  draftSize,
  emptyDraft,
  insideArea,
  isArea,
  isInner,
  norm360,
  worldToArea,
  type Draft,
  type Model,
  type What,
} from "@/components/layout-map/model";
import { readWheelDraft, WheelEditor, wheelDraftFor, type WheelDraft } from "@/components/layout-map/WheelEditor";
import { Banner, Loading } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { api, type Equipment, type EquipmentDetail, type Farm, type Grid, type Pond } from "@/lib/api";
import { load, peek } from "@/lib/cache";
import { todayIso } from "@/lib/dates";
import { canAdd as roleCanAdd, canManage as roleCanManage } from "@/lib/roles";
import { useRequireUser } from "@/lib/session";

const FIRST_DRAWN = "Already in place when first drawn; start date unknown.";
const round2 = (n: number) => Math.round(n * 100) / 100;

export default function LayoutPage() {
  const user = useRequireUser();
  const today = todayIso();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [ponds, setPonds] = useState<Pond[] | null>(null);
  const [equipment, setEquipment] = useState<Equipment[] | null>(null);
  const [details, setDetails] = useState<Record<string, EquipmentDetail>>({});
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [layers, setLayers] = useState<Record<What, boolean>>({ water: true, air: true, power: true });
  const [sel, setSel] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editor, setEditor] = useState<WheelDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const mapRef = useRef<MapHandle>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef(0);

  const say = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    if (msg) toastTimer.current = window.setTimeout(() => setToast(""), 7000);
  }, []);

  // Farm (for the role) and grid from the URL, through the same cache the dashboard fills.
  useEffect(() => {
    if (!user) return;
    const q = new URLSearchParams(window.location.search);
    const farmId = q.get("farm");
    const gridId = q.get("grid");
    if (!farmId || !gridId) {
      setError("Open the layout from a grid on the dashboard.");
      return;
    }
    (async () => {
      const farms = peek<Farm[]>("farms")?.value ?? (await load("farms", api.listFarms, { persist: true }));
      const f = farms.find((x) => x.id === farmId) ?? null;
      if (!f) throw new Error("Farm not found.");
      setFarm(f);
      const grids = peek<{ grids: Grid[] }>(`farm:${farmId}`)?.value?.grids ?? (await api.listGrids(farmId));
      const g = grids.find((x) => x.id === gridId) ?? null;
      if (!g) throw new Error("Grid not found.");
      setGrid(g);
    })().catch((e: Error) => setError(e.message));
  }, [user]);

  const reload = useCallback(async () => {
    if (!grid) return;
    const [p, e] = await Promise.all([api.listPonds(grid.id), api.listEquipment(grid.id)]);
    setPonds(p);
    setEquipment(e);
  }, [grid]);
  useEffect(() => {
    reload().catch((e: Error) => setError(e.message));
  }, [reload]);

  const canAdd = roleCanAdd(farm?.role);
  const canManage = roleCanManage(farm?.role);

  // The layout as saved plus this session's changes; `m` also shows what the wheel popup is typing.
  const mBase = useMemo<Model | null>(() => (ponds && equipment ? buildModel(ponds, equipment, draft) : null), [ponds, equipment, draft]);
  const typed = useMemo(() => (mBase && editor ? readWheelDraft(mBase, editor) : null), [mBase, editor]);
  const m = useMemo<Model | null>(() => {
    if (!ponds || !equipment) return null;
    if (!editor || !typed || "err" in typed) return mBase;
    return buildModel(ponds, equipment, draft, { id: editor.id, ...typed });
  }, [ponds, equipment, draft, editor, typed, mBase]);

  // Details: the history comes from the machine's own record, read when it is opened.
  const fetchDetail = useCallback((id: string) => {
    api.getEquipment(id).then((d) => setDetails((cur) => ({ ...cur, [id]: d }))).catch(() => {});
  }, []);
  const openInfo = useCallback(
    (id: string) => {
      setEditor(null);
      setSel(id);
      setInfo(id);
      if (equipment?.some((e) => e.id === id)) fetchDetail(id);
    },
    [equipment, fetchDetail],
  );
  const openFromList = (id: string) => {
    if (edit) {
      setSel(id);
      return;
    }
    mapRef.current?.showOnMap(id);
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    openInfo(id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editor) setEditor(null);
      else if (info) setInfo(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, info]);

  // ---- Edit session: everything waits in `draft` until Done ----
  function startEdit() {
    setInfo(null);
    setEditor(null);
    setDraft(emptyDraft());
    setEdit(true);
    say("");
  }
  function cancelEdit() {
    const changed = draftSize(draft) > 0;
    setDraft(emptyDraft());
    setEditor(null);
    setEdit(false);
    say(changed ? "Changes discarded." : "");
  }
  async function finishEdit() {
    if (!equipment || !ponds || !mBase) return;
    const total = draftSize(draft);
    if (!total) {
      setEdit(false);
      setEditor(null);
      return;
    }
    setSaving(true);
    setError(null);
    const left: Draft = { ponds: { ...draft.ponds }, grid: { ...draft.grid }, inner: { ...draft.inner } };
    const pondIds = new Set(ponds.map((p) => p.id));
    try {
      for (const [id, v] of Object.entries(draft.ponds)) {
        await api.setPondLayout(id, { x_m: round2(v.x), y_m: round2(v.y), rotation: norm360(v.rot) });
        delete left.ponds[id];
      }
      for (const [id, v] of Object.entries(draft.grid)) {
        const eq = equipment.find((e) => e.id === id);
        if (!eq) continue;
        const pl = eq.placement;
        const onGrid = !!pl && !pl.pond_id && !pl.in_equipment_id && !pl.warehouse_id;
        const bearing = eq.kind === "reservoir" ? norm360(v.rot) : pl?.bearing ?? null;
        const spot = { x_m: round2(v.x), y_m: round2(v.y), bearing };
        // A drawing fix keeps its history; something drawn for the first time gets a first spot.
        if (onGrid && pl) await api.fixEquipmentPlacement(pl.id, { ...spot, from_date: pl.from_date, to_date: pl.to_date, note: pl.note });
        else await api.addEquipmentPlacement(id, { ...spot, from_date: today, note: FIRST_DRAWN });
        delete left.grid[id];
      }
      for (const [id, v] of Object.entries(draft.inner)) {
        const eq = equipment.find((e) => e.id === id);
        if (!eq) continue;
        const pl = eq.placement;
        const where = pondIds.has(v.in) ? { pond_id: v.in, in_equipment_id: null } : { pond_id: null, in_equipment_id: v.in };
        const spot = { ...where, warehouse_id: null, x_m: round2(v.u), y_m: round2(v.v), bearing: norm360(v.b) };
        if (v.mode === "fix" && pl) await api.fixEquipmentPlacement(pl.id, { ...spot, from_date: pl.from_date, to_date: pl.to_date, note: pl.note });
        else await api.addEquipmentPlacement(id, { ...spot, from_date: today, note: pl ? null : FIRST_DRAWN });
        delete left.inner[id];
      }
      await reload();
      setDraft(emptyDraft());
      setEdit(false);
      setEditor(null);
      setDetails({});
      say(`Saved ${total} change${total === 1 ? "" : "s"}.`);
    } catch (e) {
      // What went through is saved; what didn't stays in the draft to try again.
      await reload().catch(() => {});
      setDraft(left);
      setError(`${e instanceof Error ? e.message : "Could not save."} ${draftSize(left)} change${draftSize(left) === 1 ? "" : "s"} not saved yet; press Done to try again, or Cancel.`);
    } finally {
      setSaving(false);
    }
  }

  // ---- What the map reports ----
  const openEditor = (id: string, over: Partial<WheelDraft> = {}) => {
    if (!mBase) return;
    const d = wheelDraftFor(mBase, id, over);
    if (!d) return;
    setInfo(null);
    setSel(id);
    setEditor(d);
  };
  const editorChanged = (() => {
    if (!editor || !mBase || !typed || "err" in typed) return false;
    const cur = mBase.things.get(editor.id);
    if (!isInner(cur)) return true;
    return typed.in !== cur.in || Math.abs(typed.u - cur.u) >= 0.05 || Math.abs(typed.v - cur.v) >= 0.05 || typed.b !== norm360(cur.b) || !cur.known;
  })();
  function keepEditor(how: "moved" | "fix") {
    if (!editor || !typed || "err" in typed) return;
    const id = editor.id;
    const code = mBase?.things.get(id)?.code ?? "";
    setDraft((d) => {
      const grid = { ...d.grid };
      delete grid[id];
      return { ...d, grid, inner: { ...d.inner, [id]: { ...typed, mode: how } } };
    });
    setEditor(null);
    say(how === "fix" ? `${code}: drawing fixed, saved when you press Done. Its history stays as it is.` : `${code}: recorded as moved today when you press Done.`);
  }

  const mapProps = {
    onTap: (id: string | null) => {
      setEditor(null);
      setInfo(null);
      setSel(id);
    },
    onHold: (id: string) => openInfo(id),
    onAreaChange: (id: string, v: { x: number; y: number; rot: number }) => {
      const t = mBase?.things.get(id);
      if (!isArea(t)) return;
      setSel(id);
      setDraft((d) => (t.kind === "pond" ? { ...d, ponds: { ...d.ponds, [id]: v } } : { ...d, grid: { ...d.grid, [id]: v } }));
    },
    onSpotMove: (id: string, x: number, y: number) => {
      setSel(id);
      setDraft((d) => ({ ...d, grid: { ...d.grid, [id]: { x, y, rot: 0 } } }));
    },
    // A dragged wheel lands in whatever area it's dropped on; the popup then asks how to keep it.
    onDropInner: (id: string, w: { x: number; y: number }) => {
      if (!mBase) return;
      const target = [...mBase.areas].reverse().find((a) => insideArea(a, w.x, w.y));
      if (!target) {
        say("Drop it inside a pond or reservoir.");
        return;
      }
      const p = worldToArea(target, w.x, w.y);
      const at = { in: target.id, us: String(Math.round(clamp(p.u, 0, target.w) * 10) / 10), vs: String(Math.round(clamp(p.v, 0, target.h) * 10) / 10) };
      const cur = mBase.things.get(id);
      if (isInner(cur)) openEditor(id, at);
      else {
        // Not in any pond yet: it starts pushing east.
        setInfo(null);
        setSel(id);
        setEditor({ id, ...at, bs: "90" });
      }
    },
    onTurnInner: (id: string, bearing: number) => openEditor(id, { bs: String(bearing) }),
    onEditInner: (id: string) => openEditor(id),
    onTouch: () => {
      // Touching the map again drops what the popup hadn't kept.
      if (editor) setEditor(null);
    },
  };

  if (!user) return <Loading />;
  const ready = m && ponds && equipment;
  const empty = ready && !m.areas.length && !m.spots.length && !m.inner.length;
  const eqOf = (id: string) => equipment?.find((e) => e.id === id) ?? null;
  const pending = draftSize(draft);

  const header = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lines to show">
          {(
            [
              ["water", "Water", "border-sky"],
              ["air", "Air", "border-dotted border-accent"],
              ["power", "Power", "border-dashed border-moon"],
            ] as [What, string, string][]
          ).map(([k, txt, sw]) => (
            <button
              key={k}
              type="button"
              data-layer={k}
              aria-pressed={layers[k]}
              onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))}
              className={`inline-flex h-8 items-center gap-2 rounded-full border border-line-strong px-3 text-[13px] font-medium ${layers[k] ? "bg-ink-750 text-tx-strong" : "text-tx-dim"}`}
            >
              <span className={`h-0 w-[18px] border-t-2 ${sw} ${layers[k] ? "" : "opacity-35"}`} />
              {txt}
            </button>
          ))}
        </div>
        {canManage ? (
          <div className="flex gap-2">
            {edit ? (
              <button type="button" onClick={cancelEdit} disabled={saving} className="h-[34px] rounded-[10px] border border-line-strong bg-ink-750 px-3.5 text-[13px] font-semibold text-tx-strong hover:border-tx-ghost disabled:opacity-40">
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              id="layout-edit"
              aria-pressed={edit}
              disabled={saving}
              onClick={edit ? finishEdit : startEdit}
              className={`inline-flex h-[34px] items-center gap-1.5 rounded-[10px] px-3.5 text-[13px] font-semibold disabled:opacity-40 ${edit ? "bg-accent text-accent-ink hover:brightness-110" : "border border-line-strong bg-ink-750 text-tx-strong hover:border-tx-ghost"}`}
            >
              <Icon name={edit ? "check" : "pencil"} size={15} strokeWidth={2.2} />
              {edit ? (saving ? "Saving…" : pending ? `Done (${pending})` : "Done") : "Edit"}
            </button>
          </div>
        ) : null}
      </div>
      {edit ? (
        <p className="m-0 text-[13px] leading-normal text-accent">
          Drag anywhere to pan. To move something, hold it until it lifts, then drag. Hold longer, until the turning ring appears, to turn a pond, reservoir or
          paddlewheel. Click a paddlewheel to type its spot and bearing. Done saves; Cancel puts everything back.
        </p>
      ) : null}
      {toast ? (
        <div role="status" aria-live="polite" className="rounded-lg border border-line-strong bg-ink-750 px-3 py-2 text-[13px] text-tx-soft">
          {toast}
        </div>
      ) : null}
    </>
  );

  const editorTarget = editor && m ? m.things.get(editor.id) : null;
  const editorPl = editor ? eqOf(editor.id)?.placement ?? null : null;

  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 pb-12 pt-5">
      <PageHeader eyebrow={`${farm?.name ?? "—"} · ${grid?.name ?? "—"}`} title="Layout" backHref={farm && grid ? `/?farm=${farm.id}&grid=${grid.id}` : "/"} />
      {error ? <Banner onDismiss={() => setError(null)}>{error}</Banner> : null}
      {!ready ? (
        error ? null : <Loading label="Loading the layout…" />
      ) : empty ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-ink-850 p-5 text-center text-sm text-tx-muted">
          Nothing on this grid yet. Ponds come from the dashboard; reservoirs, wells and machines are added through Claude.
        </div>
      ) : (
        <>
          <div ref={cardRef}>
            <LayoutMap
              ref={mapRef}
              m={m}
              edit={edit}
              sel={sel}
              layers={layers}
              header={header}
              footer={
                <p className="m-0 text-xs leading-normal text-tx-faint">
                  Drag to pan; pinch, Ctrl + scroll or the buttons to zoom. Tap something to highlight what it connects to; hold it for half a second to see its details. Zoom in
                  to see machines and their codes. Faint or dashed means its spot isn&apos;t recorded yet.
                </p>
              }
              popup={
                edit && editor && editorTarget
                  ? {
                      anchor: editor.id,
                      node: (
                        <WheelEditor
                          m={m}
                          draft={editor}
                          changed={editorChanged}
                          hasPlacement={!!editorPl && !!(editorPl.pond_id || editorPl.in_equipment_id)}
                          since={editorPl?.from_date ?? null}
                          onChange={setEditor}
                          onSave={keepEditor}
                          onCancel={() => setEditor(null)}
                        />
                      ),
                    }
                  : null
              }
              info={
                !edit && info && m.things.has(info)
                  ? {
                      anchor: info,
                      node: (
                        <Details
                          m={m}
                          id={info}
                          detail={details[info] ?? null}
                          canAdd={canAdd}
                          today={today}
                          onGo={(id) => openInfo(id)}
                          onClose={() => setInfo(null)}
                          onZoom={(id) => mapRef.current?.fitArea(id)}
                          onAdded={(msg) => {
                            say(msg);
                            reload().catch(() => {});
                            fetchDetail(info);
                          }}
                        />
                      ),
                    }
                  : null
              }
              {...mapProps}
            />
          </div>
          <MachineList m={m} sel={sel} onOpen={openFromList} />
        </>
      )}
    </main>
  );
}
