"use client";

import { useState } from "react";
import { api, type FarmMember, type FarmRole } from "@/lib/api";
import { CollapsibleSection } from "./CollapsibleSection";

const emptyForm: { email: string; role: Exclude<FarmRole, "admin"> } = { email: "", role: "viewer" };
const memberRoles: Exclude<FarmRole, "admin">[] = ["owner", "operator", "viewer"];

export function MembersSection({
  farmId,
  members,
  open,
  onToggle,
  onReload,
}: {
  farmId: string;
  members: FarmMember[];
  open: boolean;
  onToggle: () => void;
  onReload: () => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [rolesByEmail, setRolesByEmail] = useState<Record<string, Exclude<FarmRole, "admin">>>({});
  const [savingEmail, setSavingEmail] = useState<string | null>(null);

  async function upsert(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email.trim()) return;
    await api.upsertFarmMember(farmId, { email: form.email.trim(), role: form.role });
    setForm(emptyForm);
    setShowNew(false);
    onReload();
  }

  async function updateRole(member: FarmMember) {
    const role = rolesByEmail[member.email] ?? member.role;
    setSavingEmail(member.email);
    try {
      await api.upsertFarmMember(farmId, { email: member.email, role });
      onReload();
    } finally {
      setSavingEmail(null);
    }
  }

  async function remove(email: string) {
    if (!confirm(`Remove "${email}" from this farm?`)) return;
    await api.deleteFarmMember(farmId, email);
    onReload();
  }

  return (
    <CollapsibleSection
      title="Members"
      count={members.length}
      open={open}
      onToggle={onToggle}
      action={
        <button
          onClick={() => setShowNew((v) => !v)}
          className="text-sm bg-primary text-white px-3 py-1 rounded"
        >
          + New member
        </button>
      }
    >
      {showNew && (
        <form onSubmit={upsert} className="flex flex-col gap-2 sm:flex-row">
          <input
            autoFocus
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email"
            className="flex-1 border rounded px-3 py-2"
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Exclude<FarmRole, "admin"> })}
            className="border rounded px-3 py-2"
          >
            {memberRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button className="bg-primary text-white px-4 rounded">Add</button>
          <button type="button" onClick={() => setShowNew(false)} className="border px-3 rounded">
            Cancel
          </button>
        </form>
      )}

      {members.length === 0 ? (
        <p className="text-slate-500 text-sm">No registered members yet.</p>
      ) : (
        <ul className="grid gap-3">
          {members.map((member) => {
            const role = rolesByEmail[member.email] ?? member.role;
            const dirty = role !== member.role;
            return (
              <li key={member.email} className="bg-white rounded-lg shadow p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{member.email}</div>
                    <div className="text-sm text-slate-500">{member.role}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={role}
                      onChange={(e) =>
                        setRolesByEmail((current) => ({
                          ...current,
                          [member.email]: e.target.value as Exclude<FarmRole, "admin">,
                        }))
                      }
                      className="border rounded px-3 py-2 text-sm"
                    >
                      {memberRoles.map((memberRole) => (
                        <option key={memberRole} value={memberRole}>
                          {memberRole}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => updateRole(member)}
                      disabled={!dirty || savingEmail === member.email}
                      className="rounded border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingEmail === member.email ? "..." : "Save"}
                    </button>
                    <button
                      onClick={() => remove(member.email)}
                      className="rounded border border-red-200 px-3 py-2 text-sm text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CollapsibleSection>
  );
}
