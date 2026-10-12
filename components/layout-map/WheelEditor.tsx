"use client";

import { mediumDate } from "@/lib/dates";
import { fm, isArea, label, norm360, sideName, type Area, type Model } from "./model";

/** What the popup is typing: where the wheel sits (area, metres from its west and north sides) and its compass bearing. */
export type WheelDraft = { id: string; in: string; us: string; vs: string; bs: string };

const asNumber = (s: string) => (String(s).trim() === "" ? NaN : Number(s));

/** The typed spot as a placement in the area's own frame, or the reason it can't be one. */
export function readWheelDraft(m: Model, d: WheelDraft): { in: string; u: number; v: number; b: number } | { err: string } {
  const a = m.things.get(d.in);
  if (!isArea(a)) return { err: "Pick a pond or reservoir." };
  const u = asNumber(d.us), v = asNumber(d.vs), b = asNumber(d.bs);
  if (!(u >= 0 && u <= a.w)) return { err: `From the ${sideName(a, 3)} side must be between 0 and ${fm(a.w)} m.` };
  if (!(v >= 0 && v <= a.h)) return { err: `From the ${sideName(a, 0)} side must be between 0 and ${fm(a.h)} m.` };
  if (!(Number.isInteger(b) && b >= 0 && b <= 359)) return { err: "Bearing must be a whole number from 0 to 359." };
  return { in: a.id, u: Math.round(u * 100) / 100, v: Math.round(v * 100) / 100, b: norm360(b - a.rot) };
}

const r1 = (n: number) => String(Math.round(n * 10) / 10);
export function wheelDraftFor(m: Model, id: string, over: Partial<WheelDraft> = {}): WheelDraft | null {
  const t = m.things.get(id);
  if (!t || !("in" in t)) return null;
  const a = m.things.get(t.in) as Area;
  return { id, in: t.in, us: r1(t.u), vs: r1(t.v), bs: String(norm360(a.rot + t.b)), ...over };
}

/**
 * The paddlewheel popup. "Moved today" keeps the old spot in its history and starts a new one;
 * "Fix the drawing" corrects where it has been all along. Neither is saved until Done.
 */
export function WheelEditor({
  m,
  draft,
  changed,
  hasPlacement,
  since,
  onChange,
  onSave,
  onCancel,
}: {
  m: Model;
  draft: WheelDraft;
  changed: boolean;
  hasPlacement: boolean;
  since: string | null;
  onChange: (d: WheelDraft) => void;
  onSave: (how: "moved" | "fix") => void;
  onCancel: () => void;
}) {
  const a = m.things.get(draft.in) as Area;
  const read = readWheelDraft(m, draft);
  const err = "err" in read ? read.err : null;
  const ok = !err && changed;
  const t = m.things.get(draft.id);
  const field = (key: "us" | "vs" | "bs", lab: string, mode: "decimal" | "numeric") => (
    <label className="flex flex-col gap-1">
      <span className="field-label">{lab}</span>
      <input className="input-sm font-mono" inputMode={mode} autoComplete="off" value={draft[key]} onChange={(e) => onChange({ ...draft, [key]: e.target.value })} />
    </label>
  );
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span>
          <b className="font-mono text-base font-semibold text-tx-strong">{t?.code}</b> <span className="text-tx-dim">paddlewheel</span>
        </span>
        <button type="button" onClick={onCancel} aria-label="Close without keeping" className="h-[30px] w-[30px] rounded-lg border border-line-strong text-[13px] text-tx-dim hover:text-tx-strong">
          ✕
        </button>
      </div>
      <label className="flex flex-col gap-1">
        <span className="field-label">In</span>
        <select
          className="input-sm"
          value={draft.in}
          onChange={(e) => {
            const b = m.things.get(e.target.value) as Area;
            // Keep the typed spot if it fits the new area, otherwise start from its middle.
            const u = asNumber(draft.us), v = asNumber(draft.vs);
            onChange({ ...draft, in: b.id, us: u >= 0 && u <= b.w ? draft.us : r1(b.w / 2), vs: v >= 0 && v <= b.h ? draft.vs : r1(b.h / 2) });
          }}
        >
          {m.areas.map((x) => (
            <option key={x.id} value={x.id}>
              {label(m, x.id)}
            </option>
          ))}
        </select>
      </label>
      {a ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {field("us", `From ${sideName(a, 3)} (m)`, "decimal")}
            {field("vs", `From ${sideName(a, 0)} (m)`, "decimal")}
            {field("bs", "Bearing (°)", "numeric")}
          </div>
          <p className="m-0 text-xs leading-normal text-tx-dim">
            {label(m, a.id)} is {fm(a.w)} × {fm(a.h)} m{a.rot ? `, turned ${a.rot}°` : ""}. Bearing: 0° north, 90° east.
          </p>
        </>
      ) : null}
      {err ? <p className="m-0 text-[13px] text-bad-soft">{err}</p> : null}
      <div className="flex flex-wrap gap-2">
        {hasPlacement ? (
          <>
            <button type="button" disabled={!ok} onClick={() => onSave("moved")} className="h-[34px] rounded-[10px] bg-accent px-3.5 text-[13px] font-bold text-accent-ink hover:brightness-110 disabled:opacity-40">
              Moved today
            </button>
            <button type="button" disabled={!ok} onClick={() => onSave("fix")} className="h-[34px] rounded-[10px] border border-line-strong bg-ink-750 px-3.5 text-[13px] font-semibold text-tx-strong hover:border-tx-ghost disabled:opacity-40">
              Fix the drawing
            </button>
          </>
        ) : (
          <button type="button" disabled={!ok} onClick={() => onSave("moved")} className="h-[34px] rounded-[10px] bg-accent px-3.5 text-[13px] font-bold text-accent-ink hover:brightness-110 disabled:opacity-40">
            Put it here
          </button>
        )}
      </div>
      <p className="m-0 text-xs leading-normal text-tx-dim">
        {hasPlacement
          ? `Moved today keeps the old spot in its history. Fix the drawing corrects where it has been${since ? ` since ${mediumDate(since)}` : ""}. Saved when you press Done.`
          : "Saved when you press Done."}
      </p>
    </>
  );
}
