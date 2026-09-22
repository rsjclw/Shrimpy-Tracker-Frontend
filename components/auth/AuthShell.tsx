"use client";

import type { ReactNode } from "react";
import { LangToggle } from "./LangToggle";
import type { Lang } from "./copy";

/**
 * The 430px dark column shared by the sign-in and change-password screens:
 * faint water rings, the EN/ID toggle, the brand mark, then the page's own
 * content and an optional footer pinned to the bottom.
 */
export function AuthShell({
  lang,
  onLangChange,
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen justify-center bg-ink-950">
      <div className="relative flex w-full max-w-[430px] flex-col overflow-hidden px-6 pb-7 pt-5">
        <svg
          width="430"
          height="430"
          viewBox="0 0 430 430"
          fill="none"
          aria-hidden
          className="pointer-events-none absolute -top-[120px] left-0 text-accent"
        >
          <circle cx="215" cy="215" r="80" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1.5" />
          <circle cx="215" cy="215" r="130" stroke="currentColor" strokeOpacity="0.07" strokeWidth="1.5" />
          <circle cx="215" cy="215" r="185" stroke="currentColor" strokeOpacity="0.045" strokeWidth="1.5" />
        </svg>

        <div className="relative flex justify-end">
          <LangToggle lang={lang} onChange={onLangChange} />
        </div>

        <div className="relative mt-11 flex flex-col items-center gap-3.5">
          <div className="flex h-16 w-16 items-center justify-center rounded-[18px] border border-line-strong bg-ink-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={44} height={44} className="h-11 w-11" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-xs uppercase tracking-[0.16em] text-tx-muted">{eyebrow}</span>
            <h1 className="m-0 text-center text-[28px] font-bold text-tx-strong">{title}</h1>
            <p className="m-0 max-w-[320px] text-center text-sm leading-relaxed text-tx-muted">{subtitle}</p>
          </div>
        </div>

        {children}

        {footer ? (
          <div className="relative mt-auto flex flex-col items-center gap-2.5 pt-8">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
