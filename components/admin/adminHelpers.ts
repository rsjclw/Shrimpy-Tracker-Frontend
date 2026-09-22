import type { Cycle, Farm, FarmMember, Grid, Pond, RegisteredUser } from "@/lib/api";
import type { AuthUser } from "@/lib/auth";
import type { MemberRole } from "@/lib/roles";

export type Tab = "farms" | "accounts" | "roles";
export const TABS: Tab[] = ["farms", "accounts", "roles"];

/** Avatar background/foreground pairs, matching the mockup's AVATARS palette. */
const AVATARS: [string, string][] = [
  ["#1E3A34", "#5EEAD4"],
  ["#3A2F1A", "#FCD34D"],
  ["#2A2440", "#C4B5FD"],
  ["#3B2533", "#F9A8D4"],
  ["#1E2E3F", "#93C5FD"],
  ["#33291E", "#FDBA74"],
];

/** Deterministic avatar colours from an id, matching the mockup's avatar() hash. */
export function avatarFor(id: string): { bg: string; fg: string } {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const [bg, fg] = AVATARS[h % AVATARS.length];
  return { bg, fg };
}

export function localPart(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

/** Initials from the local part of an email (there are no names in the backend). */
export function initialsFor(email: string): string {
  const cleaned = localPart(email).replace(/[._+-]+/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return email.slice(0, 2).toUpperCase() || "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Loose email check mirroring the backend's own validate_email (just needs an "@"). */
export function looksLikeEmail(value: string): boolean {
  const v = value.trim();
  return v.length > 0 && v.length <= 255 && v.includes("@") && !v.startsWith("@") && !v.endsWith("@") && !/\s/.test(v);
}

export const MEMBER_ROLE_OPTIONS: MemberRole[] = ["owner", "operator", "viewer"];

/** Active-pond count per farm: ponds (via grid.farm_id) with >=1 cycle whose status is "active". */
export function computeActivePondCounts(grids: Grid[], ponds: Pond[], cycles: Cycle[]): Record<string, number> {
  const farmByGrid = new Map(grids.map((g) => [g.id, g.farm_id] as const));
  const activePondIds = new Set(cycles.filter((c) => c.status === "active").map((c) => c.pond_id));
  const counts: Record<string, number> = {};
  for (const pond of ponds) {
    if (!activePondIds.has(pond.id)) continue;
    const farmId = farmByGrid.get(pond.grid_id);
    if (!farmId) continue;
    counts[farmId] = (counts[farmId] ?? 0) + 1;
  }
  return counts;
}

export function ownersOf(members: FarmMember[]): FarmMember[] {
  return members.filter((m) => m.role === "owner");
}

export type FarmMembership = { farmId: string; farmName: string; role: MemberRole };

/** All memberships for every account, keyed by lowercase email (emails are normalized server-side). */
export function membershipsByEmail(
  farms: Farm[],
  membersByFarm: Record<string, FarmMember[]>,
): Map<string, FarmMembership[]> {
  const farmName = new Map(farms.map((f) => [f.id, f.name] as const));
  const map = new Map<string, FarmMembership[]>();
  for (const farm of farms) {
    for (const m of membersByFarm[farm.id] ?? []) {
      const key = m.email.toLowerCase();
      const list = map.get(key) ?? [];
      list.push({ farmId: farm.id, farmName: farmName.get(farm.id) ?? farm.name, role: m.role });
      map.set(key, list);
    }
  }
  return map;
}

export function accountStatus(a: RegisteredUser): { label: string; textClass: string; borderClass: string } {
  if (!a.is_active) return { label: "Disabled", textClass: "text-tx-dim", borderClass: "border-tx-dim" };
  if (!a.last_sign_in_at) return { label: "Invited", textClass: "text-warn", borderClass: "border-warn" };
  return { label: "Active", textClass: "text-good", borderClass: "border-good" };
}

export function accountStatusLine(a: RegisteredUser): { text: string; className: string } {
  if (!a.is_active) return { text: "Disabled · can't sign in", className: "text-tx-dim" };
  if (!a.last_sign_in_at) return { text: "Invited · hasn't signed in yet", className: "text-warn" };
  if (a.must_change_password) {
    return { text: "Temporary password · must change at next sign-in", className: "text-warn" };
  }
  return { text: "Active", className: "text-good" };
}

const ROLE_ORDER: Record<MemberRole, number> = { owner: 0, operator: 1, viewer: 2 };
export function byRoleThenName<T extends { role: MemberRole }>(getName: (t: T) => string) {
  return (a: T, b: T) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || getName(a).localeCompare(getName(b));
}

// ---- Shared context objects passed from app/admin/page.tsx into each tab ----

export type FarmFilter = "all" | "nomaint";
export type AccountFilter = "all" | "admin" | "invited" | "disabled";

export type FarmsCtx = {
  farms: Farm[];
  membersByFarm: Record<string, FarmMember[]>;
  accounts: RegisteredUser[];
  activePondCounts: Record<string, number>;
  query: string;
  onQueryChange: (v: string) => void;
  filter: FarmFilter;
  onFilterChange: (f: FarmFilter) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  creating: boolean;
  newFarmName: string;
  onNewFarmNameChange: (v: string) => void;
  onCancelCreate: () => void;
  onCreateFarm: () => void;
  guard: string | null;
  onClearGuard: () => void;
  confirmKey: string | null;
  onAskRemove: (farmId: string, email: string) => void;
  onCancelRemove: () => void;
  onConfirmRemove: (farmId: string, email: string) => void;
  onRoleChange: (farmId: string, email: string, role: MemberRole) => void;
  addQuery: string;
  onAddQueryChange: (v: string) => void;
  addRole: MemberRole;
  onAddRoleChange: (r: MemberRole) => void;
  onAddCandidate: (farmId: string, email: string, role: MemberRole) => void;
  onRenameFarm: (id: string, name: string) => void;
  onDeleteFarm: (id: string) => void;
  busyKey: string | null;
  actionError: string | null;
};

export type AccountsCtx = {
  me: AuthUser;
  accounts: RegisteredUser[];
  membershipsByEmail: Map<string, FarmMembership[]>;
  query: string;
  onQueryChange: (v: string) => void;
  filter: AccountFilter;
  onFilterChange: (f: AccountFilter) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  inviting: boolean;
  inviteEmail: string;
  onInviteEmailChange: (v: string) => void;
  invitePassword: string;
  onInvitePasswordChange: (v: string) => void;
  onCancelInvite: () => void;
  onSendInvite: () => void;
  guard: string | null;
  onClearGuard: () => void;
  confirmKey: string | null;
  onAskRemove: (farmId: string, email: string) => void;
  onCancelRemove: () => void;
  onConfirmRemove: (farmId: string, email: string) => void;
  onRoleChange: (farmId: string, email: string, role: MemberRole) => void;
  confirmDisableId: string | null;
  onAskDisable: (id: string) => void;
  onCancelDisable: () => void;
  onConfirmDisable: (id: string) => void;
  onReEnable: (id: string) => void;
  onResetPassword: (id: string) => void;
  tempPassword: { accountId: string; password: string } | null;
  busyKey: string | null;
  actionError: string | null;
};
