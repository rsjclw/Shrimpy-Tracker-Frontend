"use client";

import { useMemo, useState } from "react";
import { type FarmMember, type RegisteredUser } from "@/lib/api";
import { CollapsibleSection } from "./CollapsibleSection";

function joinedDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function RegisteredUsersSection({
  farmId,
  members,
  users,
  error,
  open,
  onToggle,
}: {
  farmId: string;
  members: FarmMember[];
  users: RegisteredUser[];
  error: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  const [query, setQuery] = useState("");
  const membersByEmail = useMemo(
    () => new Map(members.map((member) => [member.email.toLowerCase(), member])),
    [members],
  );
  const filteredUsers = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return users;
    return users.filter((user) => user.email.toLowerCase().includes(trimmed));
  }, [query, users]);

  return (
    <CollapsibleSection
      title="Registered users"
      count={users.length}
      open={open}
      onToggle={onToggle}
      action={null}
    >
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-slate-500">No registered users yet.</p>
      ) : (
        <div className="space-y-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search registered email"
            className="w-full border rounded px-3 py-2"
          />
          {filteredUsers.length === 0 ? (
            <p className="text-sm text-slate-500">No registered users match that search.</p>
          ) : (
            <ul className="grid gap-3">
              {filteredUsers.map((user) => {
                const member = membersByEmail.get(user.email.toLowerCase());
                return (
                  <li key={user.id} className="bg-white rounded-lg shadow p-4">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{user.email}</div>
                      <div className="text-sm text-slate-500">
                        Joined {joinedDate(user.created_at)}
                        {user.is_admin ? " - admin" : member ? ` - ${member.role} on this farm` : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
