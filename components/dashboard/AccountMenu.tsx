"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import type { AuthUser } from "@/lib/api";
import { signOut } from "@/lib/session";

/** Initials avatar with a small menu: admin console, change password, sign out. */
export function AccountMenu({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const initials = user.email.split("@")[0].slice(0, 2).toUpperCase();
  const item = "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-tx hover:bg-ink-850 hover:text-tx-strong";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Account menu"
        className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold ${user.is_admin ? "bg-[#3B2533] text-rose" : "bg-[#1E3A34] text-[#5EEAD4]"}`}
      >
        {initials}
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 flex w-56 flex-col gap-0.5 rounded-xl border border-line bg-ink-800 p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
          <div className="truncate px-2.5 pb-1.5 pt-1 text-[11px] text-tx-faint">{user.email}</div>
          {user.is_admin ? (
            <Link href="/admin" className={item}>
              <Icon name="user" size={15} /> Admin console
            </Link>
          ) : null}
          <Link href="/change-password" className={item}>
            <Icon name="pencil" size={15} /> Change password
          </Link>
          <button type="button" onClick={signOut} className={`${item} text-left text-bad hover:text-bad`}>
            <Icon name="logout" size={15} /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
