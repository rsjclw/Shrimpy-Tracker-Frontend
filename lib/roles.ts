import type { FarmRole } from "./api";

// Backend roles are owner / operator / viewer per farm, plus the global admin.
// The UI calls the owner role "Maintainer".

export type MemberRole = Exclude<FarmRole, "admin">;

export const ROLE_LABEL: Record<FarmRole, string> = {
  admin: "Admin",
  owner: "Maintainer",
  operator: "Operator",
  viewer: "Viewer",
};

/** Text colour class per role, matching the admin mockup. */
export const ROLE_TEXT: Record<FarmRole, string> = {
  admin: "text-rose",
  owner: "text-warn",
  operator: "text-accent",
  viewer: "text-tx-soft",
};

export const ROLE_BORDER: Record<FarmRole, string> = {
  admin: "border-rose",
  owner: "border-warn",
  operator: "border-accent",
  viewer: "border-tx-soft",
};

export const MEMBER_ROLES: MemberRole[] = ["owner", "operator", "viewer"];

/** Log feed, water, sampling, harvests and treatments. */
export function canAdd(role: FarmRole | null | undefined) {
  return role === "admin" || role === "owner" || role === "operator";
}

/** Edit or delete past logs, pond and cycle settings, farm catalogs. */
export function canManage(role: FarmRole | null | undefined) {
  return role === "admin" || role === "owner";
}
