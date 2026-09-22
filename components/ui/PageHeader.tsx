"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * Sub-page header: a square back button, a mono uppercase eyebrow (farm / pond
 * context) and the page title. `right` holds a trailing chip or action.
 */
export function PageHeader({
  eyebrow,
  title,
  backHref = "/",
  backLabel = "Back to dashboard",
  right,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  backHref?: string;
  backLabel?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Link
        href={backHref}
        aria-label={backLabel}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-ink-800 text-tx hover:text-tx-strong"
      >
        <Icon name="back" size={18} strokeWidth={2.2} />
      </Link>
      <div className="flex min-w-0 flex-grow flex-col gap-0.5">
        {eyebrow ? (
          <span className="truncate font-mono text-xs uppercase tracking-[0.14em] text-tx-muted">{eyebrow}</span>
        ) : null}
        <h1 className="m-0 text-2xl font-bold text-tx-strong">{title}</h1>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

/** Mobile-first page column (430px mockups), centred on wider screens. */
export function PageColumn({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`mx-auto flex w-full max-w-[480px] flex-col px-5 pb-12 pt-5 ${className}`}>{children}</main>;
}
