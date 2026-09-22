"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Banner, ConfirmStrip } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import type { Farm } from "@/lib/api";
import type { MemberRole } from "@/lib/roles";
import { avatarFor, byRoleThenName, initialsFor, looksLikeEmail, plural, type FarmsCtx } from "./adminHelpers";
import { MembershipRow } from "./MembershipRow";

export function CreateFarmForm({ ctx }: { ctx: FarmsCtx }) {
  const name = ctx.newFarmName.trim();
  const busy = ctx.busyKey === "create-farm";
  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-accent bg-ink-800 p-[18px]">
      <span className="text-[17px] font-bold text-tx-strong">New farm</span>
      {ctx.actionError ? <Banner tone="bad">{ctx.actionError}</Banner> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nf-name" className="field-label">
          Farm name
        </label>
        <input
          id="nf-name"
          type="text"
          autoFocus
          value={ctx.newFarmName}
          onChange={(e) => ctx.onNewFarmNameChange(e.target.value)}
          className="input"
        />
      </div>
      <span className="text-xs text-tx-dim">After creating it, add at least one Maintainer.</span>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={ctx.onCancelCreate} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={ctx.onCreateFarm} disabled={!name || busy}>
          Create farm
        </Button>
      </div>
    </div>
  );
}

export function FarmDetailPanel({ farm, ctx }: { farm: Farm; ctx: FarmsCtx }) {
  const members = (ctx.membersByFarm[farm.id] ?? [])
    .slice()
    .sort(byRoleThenName((m) => m.email));
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const activePonds = ctx.activePondCounts[farm.id] ?? 0;

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(farm.name);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  useEffect(() => {
    setRenaming(false);
    setRenameValue(farm.name);
    setDeleteConfirming(false);
  }, [farm.id, farm.name]);

  const renameBusy = ctx.busyKey === `rename-farm:${farm.id}`;
  const deleteBusy = ctx.busyKey === `delete-farm:${farm.id}`;

  const existingEmails = new Set(members.map((m) => m.email.toLowerCase()));
  const addQuery = ctx.addQuery.trim().toLowerCase();
  const candidateAccounts = ctx.accounts
    .filter((a) => a.is_active && !a.is_admin && !existingEmails.has(a.email.toLowerCase()))
    .filter((a) => !addQuery || a.email.toLowerCase().includes(addQuery))
    .slice(0, addQuery ? 6 : 3);
  const candidates = candidateAccounts.map((a) => {
    const membershipCount = Object.values(ctx.membersByFarm).reduce(
      (n, list) => n + (list.some((m) => m.email.toLowerCase() === a.email.toLowerCase()) ? 1 : 0),
      0,
    );
    const avatar = avatarFor(a.id);
    return {
      account: a,
      avatar: { bg: avatar.bg, fg: avatar.fg, initials: initialsFor(a.email) },
      farmsText: !a.last_sign_in_at ? "invited" : membershipCount ? plural(membershipCount, "farm") : "no farms",
    };
  });
  const offerNewEmail =
    !!ctx.addQuery.trim() &&
    looksLikeEmail(ctx.addQuery) &&
    !existingEmails.has(addQuery) &&
    !candidateAccounts.some((a) => a.email.toLowerCase() === addQuery);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          {renaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="input-sm flex-1 text-lg font-bold"
            />
          ) : (
            <span className="text-[22px] font-bold text-tx-strong">{farm.name}</span>
          )}
          {renaming ? (
            <>
              <Button
                variant="primary"
                size="xs"
                disabled={!renameValue.trim() || renameBusy}
                onClick={() => {
                  ctx.onRenameFarm(farm.id, renameValue.trim());
                  setRenaming(false);
                }}
              >
                Save
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setRenaming(false)} disabled={renameBusy}>
                Cancel
              </Button>
            </>
          ) : (
            <button
              type="button"
              aria-label="Rename farm"
              onClick={() => setRenaming(true)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-tx-dim hover:text-tx-strong"
            >
              <Icon name="pencil" size={13} />
            </button>
          )}
        </div>
        <span className="text-[13px] text-tx-dim">{plural(activePonds, "active pond")}</span>
        {ownerCount === 0 ? (
          <span className="mt-1.5 self-start rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-xs font-semibold text-warn">
            This farm has no Maintainer yet. Add one below.
          </span>
        ) : null}
      </div>

      {ctx.guard ? <Banner tone="bad" onDismiss={ctx.onClearGuard}>{ctx.guard}</Banner> : null}
      {ctx.actionError ? <Banner tone="bad">{ctx.actionError}</Banner> : null}

      <div className="flex flex-col gap-2.5">
        <span className="text-xs uppercase tracking-[0.08em] text-tx-dim">Members · {members.length}</span>
        {members.map((m) => {
          const avatar = avatarFor(m.email);
          const key = `${farm.id}|${m.email}`;
          return (
            <MembershipRow
              key={m.email}
              avatar={{ bg: avatar.bg, fg: avatar.fg, initials: initialsFor(m.email) }}
              title={localPart(m.email)}
              subtitle={m.email}
              role={m.role}
              roleLabel={`Role for ${m.email}`}
              onRoleChange={(role) => ctx.onRoleChange(farm.id, m.email, role)}
              removeLabel={`Remove ${m.email} from this farm`}
              onAskRemove={() => ctx.onAskRemove(farm.id, m.email)}
              confirming={ctx.confirmKey === key}
              confirmMessage={`Remove ${m.email} from ${farm.name}?`}
              onConfirmRemove={() => ctx.onConfirmRemove(farm.id, m.email)}
              onCancelRemove={ctx.onCancelRemove}
              busy={ctx.busyKey === `member:${key}`}
            />
          );
        })}
        {members.length === 0 ? (
          <div className="px-0.5 py-1 text-[13px] text-tx-dim">Nobody is assigned to this farm yet.</div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2.5 rounded-2xl border border-dashed border-line-dash p-4">
        <span className="text-sm font-bold text-tx-strong">Add member</span>
        <div className="flex gap-2">
          <input
            type="search"
            aria-label="Find account by email"
            placeholder="Find account by email"
            value={ctx.addQuery}
            onChange={(e) => ctx.onAddQueryChange(e.target.value)}
            className="input-sm min-w-0 flex-1"
          />
          <select
            aria-label="Role for new member"
            value={ctx.addRole}
            onChange={(e) => ctx.onAddRoleChange(e.target.value as MemberRole)}
            className="input-sm w-auto shrink-0"
          >
            <option value="owner">as Maintainer</option>
            <option value="operator">as Operator</option>
            <option value="viewer">as Viewer</option>
          </select>
        </div>
        {candidates.map((c) => (
          <div key={c.account.id} className="flex items-center gap-2.5 px-0.5 py-1">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
              style={{ background: c.avatar.bg, color: c.avatar.fg }}
            >
              {c.avatar.initials}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-semibold text-tx-strong">{localPart(c.account.email)}</span>
              <span className="truncate text-[11px] text-tx-dim">
                {c.account.email} · {c.farmsText}
              </span>
            </div>
            <Button
              variant="outline"
              size="xs"
              disabled={ctx.busyKey === `add:${farm.id}:${c.account.email}`}
              onClick={() => ctx.onAddCandidate(farm.id, c.account.email, ctx.addRole)}
            >
              <span className="text-accent">Add</span>
            </Button>
          </div>
        ))}
        {offerNewEmail ? (
          <div className="flex items-center gap-2.5 px-0.5 py-1">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-750 text-tx-dim">
              <Icon name="mail" size={13} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-semibold text-tx-strong">{ctx.addQuery.trim()}</span>
              <span className="text-[11px] text-tx-dim">not a registered account yet</span>
            </div>
            <Button
              variant="outline"
              size="xs"
              disabled={ctx.busyKey === `add:${farm.id}:${ctx.addQuery.trim().toLowerCase()}`}
              onClick={() => ctx.onAddCandidate(farm.id, ctx.addQuery.trim(), ctx.addRole)}
            >
              <span className="text-accent">Add {ctx.addQuery.trim()}</span>
            </Button>
          </div>
        ) : null}
        {candidates.length === 0 && !offerNewEmail ? (
          <span className="text-xs text-tx-dim">No matching accounts. Invite them from the Accounts tab.</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2.5 border-t border-line-soft pt-4">
        <span className="text-xs uppercase tracking-[0.08em] text-tx-dim">Danger zone</span>
        {deleteConfirming ? (
          <ConfirmStrip
            message={`Delete ${farm.name}? This permanently deletes its grids, ponds, cycles and all logged data.`}
            confirmLabel="Delete farm"
            busy={deleteBusy}
            onCancel={() => setDeleteConfirming(false)}
            onConfirm={() => ctx.onDeleteFarm(farm.id)}
          />
        ) : (
          <Button variant="outline-danger" size="sm" className="self-start" onClick={() => setDeleteConfirming(true)}>
            Delete farm
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
