"use client";

import Link from "next/link";

import type { AuthUser } from "@/lib/auth";
import { avatarFor, initialsFor, type Tab } from "./adminHelpers";

const NAV_ITEMS: { id: Tab; label: string }[] = [
  { id: "farms", label: "Farms" },
  { id: "accounts", label: "Accounts" },
  { id: "roles", label: "Roles & permissions" },
];

export function AdminTopNav({
  tab,
  onTabChange,
  counts,
  me,
}: {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  counts: Partial<Record<Tab, number>>;
  me: AuthUser;
}) {
  const avatar = avatarFor(me.id);
  return (
    // Phones: brand, dashboard link and avatar on one row, the tabs on a scrollable row below.
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 border-b border-line-soft bg-ink-900 px-4 pt-3 lg:h-16 lg:flex-nowrap lg:gap-8 lg:px-8 lg:pt-0">
      <div className="flex shrink-0 items-baseline gap-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-tx-dim">Pond Monitoring</span>
        <span className="text-lg font-bold text-tx-strong">Admin</span>
      </div>
      <Link href="/" className="shrink-0 text-xs font-semibold text-tx-muted hover:text-tx-strong">
        ← Dashboard
      </Link>
      <nav aria-label="Admin sections" className="order-last -mx-4 flex h-11 w-[calc(100%+2rem)] min-w-0 items-center gap-1 overflow-x-auto px-1 lg:order-none lg:mx-0 lg:h-full lg:w-auto lg:flex-1 lg:px-0">
        {NAV_ITEMS.map((item) => {
          const current = item.id === tab;
          const count = counts[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              aria-current={current ? "page" : undefined}
              className={`flex h-full shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-semibold lg:px-4 ${
                current ? "border-accent text-tx-strong" : "border-transparent text-tx-muted hover:text-tx-soft"
              }`}
            >
              <span>{item.label}</span>
              {count !== undefined ? (
                <span className={`font-mono text-[11px] ${current ? "text-accent" : "text-tx-dim"}`}>{count}</span>
              ) : null}
            </button>
          );
        })}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        <div className="hidden flex-col items-end gap-px sm:flex">
          <span className="text-[13px] font-semibold text-tx-strong">{localName(me.email)}</span>
          <span className="text-[11px] text-rose">Admin</span>
        </div>
        <span
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-xs font-bold"
          style={{ background: avatar.bg, color: avatar.fg }}
        >
          {initialsFor(me.email)}
        </span>
      </div>
    </div>
  );
}

function localName(email: string) {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}
