"use client";

import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
  /** Border-only invalid state, e.g. a form-level error with no field text. */
  invalid?: boolean;
};

/** Email/text input styled to the auth screens' 52px fields (wider than the app's standard .input). */
export function AuthTextInput({ id, label, error, invalid, className = "", ...rest }: Props) {
  const isInvalid = invalid ?? !!error;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-tx-soft">
        {label}
      </label>
      <input
        id={id}
        className={`h-[52px] w-full rounded-xl border bg-ink-850 px-3.5 text-base text-tx-strong outline-none transition-colors focus:border-accent ${
          isInvalid ? "border-bad/70" : "border-line-strong"
        } ${className}`}
        {...rest}
      />
      {error ? <span className="text-xs text-bad">{error}</span> : null}
    </div>
  );
}
