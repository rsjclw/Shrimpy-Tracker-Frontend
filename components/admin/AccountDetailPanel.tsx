"use client";

import { Button } from "@/components/ui/Button";
import { Banner, ConfirmStrip } from "@/components/ui/Field";
import { Toggle } from "@/components/ui/Section";
import type { RegisteredUser } from "@/lib/api";
import type { MemberRole } from "@/lib/roles";
import {
  accountStatusLine,
  avatarFor,
  byRoleThenName,
  initialsFor,
  looksLikeEmail,
  type AccountsCtx,
} from "./adminHelpers";
import { CopyableSecret } from "./CopyableSecret";
import { MembershipRow } from "./MembershipRow";

export function InviteAccountForm({ ctx }: { ctx: AccountsCtx }) {
  const email = ctx.inviteEmail.trim();
  const valid = looksLikeEmail(email);
  const busy = ctx.busyKey === "invite";
  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-accent bg-ink-800 p-[18px]">
      <span className="text-[17px] font-bold text-tx-strong">Invite account</span>
      {ctx.actionError ? <Banner tone="bad">{ctx.actionError}</Banner> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="inv-email" className="field-label">
          Email
        </label>
        <input
          id="inv-email"
          type="email"
          autoFocus
          value={ctx.inviteEmail}
          onChange={(e) => ctx.onInviteEmailChange(e.target.value)}
          className="input"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="inv-pass" className="field-label">
          Set password (optional)
        </label>
        <input
          id="inv-pass"
          type="text"
          value={ctx.invitePassword}
          onChange={(e) => ctx.onInvitePasswordChange(e.target.value)}
          placeholder="Leave blank to generate one"
          className="input"
        />
      </div>
      <span className="text-xs text-tx-dim">They&apos;ll be asked to set their own password at first sign-in. Assign farms after creating the account.</span>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={ctx.onCancelInvite} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={ctx.onSendInvite} disabled={!valid || busy}>
          Create account
        </Button>
      </div>
    </div>
  );
}

export function AccountDetailPanel({ account, ctx }: { account: RegisteredUser; ctx: AccountsCtx }) {
  const avatar = avatarFor(account.id);
  const status = accountStatusLine(account);
  const isSelf = account.id === ctx.me.id;
  const memberships = (ctx.membershipsByEmail.get(account.email.toLowerCase()) ?? [])
    .slice()
    .sort(byRoleThenName((m) => m.farmName));
  const disableBusy = ctx.busyKey === `active:${account.id}`;
  const resetBusy = ctx.busyKey === `reset:${account.id}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3.5">
        <span
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-lg font-bold"
          style={{ background: avatar.bg, color: avatar.fg }}
        >
          {initialsFor(account.email)}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xl font-bold text-tx-strong">
            {localPart(account.email)}
            {isSelf ? " (you)" : ""}
          </span>
          <span className="text-[13px] text-tx-dim">{account.email}</span>
          <span className={`text-xs ${status.className}`}>{status.text}</span>
        </div>
      </div>

      {ctx.guard ? <Banner tone="bad" onDismiss={ctx.onClearGuard}>{ctx.guard}</Banner> : null}
      {ctx.actionError ? <Banner tone="bad">{ctx.actionError}</Banner> : null}
      {ctx.tempPassword && ctx.tempPassword.accountId === account.id ? (
        <CopyableSecret label="Temporary password" value={ctx.tempPassword.password} />
      ) : null}

      <div className="flex items-center justify-between gap-3.5 rounded-xl border border-line-soft bg-ink-800 p-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-tx-strong">Admin</span>
          <span className="text-xs text-tx-dim">
            Full access to every farm and this admin page. Granted by adding this email to the server&apos;s
            ADMIN_EMAILS setting — there is no control here to change it.
          </span>
        </div>
        <Toggle on={account.is_admin} label="Admin access" disabled onColor="bg-rose" />
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="text-xs uppercase tracking-[0.08em] text-tx-dim">Farms · {memberships.length}</span>
        {account.is_admin ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-line-soft bg-ink-800 px-3.5 py-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose bg-ink-850 px-2.5 py-1 text-xs font-bold text-rose">
              All farms · Admin
            </span>
          </div>
        ) : (
          <>
            {memberships.map((m) => {
              const key = `${m.farmId}|${account.email}`;
              return (
                <MembershipRow
                  key={m.farmId}
                  title={m.farmName}
                  role={m.role}
                  roleLabel={`Role on ${m.farmName}`}
                  onRoleChange={(role: MemberRole) => ctx.onRoleChange(m.farmId, account.email, role)}
                  removeLabel={`Remove from ${m.farmName}`}
                  onAskRemove={() => ctx.onAskRemove(m.farmId, account.email)}
                  confirming={ctx.confirmKey === key}
                  confirmMessage={`Remove ${localPart(account.email)} from ${m.farmName}?`}
                  onConfirmRemove={() => ctx.onConfirmRemove(m.farmId, account.email)}
                  onCancelRemove={ctx.onCancelRemove}
                  busy={ctx.busyKey === `member:${key}`}
                />
              );
            })}
            {memberships.length === 0 ? (
              <div className="px-0.5 py-1 text-[13px] text-tx-dim">Not assigned to any farm yet.</div>
            ) : null}
          </>
        )}
      </div>

      <div className="flex flex-col gap-2.5 border-t border-line-soft pt-3.5">
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={resetBusy}
          onClick={() => ctx.onResetPassword(account.id)}
        >
          Reset password
        </Button>
        {account.is_active ? (
          ctx.confirmDisableId === account.id ? (
            <ConfirmStrip
              message={`Disable ${localPart(account.email)}? They can't sign in until re-enabled.`}
              confirmLabel="Disable"
              busy={disableBusy}
              onCancel={ctx.onCancelDisable}
              onConfirm={() => ctx.onConfirmDisable(account.id)}
            />
          ) : (
            <Button
              variant="outline-danger"
              size="sm"
              className="self-start"
              disabled={disableBusy}
              onClick={() => ctx.onAskDisable(account.id)}
            >
              Disable account
            </Button>
          )
        ) : (
          <Button variant="outline" size="sm" className="self-start" disabled={disableBusy} onClick={() => ctx.onReEnable(account.id)}>
            <span className="text-accent">Re-enable account</span>
          </Button>
        )}
      </div>
    </div>
  );
}

function localPart(email: string) {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}
