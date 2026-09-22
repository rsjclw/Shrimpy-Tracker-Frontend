"use client";

import type { FarmMember, RegisteredUser } from "@/lib/api";

const ROLE_CARD_COLOR = { admin: "#F9A8D4", owner: "#FBBF24", operator: "#2DD4BF", viewer: "#C9D6D2" } as const;

type Cell = { yes: boolean };
const YES: Cell = { yes: true };
const NO: Cell = { yes: false };

/** [label, [admin, maintainer, operator, viewer]] — every cell verified against the backend's ROLE_PERMISSIONS and routers. */
const PERM_ROWS: [string, Cell[]][] = [
  ["View dashboard and history", [YES, YES, YES, YES]],
  ["Log feed, water, plankton, bacteria", [YES, YES, YES, NO]],
  ["Log sampling, harvest, population, treatments", [YES, YES, YES, NO]],
  ["Edit or delete past logs", [YES, YES, NO, NO]],
  ["Pond settings (schedule, thresholds, active/inactive)", [YES, YES, NO, NO]],
  ["Add or remove farm members, change their roles", [YES, NO, NO, NO]],
  ["Create, rename or delete farms; create accounts", [YES, NO, NO, NO]],
  ["Access every farm without being assigned", [YES, NO, NO, NO]],
  ["Admin page: farms, accounts, admin rights", [YES, NO, NO, NO]],
];

export function RolesTab({ membersByFarm, accounts }: {
  membersByFarm: Record<string, FarmMember[]>;
  accounts: RegisteredUser[];
}) {
  const admins = accounts.filter((a) => a.is_admin).length;
  const perFarmCount = (role: "owner" | "operator" | "viewer") => {
    const emails = new Set<string>();
    for (const list of Object.values(membersByFarm)) {
      for (const m of list) if (m.role === role) emails.add(m.email.toLowerCase());
    }
    return emails.size;
  };

  const cards = [
    {
      name: "Admin",
      scope: "All farms",
      color: ROLE_CARD_COLOR.admin,
      desc: "Runs the platform. Sees every farm, edits anything, and manages farms, accounts and roles here.",
      count: `${admins} people`,
    },
    {
      name: "Maintainer",
      scope: "Per farm",
      color: ROLE_CARD_COLOR.owner,
      desc: "Responsible for a farm. Everything an Operator can do, plus pond settings and deleting logs. Only Admins can add, remove or reassign a farm's members.",
      count: `${perFarmCount("owner")} people`,
    },
    {
      name: "Operator",
      scope: "Per farm",
      color: ROLE_CARD_COLOR.operator,
      desc: "Does the daily work: feed schedule, water quality, plankton, bacteria, sampling, harvests and treatments.",
      count: `${perFarmCount("operator")} people`,
    },
    {
      name: "Viewer",
      scope: "Per farm",
      color: ROLE_CARD_COLOR.viewer,
      desc: "Read-only. Sees the dashboard and history but can't change anything.",
      count: `${perFarmCount("viewer")} people`,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-visible px-4 py-6 lg:overflow-y-auto lg:px-8 lg:py-7">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.name}
            className="flex flex-col gap-2.5 rounded-2xl border border-line-soft bg-ink-900 p-[18px]"
            style={{ borderTop: `3px solid ${c.color}` }}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold" style={{ color: c.color }}>
                {c.name}
              </span>
              <span className="text-[11px] uppercase tracking-[0.08em] text-tx-dim">{c.scope}</span>
            </div>
            <span className="text-[13px] leading-relaxed text-tx-soft">{c.desc}</span>
            <span className="font-mono text-xs text-tx-dim">{c.count}</span>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-line-soft">
        <div className="grid grid-cols-[minmax(0,2.4fr)_repeat(4,minmax(0,1fr))] gap-2 bg-ink-900 px-5 py-3.5 text-xs uppercase tracking-[0.08em] text-tx-dim">
          <span>Permission</span>
          <span className="text-center text-rose">Admin</span>
          <span className="text-center text-warn">Maintainer</span>
          <span className="text-center text-accent">Operator</span>
          <span className="text-center text-tx-soft">Viewer</span>
        </div>
        {PERM_ROWS.map(([label, cells]) => (
          <div key={label} className="grid grid-cols-[minmax(0,2.4fr)_repeat(4,minmax(0,1fr))] items-center gap-2 border-t border-line-soft px-5 py-3 text-sm">
            <span className="text-tx">{label}</span>
            {cells.map((cell, i) => (
              <span key={i} className={`text-center text-[13px] font-semibold ${cell.yes ? "text-good" : "text-tx-off"}`}>
                {cell.yes ? "Yes" : "—"}
              </span>
            ))}
          </div>
        ))}
      </div>
      <span className="text-[13px] text-tx-dim">
        Admin is granted per account through the server&apos;s admin email allowlist and applies everywhere — it isn&apos;t a
        role you can assign here. Maintainer, Operator and Viewer are set per farm, so one person can hold different roles
        on different farms.
      </span>
    </div>
  );
}
