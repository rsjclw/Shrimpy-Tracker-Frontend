"use client";

import type { ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * Collapsible settings section: a tappable card header (uppercase title,
 * optional count, one-line summary, chevron) with the body underneath.
 */
export function CollapsibleSection({
  title,
  count,
  summary,
  open,
  onToggle,
  children,
  bodyClassName = "flex flex-col gap-2.5",
}: {
  title: ReactNode;
  count?: ReactNode;
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-[14px] border border-line bg-ink-800 p-3.5 text-left"
      >
        <div className="flex min-w-0 flex-grow flex-col gap-[3px]">
          <h2 className="m-0 text-[13px] font-bold uppercase tracking-[0.08em] text-tx">
            {title}
            {count !== undefined ? <span className="ml-1.5 font-mono text-tx-faint">{count}</span> : null}
          </h2>
          {summary ? <span className="truncate text-xs text-tx-dim">{summary}</span> : null}
        </div>
        <Icon name="chevron" size={15} strokeWidth={2.2} className={`shrink-0 text-tx-dim transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className={bodyClassName}>{children}</div> : null}
    </section>
  );
}

/** Small uppercase heading inside a section body. */
export function SubHeading({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.08em] text-tx-dim">{children}</span>
      {hint ? <span className="text-[11px] text-tx-faint">{hint}</span> : null}
    </div>
  );
}

/** Two-state pill switch (Admin, context layers). */
export function Toggle({
  on,
  onChange,
  label,
  disabled,
  onColor = "bg-accent",
}: {
  on: boolean;
  onChange?: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  onColor?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${on ? onColor : "bg-line-dash"}`}
    >
      <span className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-tx-strong transition-[left] ${on ? "left-[23px]" : "left-[3px]"}`} />
    </button>
  );
}

/** Pill button group (language, axis, range pickers). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: {
  options: { value: T; label: ReactNode }[];
  value: T | null;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-[10px] border border-line bg-ink-800 p-[3px]">
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(opt.value)}
            className={`flex h-8 items-center justify-center rounded-lg text-xs font-bold ${size === "sm" ? "px-2.5" : "px-3"} ${on ? "bg-accent text-accent-ink" : "text-tx-soft hover:text-tx-strong"}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
