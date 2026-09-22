"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { AccountsTab } from "@/components/admin/AccountsTab";
import {
  computeActivePondCounts,
  looksLikeEmail,
  membershipsByEmail as buildMembershipsByEmail,
  ownersOf,
  plural,
  TABS,
  type AccountFilter,
  type AccountsCtx,
  type FarmFilter,
  type FarmsCtx,
  type Tab,
} from "@/components/admin/adminHelpers";
import { AdminTopNav } from "@/components/admin/AdminTopNav";
import { FarmsTab } from "@/components/admin/FarmsTab";
import { RolesTab } from "@/components/admin/RolesTab";
import { Button } from "@/components/ui/Button";
import { Banner, Loading } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { api, type Farm, type FarmMember, type RegisteredUser } from "@/lib/api";
import type { MemberRole } from "@/lib/roles";
import { useRequireUser } from "@/lib/session";

export default function AdminPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AdminApp />
    </Suspense>
  );
}

function AdminApp() {
  const user = useRequireUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get("tab");
  const tab: Tab = (TABS as string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "farms";

  // ---- data ----
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [accounts, setAccounts] = useState<RegisteredUser[]>([]);
  const [membersByFarm, setMembersByFarm] = useState<Record<string, FarmMember[]>>({});
  const [activePondCounts, setActivePondCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user || !user.is_admin) return;
    let cancelled = false;
    (async () => {
      try {
        const [farmList, users, grids, ponds, cycles] = await Promise.all([
          api.listFarms(),
          api.listRegisteredUsers(),
          api.listGrids(),
          api.listPonds(),
          api.listCycles(),
        ]);
        const memberLists = await Promise.all(farmList.map((f) => api.listFarmMembers(f.id)));
        if (cancelled) return;
        const byFarm: Record<string, FarmMember[]> = {};
        farmList.forEach((f, i) => {
          byFarm[f.id] = memberLists[i];
        });
        setFarms(farmList);
        setAccounts(users);
        setMembersByFarm(byFarm);
        setActivePondCounts(computeActivePondCounts(grids, ponds, cycles));
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ---- shared mutation plumbing ----
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [guard, setGuard] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null); // `${farmId}|${email}`

  async function perform<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
    setBusyKey(key);
    setActionError(null);
    try {
      return await fn();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusyKey(null);
    }
  }

  function farmNameOf(id: string) {
    return farms.find((f) => f.id === id)?.name ?? "this farm";
  }

  async function onRoleChange(farmId: string, email: string, role: MemberRole) {
    const current = (membersByFarm[farmId] ?? []).find((m) => m.email.toLowerCase() === email.toLowerCase());
    if (!current || current.role === role) return;
    if (current.role === "owner" && role !== "owner" && ownersOf(membersByFarm[farmId] ?? []).length === 1) {
      setGuard(`A farm needs at least one Maintainer. Make someone else Maintainer of ${farmNameOf(farmId)} first.`);
      return;
    }
    setGuard(null);
    const saved = await perform(`member:${farmId}|${email}`, () => api.upsertFarmMember(farmId, { email, role }));
    if (!saved) return;
    setMembersByFarm((prev) => {
      const list = prev[farmId] ?? [];
      const idx = list.findIndex((m) => m.email.toLowerCase() === saved.email.toLowerCase());
      const next = idx >= 0 ? list.map((m, i) => (i === idx ? saved : m)) : [...list, saved];
      return { ...prev, [farmId]: next };
    });
  }

  function onAskRemove(farmId: string, email: string) {
    const current = (membersByFarm[farmId] ?? []).find((m) => m.email.toLowerCase() === email.toLowerCase());
    if (current && current.role === "owner" && ownersOf(membersByFarm[farmId] ?? []).length === 1) {
      setGuard(`You can't remove the only Maintainer of ${farmNameOf(farmId)}. Make someone else Maintainer first.`);
      setConfirmKey(null);
      return;
    }
    setConfirmKey(`${farmId}|${email}`);
    setGuard(null);
  }

  async function onConfirmRemove(farmId: string, email: string) {
    const result = await perform(`member:${farmId}|${email}`, () => api.deleteFarmMember(farmId, email));
    if (result === null) return;
    setMembersByFarm((prev) => ({
      ...prev,
      [farmId]: (prev[farmId] ?? []).filter((m) => m.email.toLowerCase() !== email.toLowerCase()),
    }));
    setConfirmKey(null);
  }

  function setTab(next: Tab) {
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
    setGuard(null);
    setConfirmKey(null);
    setConfirmDisableId(null);
    setCreatingFarm(false);
    setInviting(false);
    setActionError(null);
  }

  // ---- farms tab state ----
  const [farmQuery, setFarmQuery] = useState("");
  const [farmFilter, setFarmFilter] = useState<FarmFilter>("all");
  const [selFarmId, setSelFarmId] = useState<string | null>(null);
  const [creatingFarm, setCreatingFarm] = useState(false);
  const [newFarmName, setNewFarmName] = useState("");
  const [addQuery, setAddQuery] = useState("");
  const [addRole, setAddRole] = useState<MemberRole>("operator");

  // Like the mockup, open with the first farm selected rather than an empty panel.
  useEffect(() => {
    if (!selFarmId && !creatingFarm && farms.length) setSelFarmId([...farms].sort((x, y) => x.name.localeCompare(y.name))[0].id);
  }, [farms, selFarmId, creatingFarm]);

  function selectFarm(id: string) {
    setSelFarmId(id);
    setCreatingFarm(false);
    setGuard(null);
    setConfirmKey(null);
    setAddQuery("");
    setActionError(null);
  }

  function startCreateFarm() {
    setCreatingFarm(true);
    setSelFarmId(null);
    setGuard(null);
    setActionError(null);
    setNewFarmName("");
  }

  async function createFarm() {
    const name = newFarmName.trim();
    if (!name) return;
    const created = await perform("create-farm", () => api.createFarm({ name }));
    if (!created) return;
    setFarms((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    setMembersByFarm((prev) => ({ ...prev, [created.id]: [] }));
    setCreatingFarm(false);
    setNewFarmName("");
    setSelFarmId(created.id);
  }

  async function renameFarm(id: string, name: string) {
    const updated = await perform(`rename-farm:${id}`, () => api.updateFarm(id, { name }));
    if (!updated) return;
    setFarms((prev) => prev.map((f) => (f.id === id ? updated : f)));
  }

  async function deleteFarm(id: string) {
    const result = await perform(`delete-farm:${id}`, () => api.deleteFarm(id));
    if (result === null) return;
    setFarms((prev) => prev.filter((f) => f.id !== id));
    setMembersByFarm((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSelFarmId((current) => (current === id ? null : current));
  }

  async function addCandidate(farmId: string, email: string, role: MemberRole) {
    const saved = await perform(`add:${farmId}:${email.toLowerCase()}`, () => api.upsertFarmMember(farmId, { email, role }));
    if (!saved) return;
    setMembersByFarm((prev) => {
      const list = prev[farmId] ?? [];
      const idx = list.findIndex((m) => m.email.toLowerCase() === saved.email.toLowerCase());
      const next = idx >= 0 ? list.map((m, i) => (i === idx ? saved : m)) : [...list, saved];
      return { ...prev, [farmId]: next };
    });
    setAddQuery("");
  }

  // ---- accounts tab state ----
  const [accountQuery, setAccountQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [selAccountId, setSelAccountId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [confirmDisableId, setConfirmDisableId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ accountId: string; password: string } | null>(null);

  function selectAccount(id: string) {
    setSelAccountId(id);
    setInviting(false);
    setGuard(null);
    setConfirmKey(null);
    setConfirmDisableId(null);
    setActionError(null);
  }

  function startInvite() {
    setInviting(true);
    setSelAccountId(null);
    setGuard(null);
    setActionError(null);
    setInviteEmail("");
    setInvitePassword("");
  }

  async function sendInvite() {
    const email = inviteEmail.trim();
    if (!looksLikeEmail(email)) return;
    const created = await perform("invite", () => api.createUser(email, invitePassword.trim() || undefined));
    if (!created) return;
    setAccounts((prev) => [created.user, ...prev]);
    setInviting(false);
    setSelAccountId(created.user.id);
    setTempPassword(created.temporary_password ? { accountId: created.user.id, password: created.temporary_password } : null);
  }

  async function resetPassword(id: string) {
    const result = await perform(`reset:${id}`, () => api.resetUserPassword(id));
    if (!result) return;
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, must_change_password: true } : a)));
    setTempPassword(result.temporary_password ? { accountId: id, password: result.temporary_password } : null);
  }

  function askDisable(id: string) {
    if (user && id === user.id) {
      setGuard("You can't disable your own account.");
      return;
    }
    setConfirmDisableId(id);
    setGuard(null);
  }

  async function confirmDisable(id: string) {
    const updated = await perform(`active:${id}`, () => api.setUserActive(id, false));
    if (!updated) return;
    setAccounts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    setConfirmDisableId(null);
  }

  async function reEnable(id: string) {
    const updated = await perform(`active:${id}`, () => api.setUserActive(id, true));
    if (!updated) return;
    setAccounts((prev) => prev.map((a) => (a.id === id ? updated : a)));
  }

  const membershipsMap = useMemo(() => buildMembershipsByEmail(farms, membersByFarm), [farms, membersByFarm]);

  if (!user) return <Loading />;

  if (!user.is_admin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="text-lg font-bold text-tx-strong">Admins only</span>
        <p className="max-w-xs text-sm text-tx-dim">You don&apos;t have access to this page.</p>
        <Link href="/" className="text-sm font-semibold text-accent hover:text-accent-hover">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  if (!ready) return <Loading />;

  const primaryLabel = tab === "farms" ? "New farm" : tab === "accounts" ? "Invite account" : null;
  const primaryAction = tab === "farms" ? startCreateFarm : tab === "accounts" ? startInvite : undefined;
  const searchValue = tab === "farms" ? farmQuery : accountQuery;
  const onSearchChange = tab === "farms" ? setFarmQuery : setAccountQuery;
  const totalMemberships = Object.values(membersByFarm).reduce((a, list) => a + list.length, 0);
  const adminCount = accounts.filter((a) => a.is_admin).length;
  const pageTitle = tab === "farms" ? "Farms" : tab === "accounts" ? "Accounts" : "Roles & permissions";
  const pageSub =
    tab === "farms"
      ? `${plural(farms.length, "farm")} · ${plural(totalMemberships, "membership")}`
      : tab === "accounts"
        ? `${plural(accounts.length, "account")} · ${plural(adminCount, "admin")}`
        : "What each role can do";

  const farmsCtx: FarmsCtx = {
    farms,
    membersByFarm,
    accounts,
    activePondCounts,
    query: farmQuery,
    onQueryChange: setFarmQuery,
    filter: farmFilter,
    onFilterChange: setFarmFilter,
    selectedId: selFarmId,
    onSelect: selectFarm,
    creating: creatingFarm,
    newFarmName,
    onNewFarmNameChange: setNewFarmName,
    onCancelCreate: () => setCreatingFarm(false),
    onCreateFarm: createFarm,
    guard,
    onClearGuard: () => setGuard(null),
    confirmKey,
    onAskRemove,
    onCancelRemove: () => setConfirmKey(null),
    onConfirmRemove,
    onRoleChange,
    addQuery,
    onAddQueryChange: setAddQuery,
    addRole,
    onAddRoleChange: setAddRole,
    onAddCandidate: addCandidate,
    onRenameFarm: renameFarm,
    onDeleteFarm: deleteFarm,
    busyKey,
    actionError,
  };

  const accountsCtx: AccountsCtx = {
    me: user,
    accounts,
    membershipsByEmail: membershipsMap,
    query: accountQuery,
    onQueryChange: setAccountQuery,
    filter: accountFilter,
    onFilterChange: setAccountFilter,
    selectedId: selAccountId,
    onSelect: selectAccount,
    inviting,
    inviteEmail,
    onInviteEmailChange: setInviteEmail,
    invitePassword,
    onInvitePasswordChange: setInvitePassword,
    onCancelInvite: () => setInviting(false),
    onSendInvite: sendInvite,
    guard,
    onClearGuard: () => setGuard(null),
    confirmKey,
    onAskRemove,
    onCancelRemove: () => setConfirmKey(null),
    onConfirmRemove,
    onRoleChange,
    confirmDisableId,
    onAskDisable: askDisable,
    onCancelDisable: () => setConfirmDisableId(null),
    onConfirmDisable: confirmDisable,
    onReEnable: reEnable,
    onResetPassword: resetPassword,
    tempPassword,
    busyKey,
    actionError,
  };

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <AdminTopNav tab={tab} onTabChange={setTab} counts={{ farms: farms.length, accounts: accounts.length }} me={user} />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-3 border-b border-line-soft px-4 py-4 lg:h-[84px] lg:shrink-0 lg:flex-row lg:items-center lg:justify-between lg:gap-5 lg:px-8 lg:py-0">
          <div className="flex flex-col gap-0.5">
            <h1 className="m-0 text-2xl font-bold text-tx-strong">{pageTitle}</h1>
            <span className="text-[13px] text-tx-dim">{pageSub}</span>
          </div>
          {tab !== "roles" ? (
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-[300px]">
                <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tx-dim" />
                <input
                  type="search"
                  aria-label={tab === "farms" ? "Search farms" : "Search accounts"}
                  placeholder={tab === "farms" ? "Search farms" : "Search by email"}
                  value={searchValue}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="input pl-9"
                />
              </div>
              {primaryLabel ? (
                <Button variant="primary" size="md" onClick={primaryAction} className="shrink-0">
                  <Icon name="plus" size={14} strokeWidth={2.6} />
                  {primaryLabel}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {loadError ? (
          <div className="px-4 pt-4 lg:px-8">
            <Banner tone="bad">{loadError}</Banner>
          </div>
        ) : null}

        {tab === "farms" ? <FarmsTab ctx={farmsCtx} /> : null}
        {tab === "accounts" ? <AccountsTab ctx={accountsCtx} /> : null}
        {tab === "roles" ? <RolesTab membersByFarm={membersByFarm} accounts={accounts} /> : null}
      </div>
    </div>
  );
}
