"use client";

import { Icon } from "@/components/ui/Icon";
import { ConfirmStrip } from "@/components/ui/Field";
import { ROLE_BORDER, ROLE_LABEL, ROLE_TEXT, type MemberRole } from "@/lib/roles";
import { MEMBER_ROLE_OPTIONS } from "./adminHelpers";

/**
 * One membership row: used both for a farm's member list (avatar + email) and
 * an account's farm list (farm name only, no avatar). Shared role <select>,
 * remove button and inline remove confirmation.
 */
export function MembershipRow({
  avatar,
  title,
  subtitle,
  role,
  roleLabel,
  onRoleChange,
  removeLabel,
  onAskRemove,
  confirming,
  confirmMessage,
  onConfirmRemove,
  onCancelRemove,
  busy,
}: {
  avatar?: { bg: string; fg: string; initials: string };
  title: string;
  subtitle?: string;
  role: MemberRole;
  roleLabel: string;
  onRoleChange: (role: MemberRole) => void;
  removeLabel: string;
  onAskRemove: () => void;
  confirming: boolean;
  confirmMessage: string;
  onConfirmRemove: () => void;
  onCancelRemove: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-soft bg-ink-800 p-3">
      <div className="flex items-center gap-2.5">
        {avatar ? (
          <span
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{ background: avatar.bg, color: avatar.fg }}
          >
            {avatar.initials}
          </span>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate text-sm font-semibold text-tx-strong">{title}</span>
          {subtitle ? <span className="truncate text-xs text-tx-dim">{subtitle}</span> : null}
        </div>
        <select
          aria-label={roleLabel}
          value={role}
          disabled={busy}
          onChange={(e) => onRoleChange(e.target.value as MemberRole)}
          className={`h-9 rounded-lg border bg-ink-850 px-2 text-[13px] font-semibold disabled:opacity-50 ${ROLE_BORDER[role]} ${ROLE_TEXT[role]}`}
        >
          {MEMBER_ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onAskRemove}
          disabled={busy}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-tx-dim hover:bg-ink-750 hover:text-bad disabled:opacity-50"
        >
          <Icon name="trash" size={15} />
        </button>
      </div>
      {confirming ? (
        <ConfirmStrip message={confirmMessage} confirmLabel="Remove" onCancel={onCancelRemove} onConfirm={onConfirmRemove} busy={busy} />
      ) : null}
    </div>
  );
}
