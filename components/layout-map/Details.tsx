"use client";

import { useState, type ReactNode } from "react";

import { api, type EquipmentDetail, type EquipmentEventKind, type EquipmentStatus } from "@/lib/api";
import { mediumDate } from "@/lib/dates";
import { rupiah } from "@/lib/num";
import {
  backupsOf,
  dirWords,
  fm,
  hpOf,
  innerIn,
  isArea,
  isInner,
  isSpot,
  KIND_LABEL,
  label,
  placementWords,
  POWER_KINDS,
  powerFeeds,
  spotWords,
  STATUS_LABEL,
  statusOf,
  waterChain,
  type Area,
  type Model,
  type Thing,
} from "./model";

export const EVENT_KINDS: Record<EquipmentEventKind, [string, string]> = {
  broken: ["Broken", "bg-bad"],
  sent_for_repair: ["Sent for repair", "bg-warn"],
  repaired: ["Repaired", "bg-good"],
  serviced: ["Serviced", "bg-accent"],
  part_replaced: ["Part replaced", "bg-accent"],
  disinfected: ["Disinfected", "bg-accent"],
  note: ["Note", "bg-tx-ghost"],
  retired: ["Retired", "bg-tx-ghost"],
};
const PILL: Record<EquipmentStatus, string> = {
  working: "border-good/30 bg-good/[0.07] text-good",
  broken: "border-bad/35 bg-bad/[0.08] text-bad",
  in_repair: "border-warn/35 bg-warn/[0.07] text-warn",
  retired: "border-line-strong text-tx-faint",
};
const SUPPLY_HZ = 50; // PLN and gensets in Indonesia
const numText = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });

export function StatusPill({ status }: { status: EquipmentStatus }) {
  return (
    <span className={`inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-xs font-semibold ${PILL[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Go({ m, id, onGo, here }: { m: Model; id: string; onGo: (id: string) => void; here?: boolean }) {
  const text = label(m, id);
  if (here)
    return <span className="inline-flex h-[26px] items-center whitespace-nowrap rounded-[7px] border border-dashed border-line-strong px-2 font-mono text-[12.5px] text-tx-soft">{text}</span>;
  return (
    <button
      type="button"
      data-go={id}
      onClick={() => onGo(id)}
      className="inline-flex h-[26px] items-center whitespace-nowrap rounded-[7px] border border-line-strong bg-ink-750 px-2 font-mono text-[12.5px] font-medium text-tx-strong hover:border-accent hover:text-accent-hover"
    >
      {text}
    </button>
  );
}

const Sec = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-2">
    <div className="eyebrow">{title}</div>
    {children}
  </section>
);
const Rows = ({ children }: { children: ReactNode }) => <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{children}</ul>;
const Row = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[9px] border border-line-soft bg-ink-850 px-2.5 py-2 text-[13px]">
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">{children}</span>
    {right ?? <span />}
  </li>
);
const Note = ({ children, bad }: { children: ReactNode; bad?: boolean }) => (
  <p className={`m-0 text-[13px] leading-normal ${bad ? "text-bad-soft" : "text-tx-dim"}`}>{children}</p>
);
const Stat = ({ children, bad }: { children: ReactNode; bad?: boolean }) => (
  <p className={`m-0 font-mono text-[13px] leading-relaxed ${bad ? "text-bad-soft" : "text-tx-soft"}`}>{children}</p>
);

function Head({ eyebrow, title, mono, right, onClose }: { eyebrow: string; title: string; mono?: boolean; right?: ReactNode; onClose: () => void }) {
  return (
    <div className="p-head flex flex-col gap-1.5">
      <div className="eyebrow">{eyebrow}</div>
      <div className="flex items-center justify-between gap-2.5">
        <h2 className={`m-0 min-w-0 text-tx-strong ${mono ? "font-mono text-[22px] font-semibold" : "text-2xl font-bold"}`}>{title}</h2>
        <span className="flex items-center gap-2">
          {right}
          <button type="button" data-info-close onClick={onClose} aria-label="Close details" className="h-[30px] w-[30px] rounded-lg border border-line-strong text-[13px] text-tx-dim hover:text-tx-strong">
            ✕
          </button>
        </span>
      </div>
    </div>
  );
}

// ---- Specs ----
type Spec = Record<string, unknown>;
const SPEC_LABEL: Record<string, [string, (v: unknown) => string]> = {
  brand: ["Brand", (v) => String(v)],
  hp: ["Power", (v) => `${v} HP`],
  size_in: ["Size", (v) => `${v}″`],
  diameter_in: ["Diameter", (v) => `${v}″`],
  width_m: ["Width", (v) => `${v} m`],
  length_m: ["Length", (v) => `${v} m`],
  type: ["Type", (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1)],
  kva: ["Capacity", (v) => `${v} kVA`],
  fuel: ["Fuel", (v) => String(v)],
  meter_no: ["Meter number", (v) => String(v)],
  holder: ["Name on the account", (v) => String(v)],
  diffusers: ["Diffusers", (v) => (typeof v === "object" && v ? Object.entries(v).map(([p, n]) => `${p}: ${n}`).join(", ") : String(v))],
};
const MOTOR_LABEL: Record<string, [string, (v: unknown) => string]> = {
  hp: ["Motor power", (v) => `${v} HP`],
  phase: ["Motor phase", (v) => `${v}-phase`],
  hz: ["Rated frequency", (v) => `${v} Hz`],
  rpm: ["Motor speed", (v) => `${numText(Number(v))} rpm`],
  brand: ["Motor brand", (v) => String(v)],
};
const BLOWER_LABEL: Record<string, [string, (v: unknown) => string]> = {
  brand: ["Blower brand", (v) => String(v)],
  size_in: ["Blower size", (v) => `${v}″`],
  rpm: ["Known point", (v) => `${numText(Number(v))} rpm`],
  airflow_m3_min: ["Airflow there", (v) => `${v} m³/min`],
};

/** A blower's speed and airflow on the 50 Hz supply, through its pulleys (DOCS "Specs by kind"). */
function realOutput(sp: Spec): [string, string][] {
  const m = (sp.motor ?? {}) as Spec, b = (sp.blower ?? {}) as Spec, p = sp.pulley as Spec | undefined;
  const rpm = Number(m.rpm), hz = Number(m.hz);
  if (!(rpm > 0)) return [];
  const motorRpm = hz > 0 ? (rpm * SUPPLY_HZ) / hz : rpm;
  const pm = Number(p?.motor), pb = Number(p?.blower);
  const blowerRpm = pm > 0 && pb > 0 ? (motorRpm * pm) / pb : motorRpm;
  const known = Number(b.airflow_m3_min), atRpm = Number(b.rpm);
  const air = known > 0 && atRpm > 0 ? (known * blowerRpm) / atRpm : null;
  return [
    [`Real speed on ${SUPPLY_HZ} Hz`, `${numText(Math.round(blowerRpm))} rpm`],
    ["Real airflow", air ? `≈ ${air.toFixed(2)} m³/min (${Math.round(air * 60)} m³/h)` : "airflow not recorded yet"],
  ];
}

function Specs({ t }: { t: Thing }) {
  const sp = (t.eq?.specs ?? {}) as Spec;
  const f: [string, string][] = [];
  if (t.name && !isArea(t)) f.push(["Name", t.name]);
  for (const [k, v] of Object.entries(sp)) {
    if (k === "motor" && v && typeof v === "object")
      Object.entries(v as Spec).forEach(([mk, mv]) => f.push(MOTOR_LABEL[mk] ? [MOTOR_LABEL[mk][0], MOTOR_LABEL[mk][1](mv)] : [`Motor ${mk}`, String(mv)]));
    else if (k === "blower" && v && typeof v === "object")
      Object.entries(v as Spec).forEach(([bk, bv]) => f.push(BLOWER_LABEL[bk] ? [BLOWER_LABEL[bk][0], BLOWER_LABEL[bk][1](bv)] : [`Blower ${bk}`, String(bv)]));
    else if (k === "pulley" && v && typeof v === "object") f.push(["Pulleys (motor : blower)", `${(v as Spec).motor} : ${(v as Spec).blower}`]);
    else f.push(SPEC_LABEL[k] ? [SPEC_LABEL[k][0], SPEC_LABEL[k][1](v)] : [k, typeof v === "object" ? JSON.stringify(v) : String(v)]);
  }
  if (t.kind === "blower") f.push(...realOutput(sp));
  if (!f.length) return <Note>No specs recorded yet.</Note>;
  return (
    <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
      {f.map(([k, v], i) => (
        <div key={i} className="flex min-w-0 flex-col gap-[3px]">
          <dt className="text-[10px] uppercase tracking-[0.06em] text-tx-dim">{k}</dt>
          <dd className="m-0 break-words font-mono text-[13px] tabular-nums text-tx-strong">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---- Sections shared by areas and machines ----
function Aeration({ m, a, onGo }: { m: Model; a: Area; onGo: (id: string) => void }) {
  const wheels = innerIn(m, a.id).filter((t) => t.kind === "paddlewheel");
  const work = wheels.filter((w) => statusOf(w) === "working");
  const hp = (ws: Thing[]) => ws.reduce((s, w) => s + hpOf(w), 0);
  const blowers = m.routes.filter((r) => r.to === a.id && r.what === "air").map((r) => m.things.get(r.owner)!).filter(Boolean);
  const short = a.kind === "reservoir" && !work.length;
  if (!wheels.length && !blowers.length)
    return (
      <Sec title="Aeration">
        <Note bad={short}>{short ? "No paddlewheel here. A reservoir always needs one." : "Nothing recorded yet."}</Note>
      </Sec>
    );
  return (
    <Sec title="Aeration">
      <Stat bad={short}>
        {work.length} of {wheels.length} paddlewheels working · {fm(hp(work))} of {fm(hp(wheels))} HP
      </Stat>
      <Rows>
        {wheels.map((w) => (
          <Row key={w.id} right={<StatusPill status={statusOf(w)} />}>
            <Go m={m} id={w.id} onGo={onGo} />
            <span className="min-w-[120px] flex-1 leading-snug text-tx-dim">{isInner(w) ? placementWords(m, w) : ""}</span>
          </Row>
        ))}
        {blowers.map((b) => (
          <Row key={b.id} right={<StatusPill status={statusOf(b)} />}>
            <Go m={m} id={b.id} onGo={onGo} />
            <span className="min-w-[120px] flex-1 leading-snug text-tx-dim">{b.name ?? "Blower"}</span>
          </Row>
        ))}
      </Rows>
    </Sec>
  );
}

function PowerFrom({ m, id, onGo }: { m: Model; id: string; onGo: (id: string) => void }) {
  const rs = powerFeeds(m, id);
  return (
    <Sec title="Power from">
      {rs.length ? (
        <Rows>
          {rs.map((r, i) => {
            const src = m.things.get(r.owner)!;
            return (
              <Row key={i}>
                <Go m={m} id={r.owner} onGo={onGo} />
                <span className="text-tx-dim">{src.name ?? KIND_LABEL[src.kind]}</span>
                {backupsOf(m, r.owner).map((b) => (
                  <span key={b.owner} className="inline-flex items-center gap-2">
                    <span className="text-tx-dim">· backup</span>
                    <Go m={m} id={b.owner} onGo={onGo} />
                  </span>
                ))}
              </Row>
            );
          })}
        </Rows>
      ) : (
        <Note>Not recorded yet.</Note>
      )}
    </Sec>
  );
}

// ---- History ----
type TlItem = { date: string; rank: number; seq: number; k: string; dot: string; text: string; meta: string };
function timeline(m: Model, d: EquipmentDetail): TlItem[] {
  const items: TlItem[] = [];
  let seq = 0;
  // Spots inside ponds and reservoirs are history; a spot on the drawing is just the drawing.
  const pls = d.placements.filter((p) => p.pond_id || p.in_equipment_id || p.warehouse_id).sort((x, y) => x.from_date.localeCompare(y.from_date));
  const where = (p: (typeof pls)[number]) => {
    if (p.warehouse_id) return "into storage";
    const cid = (p.pond_id ?? p.in_equipment_id)!;
    const a = m.things.get(cid);
    const name = a ? label(m, cid) : "a pond on another grid";
    if (!isArea(a) || p.x_m == null || p.y_m == null) return `${name}, spot not recorded`;
    return `${name}, ${spotWords(a, Number(p.x_m), Number(p.y_m))}${p.bearing != null ? `, pushing ${dirWords(a.rot + p.bearing)}` : ""}`;
  };
  pls.forEach((p, i) => {
    const prev = pls[i - 1];
    const same = prev && (prev.pond_id ?? prev.in_equipment_id) === (p.pond_id ?? p.in_equipment_id);
    const k = !prev ? "Placed" : same && prev.x_m === p.x_m && prev.y_m === p.y_m ? "Turned" : "Moved";
    items.push({ date: p.from_date, rank: 1, seq: seq++, k, dot: "bg-sky", text: where(p), meta: p.note ?? "" });
  });
  for (const e of d.events) {
    const meta = [e.cost ? rupiah(e.cost) : null, e.run_hours != null ? `${numText(Number(e.run_hours))} h on the meter` : null, e.created_by].filter(Boolean).join(" · ");
    items.push({ date: e.date, rank: 0, seq: seq++, k: EVENT_KINDS[e.kind]?.[0] ?? e.kind, dot: EVENT_KINDS[e.kind]?.[1] ?? "bg-tx-faint", text: e.note ?? "", meta });
  }
  return items.sort((x, y) => y.date.localeCompare(x.date) || y.rank - x.rank || y.seq - x.seq);
}

function History({ m, detail }: { m: Model; detail: EquipmentDetail | null }) {
  if (!detail) return <Note>Loading history…</Note>;
  const tl = timeline(m, detail);
  if (!tl.length) return <Note>Nothing recorded yet.</Note>;
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {tl.map((it, i) => (
        <li key={i} className="relative grid grid-cols-[14px_minmax(0,1fr)] gap-2.5 pb-3.5 last:pb-0">
          {i < tl.length - 1 ? <span className="absolute bottom-0 left-[6px] top-4 w-px bg-line-strong" /> : null}
          <span className={`ml-0.5 mt-[5px] h-[9px] w-[9px] rounded-full ${it.dot}`} />
          <div>
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-[13px] font-semibold text-tx-strong">{it.k}</span>
              <span className="font-mono text-[11.5px] text-tx-faint">{mediumDate(it.date)}</span>
            </div>
            {it.text ? <p className="m-0 mt-0.5 text-[13px] leading-snug text-tx-soft">{it.text}</p> : null}
            {it.meta ? <p className="m-0 mt-0.5 font-mono text-xs text-tx-dim">{it.meta}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function AddHistory({ t, today, onAdded }: { t: Thing; today: string; onAdded: (msg: string) => void }) {
  const st = statusOf(t);
  const [kind, setKind] = useState<EquipmentEventKind>(st === "broken" || st === "in_repair" ? "repaired" : t.kind === "reservoir" ? "disinfected" : "serviced");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [cost, setCost] = useState("");
  const [hours, setHours] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return setErr("Write what happened, for example “Gearbox oil changed”.");
    if (date > today) return setErr("The date can’t be after today.");
    setBusy(true);
    setErr(null);
    try {
      await api.addEquipmentEvent(t.id, {
        date,
        kind,
        note: note.trim(),
        cost: cost ? Number(cost) : null,
        run_hours: hours ? Number(hours) : null,
      });
      setNote("");
      setCost("");
      setHours("");
      onAdded(`Added to ${t.code}'s history.`);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not add it.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2.5 rounded-xl border border-line bg-ink-900 p-3.5">
      <div className="eyebrow">Add to {t.code}&apos;s history</div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="field-label">What happened</span>
          <select className="input-sm" value={kind} onChange={(e) => setKind(e.target.value as EquipmentEventKind)}>
            {(Object.keys(EVENT_KINDS) as EquipmentEventKind[]).map((k) => (
              <option key={k} value={k}>
                {EVENT_KINDS[k][0]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="field-label">Date</span>
          <input type="date" className="input-sm" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="field-label">Details</span>
        <input className="input-sm" autoComplete="off" placeholder="e.g. Gearbox oil changed" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="field-label">Cost (Rp)</span>
          <input type="number" min={0} step={1000} inputMode="numeric" className="input-sm" placeholder="0" value={cost} onChange={(e) => setCost(e.target.value)} />
        </label>
        {t.kind === "generator" ? (
          <label className="flex flex-col gap-1">
            <span className="field-label">Hour meter</span>
            <input type="number" min={0} inputMode="numeric" className="input-sm" placeholder="h" value={hours} onChange={(e) => setHours(e.target.value)} />
          </label>
        ) : null}
      </div>
      {err ? <p className="m-0 text-[13px] text-bad-soft">{err}</p> : null}
      <div>
        <button type="submit" disabled={busy} className="h-[34px] rounded-[10px] bg-accent px-3.5 text-[13px] font-bold text-accent-ink hover:brightness-110 disabled:opacity-40">
          {busy ? "Adding…" : "Add to history"}
        </button>
      </div>
    </form>
  );
}

/** What holding something on the map shows. */
export function Details({
  m,
  id,
  detail,
  canAdd,
  today,
  onGo,
  onClose,
  onZoom,
  onAdded,
}: {
  m: Model;
  id: string;
  detail: EquipmentDetail | null;
  canAdd: boolean;
  today: string;
  onGo: (id: string) => void;
  onClose: () => void;
  onZoom: (id: string) => void;
  onAdded: (msg: string) => void;
}) {
  const t = m.things.get(id);
  if (!t) return null;
  const notes = t.eq?.notes ? <Note>{t.eq.notes}</Note> : null;
  const history = t.eq ? (
    <>
      <Sec title="History">
        <History m={m} detail={detail} />
      </Sec>
      {canAdd ? <AddHistory key={t.id} t={t} today={today} onAdded={onAdded} /> : null}
    </>
  ) : null;

  if (isArea(t)) {
    const zoom = (
      <button type="button" data-zoom={t.id} onClick={() => onZoom(t.id)} className="inline-flex h-[26px] items-center whitespace-nowrap rounded-[7px] border border-line-strong bg-ink-750 px-2 font-mono text-[12.5px] font-medium text-tx-strong hover:border-accent hover:text-accent-hover">
        Zoom in
      </button>
    );
    const ins = m.routes.filter((r) => r.to === t.id && r.what === "water");
    const outs = m.routes.filter((r) => r.from === t.id);
    const chain = t.kind === "pond" ? waterChain(m, t.id) : [];
    return (
      <>
        <Head eyebrow={t.kind === "pond" ? "Pond" : "Reservoir"} title={t.kind === "pond" ? `${t.label} (${t.code})` : `Reservoir ${t.code}`} right={t.eq ? <StatusPill status={statusOf(t)} /> : zoom} onClose={onClose} />
        {!t.recorded ? <Note>Not placed on the drawing yet: this spot is only a suggestion. Press Edit, then hold it and drag it to where it is.</Note> : null}
        <Sec title="Size">
          {t.sized ? (
            <Stat>
              {fm(t.w)} × {fm(t.h)} m = {numText(t.w * t.h)} m²{t.rot ? ` · turned ${t.rot}°` : ""}
            </Stat>
          ) : (
            <Note>{t.kind === "pond" ? "Width and length not recorded: set them in the pond's settings. Drawn as a square of its area." : "Width and length not recorded yet."}</Note>
          )}
          {t.eq ? <div>{zoom}</div> : null}
        </Sec>
        <Aeration m={m} a={t} onGo={onGo} />
        {t.kind === "pond" ? (
          <>
            <Sec title="Water comes from">
              {chain.length > 1 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {chain.map((x, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5">
                      {i ? <span className="font-mono text-sky">→</span> : null}
                      <Go m={m} id={x} onGo={onGo} here={x === t.id} />
                    </span>
                  ))}
                </div>
              ) : (
                <Note>No pump linked yet.</Note>
              )}
            </Sec>
            <PowerFrom m={m} id={t.id} onGo={onGo} />
          </>
        ) : (
          <>
            {ins.length ? (
              <Sec title="Filled by">
                <Rows>
                  {ins.map((r, i) => (
                    <Row key={i}>
                      <Go m={m} id={r.owner} onGo={onGo} />
                      <span className="text-tx-dim">from</span>
                      {r.from ? <Go m={m} id={r.from} onGo={onGo} /> : "—"}
                    </Row>
                  ))}
                </Rows>
              </Sec>
            ) : null}
            {outs.length ? (
              <Sec title="Feeds">
                <Rows>
                  {outs.map((r, i) => (
                    <Row key={i}>
                      <Go m={m} id={r.owner} onGo={onGo} />
                      <span className="font-mono text-sky">→</span>
                      <Go m={m} id={r.to} onGo={onGo} />
                    </Row>
                  ))}
                </Rows>
              </Sec>
            ) : null}
            {notes}
            {history}
          </>
        )}
      </>
    );
  }

  // A machine.
  let sits: ReactNode;
  if (isInner(t)) {
    const pl = t.eq?.placement;
    sits = (
      <>
        <Stat>
          <Go m={m} id={t.in} onGo={onGo} /> {placementWords(m, t)}
        </Stat>
        {pl ? <Note>Since {mediumDate(pl.from_date)}</Note> : null}
      </>
    );
  } else if (isSpot(t)) {
    sits = t.parked ? <Stat>Not placed on the drawing yet</Stat> : <Stat>On the drawing</Stat>;
  } else sits = <Stat>In storage</Stat>;
  const own = m.routes.filter((r) => r.owner === t.id);
  const links = POWER_KINDS.has(t.kind) ? (
    <Sec title="Powers">
      {own.length ? (
        <Rows>
          {own.map((r, i) => {
            const to = m.things.get(r.to);
            return (
              <Row key={i}>
                <Go m={m} id={r.to} onGo={onGo} />
                <span className="text-tx-dim">{r.backup ? "backup when the power is out" : isArea(to) ? "the machines in it" : to ? KIND_LABEL[to.kind] : ""}</span>
              </Row>
            );
          })}
        </Rows>
      ) : (
        <Note>Nothing linked yet.</Note>
      )}
    </Sec>
  ) : (
    <>
      <Sec title="From → to">
        {own.length ? (
          <Rows>
            {own.map((r, i) => (
              <Row key={i}>
                {r.from ? <Go m={m} id={r.from} onGo={onGo} /> : <span className="text-tx-dim">none</span>}
                <span className="font-mono text-sky">→</span>
                <Go m={m} id={r.to} onGo={onGo} />
              </Row>
            ))}
          </Rows>
        ) : (
          <Note>None.{t.kind === "paddlewheel" ? " A paddlewheel only moves water inside the pond it sits in." : ""}</Note>
        )}
      </Sec>
      {t.kind === "bore_well" ? null : <PowerFrom m={m} id={t.id} onGo={onGo} />}
    </>
  );
  return (
    <>
      <Head eyebrow={KIND_LABEL[t.kind]} title={t.code} mono right={<StatusPill status={statusOf(t)} />} onClose={onClose} />
      <Specs t={t} />
      {notes}
      <Sec title="Where it is">{sits}</Sec>
      {links}
      {history}
    </>
  );
}
