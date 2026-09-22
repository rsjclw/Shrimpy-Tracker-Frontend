"use client";

import { ROLE_LABEL, ROLE_TEXT } from "@/lib/roles";
import { accountStatus, avatarFor, initialsFor, type AccountsCtx, type FarmMembership } from "./adminHelpers";
import { AccountDetailPanel, InviteAccountForm } from "./AccountDetailPanel";
import { StatTiles, type StatTile } from "./StatTiles";

function chipsFor(isAdmin: boolean, memberships: FarmMembership[]) {
  if (isAdmin) return { chips: [{ label: "All farms", role: "Admin", className: "text-rose" }], more: 0 };
  const sorted = memberships.slice().sort((a, b) => a.farmName.localeCompare(b.farmName));
  const chips = sorted.slice(0, 3).map((m) => ({ label: m.farmName, role: ROLE_LABEL[m.role], className: ROLE_TEXT[m.role] }));
  return { chips, more: Math.max(0, sorted.length - 3) };
}

export function AccountsTab({ ctx }: { ctx: AccountsCtx }) {
  const admins = ctx.accounts.filter((a) => a.is_admin);
  const invited = ctx.accounts.filter((a) => a.last_sign_in_at === null);
  const disabled = ctx.accounts.filter((a) => !a.is_active);

  const tiles: StatTile[] = [
    { key: "all", value: ctx.accounts.length, label: "Accounts", onToggle: () => ctx.onFilterChange("all"), active: ctx.filter === "all" },
    {
      key: "admin",
      value: admins.length,
      label: "Admins",
      valueClass: "text-rose",
      onToggle: () => ctx.onFilterChange(ctx.filter === "admin" ? "all" : "admin"),
      active: ctx.filter === "admin",
    },
    {
      key: "invited",
      value: invited.length,
      label: "Invited, not signed in",
      valueClass: "text-warn",
      onToggle: () => ctx.onFilterChange(ctx.filter === "invited" ? "all" : "invited"),
      active: ctx.filter === "invited",
    },
    {
      key: "disabled",
      value: disabled.length,
      label: "Disabled",
      valueClass: "text-tx-dim",
      onToggle: () => ctx.onFilterChange(ctx.filter === "disabled" ? "all" : "disabled"),
      active: ctx.filter === "disabled",
    },
  ];

  const q = ctx.query.trim().toLowerCase();
  const rows = ctx.accounts.filter((a) => {
    if (ctx.filter === "admin" && !a.is_admin) return false;
    if (ctx.filter === "invited" && a.last_sign_in_at !== null) return false;
    if (ctx.filter === "disabled" && a.is_active) return false;
    if (q && !a.email.toLowerCase().includes(q)) return false;
    return true;
  });

  const selectedAccount = ctx.selectedId ? ctx.accounts.find((a) => a.id === ctx.selectedId) ?? null : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="min-w-0 flex-1 overflow-visible px-4 py-5 lg:overflow-y-auto lg:px-8 lg:py-6">
        <StatTiles tiles={tiles} />
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_100px] gap-4 px-4 pb-2.5 text-[11px] uppercase tracking-[0.08em] text-tx-dim">
          <span>Account</span>
          <span>Farms &amp; roles</span>
          <span>Status</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {rows.map((a) => {
            const avatar = avatarFor(a.id);
            const status = accountStatus(a);
            const memberships = ctx.membershipsByEmail.get(a.email.toLowerCase()) ?? [];
            const { chips, more } = chipsFor(a.is_admin, memberships);
            const active = a.id === ctx.selectedId && !ctx.inviting;
            const isSelf = a.id === ctx.me.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => ctx.onSelect(a.id)}
                aria-label={`Open ${a.email}`}
                className={`grid grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_100px] items-center gap-4 rounded-xl border px-4 py-3 text-left ${
                  active ? "border-accent bg-accent/[0.08]" : "border-line-soft bg-ink-850"
                } ${a.is_active ? "" : "opacity-60"}`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{ background: avatar.bg, color: avatar.fg }}
                  >
                    {initialsFor(a.email)}
                  </span>
                  <div className="flex min-w-0 flex-col gap-px">
                    <span className="truncate text-sm font-semibold text-tx-strong">
                      {localPart(a.email)}
                      {isSelf ? " (you)" : ""}
                    </span>
                    <span className="truncate text-xs text-tx-dim">{a.email}</span>
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {chips.map((c, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-ink-800 px-2.5 py-1 text-xs">
                      <span className="text-tx">{c.label}</span>
                      <span className={`font-bold ${c.className}`}>{c.role}</span>
                    </span>
                  ))}
                  {more > 0 ? <span className="px-1 text-xs text-tx-dim">+{more} more</span> : null}
                  {chips.length === 0 ? (
                    <span className="text-xs text-tx-dim">
                      {a.last_sign_in_at === null ? "No farms yet · waiting for sign-in" : "No farms assigned"}
                    </span>
                  ) : null}
                </div>
                <span className={`justify-self-start rounded-full border px-2.5 py-1 text-[11px] font-bold ${status.borderClass} ${status.textClass}`}>
                  {status.label}
                </span>
              </button>
            );
          })}
          {rows.length === 0 ? <div className="px-4 py-6 text-sm text-tx-dim">No accounts match this search or filter.</div> : null}
        </div>
      </div>

      <div className="flex w-full flex-col gap-5 border-t border-line-soft bg-ink-900 p-4 lg:w-[460px] lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:p-6">
        {ctx.inviting ? <InviteAccountForm ctx={ctx} /> : null}
        {selectedAccount && !ctx.inviting ? <AccountDetailPanel account={selectedAccount} ctx={ctx} /> : null}
        {!selectedAccount && !ctx.inviting ? (
          <div className="py-10 text-center text-sm text-tx-dim">Select an account to see its details.</div>
        ) : null}
      </div>
    </div>
  );
}

function localPart(email: string) {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}
