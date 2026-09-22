"use client";

import { AccountMenu } from "@/components/dashboard/AccountMenu";
import { Conditions } from "@/components/dashboard/Conditions";
import { Icon } from "@/components/ui/Icon";
import type { AuthUser } from "@/lib/api";

/** Collapsed pond cards drawn with dashes while the farm's ponds load. */
export function PondSkeletons({ count = 2 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="Loading ponds">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 rounded-[18px] border border-line bg-ink-800 py-4 pl-[18px] pr-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-tx-off" />
            <div className="flex min-w-0 flex-col items-start gap-0.5">
              <span className="text-base font-semibold text-tx-faint">—</span>
              <span className="font-mono text-[11px] text-tx-faint">— · DOC —</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="font-mono text-[13px] font-semibold text-tx-faint">—</span>
            <span className="text-[10px] uppercase tracking-[0.06em] text-tx-faint">Next feed</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The whole dashboard drawn with dashes, before the farm list has come back. */
export function DashboardSkeleton({ user, today }: { user: AuthUser | null; today: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col gap-[22px] bg-ink-950 px-5 pb-[72px] pt-7">
      <div className="sticky top-0 z-30 -mx-5 -mt-7 flex items-start justify-between gap-3 border-b border-line-faint bg-ink-950 px-5 pb-3 pt-[22px]">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="py-0.5 font-mono text-xs uppercase tracking-[0.14em] text-tx-muted">—</span>
          <h1 className="m-0 flex items-center gap-2 whitespace-nowrap text-[24px] font-bold tracking-[-0.01em] text-tx-strong min-[400px]:text-[26px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={30} height={30} className="h-[30px] w-[30px] shrink-0" />
            Pond Monitoring
          </h1>
        </div>
        <div className="mt-0.5 flex shrink-0 items-center gap-2 rounded-xl border border-line bg-ink-800 px-3 py-[9px]">
          <span className="font-mono text-[13px] font-semibold text-tx-faint">—</span>
          <Icon name="chevron" size={14} className="shrink-0 text-tx-faint" />
        </div>
      </div>

      <div className="-mt-2 flex items-center gap-3.5">
        <DashStats />
        <span className="flex-grow" />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-ink-800 px-2.5 py-1.5 text-xs font-semibold text-tx-faint">
          <Icon name="chart" size={13} /> Trends
        </span>
        {user ? <AccountMenu user={user} /> : <span className="h-8 w-8 shrink-0 rounded-full bg-ink-800" />}
      </div>

      <Conditions grid={null} today={today} canManage={false} onSetLocation={() => {}} />
      <PondSkeletons />
    </main>
  );
}

/** The active / inactive / alerts counters with dashes for values. */
export function DashStats() {
  return (
    <>
      {["active", "inactive", "alerts"].map((label) => (
        <span key={label} className="inline-flex items-baseline gap-[5px] text-xs text-tx-faint">
          <span className="font-mono font-semibold text-tx-faint">—</span>
          <span>{label}</span>
        </span>
      ))}
    </>
  );
}
