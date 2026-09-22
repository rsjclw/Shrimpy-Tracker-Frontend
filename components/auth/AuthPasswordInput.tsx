"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  error?: string;
  /** Border-only invalid state, e.g. a form-level error with no field text. */
  invalid?: boolean;
  onEnter?: () => void;
  /** Slot next to the label, e.g. the "Forgot password?" link on sign-in. */
  labelRight?: ReactNode;
  showLabel: string;
  hideLabel: string;
  maxLength?: number;
};

/** Password input with a show/hide toggle, styled to match AuthTextInput. */
export function AuthPasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
  invalid,
  onEnter,
  labelRight,
  showLabel,
  hideLabel,
  maxLength,
}: Props) {
  const [shown, setShown] = useState(false);
  const isInvalid = invalid ?? !!error;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold text-tx-soft">
          {label}
        </label>
        {labelRight}
      </div>
      <div className="relative">
        <input
          id={id}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) onEnter();
          }}
          className={`h-[52px] w-full rounded-xl border bg-ink-850 px-3.5 pr-[54px] text-base text-tx-strong outline-none transition-colors focus:border-accent ${
            isInvalid ? "border-bad/70" : "border-line-strong"
          }`}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? hideLabel : showLabel}
          aria-pressed={shown}
          className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-[10px] text-tx-muted hover:text-tx-soft"
        >
          <Icon name={shown ? "eyeOff" : "eye"} size={20} strokeWidth={1.8} />
        </button>
      </div>
      {error ? <span className="text-xs text-bad">{error}</span> : null}
    </div>
  );
}
