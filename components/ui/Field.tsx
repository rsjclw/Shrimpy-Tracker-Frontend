import type { ReactNode } from "react";

/** Label-over-control column. Pass the control's id as `htmlFor`. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className = "",
  labelClassName = "field-label",
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  labelClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label htmlFor={htmlFor} className={labelClassName}>
        {label}
      </label>
      {children}
      {error ? <span className="text-xs text-bad">{error}</span> : null}
      {!error && hint ? <span className="text-[11px] text-tx-faint">{hint}</span> : null}
    </div>
  );
}

/** Text input with a unit suffix sitting inside the right edge. */
export function UnitInput({
  unit,
  className = "input",
  invalid,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { unit: string; invalid?: boolean }) {
  return (
    <div className="relative">
      <input {...rest} className={`${className} pr-[58px] font-mono font-semibold ${invalid ? "input-error" : ""}`} />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-tx-faint">{unit}</span>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-xs text-bad">{children}</p>;
}

/** Tinted notice. `tone` picks the colour: bad = error, warn = caution, info = neutral. */
export function Banner({
  tone = "bad",
  children,
  onDismiss,
}: {
  tone?: "bad" | "warn" | "info" | "good";
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const tones = {
    bad: "bg-bad/10 border-bad/40 text-bad-soft",
    warn: "bg-warn/10 border-warn/40 text-warn",
    info: "bg-ink-850 border-line-soft text-tx-muted",
    good: "bg-accent/10 border-accent/40 text-tx",
  };
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`flex items-start justify-between gap-2.5 rounded-[10px] border px-3 py-2.5 text-[13px] leading-snug ${tones[tone]}`}>
      <span className="min-w-0">{children}</span>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

/** Red "Delete X?" strip with a confirm button, shown inline under an item. */
export function ConfirmStrip({
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
  busy,
}: {
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-bad/[0.08] px-2.5 py-2">
      <span className="text-xs text-bad-soft">{message}</span>
      <div className="flex shrink-0 gap-1.5">
        {onCancel ? (
          <button type="button" onClick={onCancel} className="rounded-md bg-ink-850 px-2.5 py-1.5 text-xs font-semibold text-tx-soft">
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-md bg-bad px-2.5 py-1.5 text-xs font-bold text-ink-950 disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

export function Spinner({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Centered loading state for a whole page or panel. */
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-tx-dim" role="status">
      <Spinner />
      {label}
    </div>
  );
}
