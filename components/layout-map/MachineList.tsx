"use client";

import { useMemo, useState } from "react";

import type { EquipmentKind } from "@/lib/api";
import { mediumDate } from "@/lib/dates";
import { EVENT_KINDS, Go, StatusPill } from "./Details";
import {
  groupOf,
  isArea,
  isInner,
  isSpot,
  KIND_LABEL,
  KIND_PLURAL,
  label,
  spotWords,
  statusOf,
  type Area,
  type Model,
  type Thing,
} from "./model";

/** "Pumps" → "pumps", but "PLN meters" stays. */
const lower = (s: string) => (/^[A-Z]{2}/.test(s) ? s : s.toLowerCase());

function whereText(m: Model, t: Thing) {
  if (isInner(t)) {
    const a = m.things.get(t.in) as Area;
    return `${label(m, t.in)} · ${t.known ? spotWords(a, t.u, t.v) : "spot not recorded yet"}`;
  }
  if (isArea(t)) return t.recorded ? "On the drawing" : "Not placed yet";
  if (isSpot(t)) return t.parked ? "Not placed yet" : "On the drawing";
  return "In storage";
}

/** Every machine on the grid, grouped by the pond it serves, with "Needs attention" on top. */
export function MachineList({ m, sel, onOpen }: { m: Model; sel: string | null; onOpen: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EquipmentKind | "all">("all");
  const [open, setOpen] = useState<Set<string>>(() => new Set(["attn"]));
  const q = search.trim().toLowerCase();

  const machines = useMemo(() => {
    const all: Thing[] = [...m.areas.filter((a) => a.kind === "reservoir"), ...m.spots, ...m.inner, ...m.stored];
    return all
      .filter((t) => filter === "all" || t.kind === filter)
      .filter((t) => {
        if (!q) return true;
        const g = groupOf(m, t);
        return [t.code, t.name ?? "", KIND_LABEL[t.kind], g === "shared" ? "" : label(m, g)].join(" ").toLowerCase().includes(q);
      });
  }, [m, filter, q]);
  const kinds = useMemo(() => {
    const present = new Set<string>([...m.areas.filter((a) => a.kind === "reservoir"), ...m.spots, ...m.inner, ...m.stored].map((t) => t.kind));
    return (Object.keys(KIND_PLURAL) as EquipmentKind[]).filter((k) => present.has(k));
  }, [m]);

  const groups = new Map<string, Thing[]>();
  for (const t of machines) {
    const g = groupOf(m, t);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(t);
  }
  const attn = machines.filter((t) => statusOf(t) !== "working");
  const order = [...m.areas.filter((a) => a.kind === "pond"), ...m.areas.filter((a) => a.kind === "reservoir")].map((a) => a.id).concat("shared");
  const count = (ts: Thing[]) =>
    Object.entries(ts.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.kind]: (acc[t.kind] ?? 0) + 1 }), {}))
      .map(([k, n]) => `${n} ${lower(n === 1 ? KIND_LABEL[k as EquipmentKind] : KIND_PLURAL[k as EquipmentKind])}`)
      .join(" · ");
  const toggle = (k: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const groupRows = (key: string, title: string, ts: Thing[], attnGroup = false) => {
    const isOpen = !!q || open.has(key);
    return [
      <tr
        key={`g-${key}`}
        data-group={key}
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={() => toggle(key)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle(key);
          }
        }}
        className="cursor-pointer"
      >
        <td colSpan={6} className={`bg-ink-900 px-2.5 py-2.5 font-semibold hover:bg-ink-750 ${attnGroup ? "text-bad-soft" : "text-tx-strong"}`}>
          <span className={`inline-block w-4 text-tx-dim transition-transform ${isOpen ? "rotate-90" : ""}`}>▸</span>
          {title}
          <span className="ml-2 text-[12.5px] font-normal text-tx-dim">{count(ts)}</span>
        </td>
      </tr>,
      ...(isOpen
        ? ts.map((t) => {
            const e = t.eq?.last_event;
            const rs = m.routes.filter((r) => r.owner === t.id);
            return (
              <tr key={`${key}-${t.id}`} className={`hover:bg-ink-750 ${sel === t.id ? "bg-accent/[0.07]" : ""}`}>
                <td className="border-b border-line-faint px-2.5 py-2">
                  <Go m={m} id={t.id} onGo={onOpen} />
                </td>
                <td className="border-b border-line-faint px-2.5 py-2 text-tx-soft">{KIND_LABEL[t.kind]}</td>
                <td className="border-b border-line-faint px-2.5 py-2 text-tx-soft">{whereText(m, t)}</td>
                <td className="border-b border-line-faint px-2.5 py-2 font-mono tabular-nums text-tx-soft">
                  {rs.length ? rs.map((r) => `${r.from ? `${label(m, r.from)} ` : ""}→ ${label(m, r.to)}`).join("; ") : "—"}
                </td>
                <td className="border-b border-line-faint px-2.5 py-2">
                  <StatusPill status={statusOf(t)} />
                </td>
                <td className="border-b border-line-faint px-2.5 py-2 text-tx-dim">{e ? `${mediumDate(e.date)} · ${EVENT_KINDS[e.kind]?.[0] ?? e.kind}` : "—"}</td>
              </tr>
            );
          })
        : []),
    ];
  };

  return (
    <section aria-label="Machines" className="flex flex-col gap-3 rounded-[14px] border border-line bg-ink-800 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="m-0 text-[17px] font-semibold text-tx-strong">Machines</h2>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search codes, kinds, ponds"
          aria-label="Search machines"
          autoComplete="off"
          className="h-9 min-w-0 max-w-[340px] flex-[1_1_220px] rounded-[9px] border border-line bg-ink-850 px-3 text-sm text-tx-strong outline-none focus:border-accent"
        />
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
        {(["all", ...kinds] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            onClick={() => setFilter(k)}
            className={`h-8 rounded-full border border-line-strong px-3 text-[13px] font-medium ${filter === k ? "bg-ink-750 text-tx-strong" : "text-tx-dim"}`}
          >
            {k === "all" ? "All" : KIND_PLURAL[k]}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr>
              {["Code", "Kind", "Where", "From → to", "Status", "Last entry"].map((h) => (
                <th key={h} className="border-b border-line px-2.5 py-2 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-tx-dim">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attn.length ? groupRows("attn", "Needs attention", attn, true) : null}
            {order.flatMap((key) => {
              const ts = groups.get(key);
              return ts && ts.length ? groupRows(key, key === "shared" ? "Wells, pumps and power" : label(m, key), ts) : [];
            })}
            {!machines.length ? (
              <tr>
                <td colSpan={6} className="px-2.5 py-3 text-tx-dim">
                  {m.areas.length || m.spots.length ? "Nothing matches." : "No machines recorded on this grid yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
