"use client";

import { useMemo, useState } from "react";
import { api, type FarmMember, type RegisteredUser } from "@/lib/api";
import { CollapsibleSection } from "./CollapsibleSection";

function joinedDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

type TempPassword = { email: string; password: string };

function TempPasswordPanel({ value, onDismiss }: { value: TempPassword; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value.password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
      <p>
        Temporary password for <span className="font-medium">{value.email}</span>. It is shown only once;
        the user must change it after signing in.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-white border border-amber-200 px-2 py-1 font-mono text-base select-all">
          {value.password}
        </code>
        <button type="button" onClick={copy} className="rounded border border-amber-300 px-3 py-1 text-sm">
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={onDismiss} className="text-sm text-amber-800 hover:underline">
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function RegisteredUsersSection({
  farmId,
  members,
  users,
  error,
  open,
  onToggle,
  onChanged,
}: {
  farmId: string;
  members: FarmMember[];
  users: RegisteredUser[];
  error: string | null;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<TempPassword | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const membersByEmail = useMemo(
    () => new Map(members.map((member) => [member.email.toLowerCase(), member])),
    [members],
  );
  const filteredUsers = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return users;
    return users.filter((user) => user.email.toLowerCase().includes(trimmed));
  }, [query, users]);

  function setRowError(userId: string, message: string | null) {
    setRowErrors((current) => {
      const next = { ...current };
      if (message) next[userId] = message;
      else delete next[userId];
      return next;
    });
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim();
    if (!email) return;
    setCreating(true);
    setCreateError(null);
    try {
      const result = await api.createUser(email, newPassword || undefined);
      setTempPassword(
        result.temporary_password ? { email: result.user.email, password: result.temporary_password } : null,
      );
      setNewEmail("");
      setNewPassword("");
      setShowNew(false);
      onChanged();
    } catch (err) {
      setCreateError(errorText(err));
    } finally {
      setCreating(false);
    }
  }

  async function resetPassword(user: RegisteredUser) {
    setBusyUserId(user.id);
    setRowError(user.id, null);
    try {
      const result = await api.resetUserPassword(user.id);
      setTempPassword(
        result.temporary_password ? { email: user.email, password: result.temporary_password } : null,
      );
      onChanged();
    } catch (err) {
      setRowError(user.id, errorText(err));
    } finally {
      setBusyUserId(null);
    }
  }

  async function setActive(user: RegisteredUser, is_active: boolean) {
    if (!is_active && !window.confirm(`Deactivate "${user.email}"? They will no longer be able to sign in.`)) {
      return;
    }
    setBusyUserId(user.id);
    setRowError(user.id, null);
    try {
      await api.setUserActive(user.id, is_active);
      onChanged();
    } catch (err) {
      setRowError(user.id, errorText(err));
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <CollapsibleSection
      title="Registered users"
      count={users.length}
      open={open}
      onToggle={onToggle}
      action={
        <button
          onClick={() => setShowNew((v) => !v)}
          className="text-sm bg-primary text-white px-3 py-1 rounded"
        >
          + Add user
        </button>
      }
    >
      <div className="space-y-3">
        {showNew && (
          <form onSubmit={createUser} className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                autoFocus
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Email"
                className="flex-1 border rounded px-3 py-2"
                required
              />
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Password (optional)"
                className="flex-1 border rounded px-3 py-2"
                autoComplete="off"
                minLength={8}
              />
              <button disabled={creating} className="bg-primary text-white px-4 py-2 rounded disabled:opacity-50">
                {creating ? "..." : "Add"}
              </button>
              <button type="button" onClick={() => setShowNew(false)} className="border px-3 py-2 rounded">
                Cancel
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Leave the password blank to generate a temporary one. The user will be asked to change it on first sign in.
            </p>
            {createError && <p className="text-sm text-red-600">{createError}</p>}
          </form>
        )}

        {tempPassword && <TempPasswordPanel value={tempPassword} onDismiss={() => setTempPassword(null)} />}

        {error ? (
          <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-slate-500">No registered users yet.</p>
        ) : (
          <>
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
                  const busy = busyUserId === user.id;
                  const rowError = rowErrors[user.id];
                  return (
                    <li
                      key={user.id}
                      className={`bg-white rounded-lg shadow p-4 ${user.is_active ? "" : "opacity-75"}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium">{user.email}</span>
                            {!user.is_active && (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">
                                Deactivated
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-slate-500">
                            Joined {joinedDate(user.created_at)}
                            {user.is_admin ? " - admin" : member ? ` - ${member.role} on this farm` : ""}
                          </div>
                          {user.must_change_password && (
                            <div className="text-xs text-amber-700">Must change password on next sign in</div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => resetPassword(user)}
                            disabled={busy}
                            className="rounded border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busy ? "..." : "Reset password"}
                          </button>
                          {user.is_active ? (
                            <button
                              type="button"
                              onClick={() => setActive(user, false)}
                              disabled={busy}
                              className="rounded border border-red-200 px-3 py-2 text-sm text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setActive(user, true)}
                              disabled={busy}
                              className="rounded border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Activate
                            </button>
                          )}
                        </div>
                      </div>
                      {rowError && <p className="mt-2 text-sm text-red-600">{rowError}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </CollapsibleSection>
  );
}
