"use client";

import { useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";

/** Highlighted box showing a one-time temporary password with a copy button. */
export function CopyableSecret({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      const input = inputRef.current;
      if (input) {
        input.focus();
        input.select();
        try {
          document.execCommand("copy");
          setCopied(true);
        } catch {
          // Selection is still visible for a manual copy even if this fails.
        }
      }
    } finally {
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-accent/[0.08] p-3.5">
      <span className="text-xs font-semibold uppercase tracking-[0.06em] text-accent">{label}</span>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="input-sm flex-1 font-mono text-sm tracking-wide"
        />
        <button
          type="button"
          onClick={copy}
          className="flex h-[38px] shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold text-tx hover:border-line-strong"
        >
          {copied ? <Icon name="check" size={13} /> : null}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <span className="text-[11px] text-tx-dim">They&apos;ll be asked to set their own password at their next sign-in.</span>
    </div>
  );
}
