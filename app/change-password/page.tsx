"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getStoredUser, getToken, updateStoredUser } from "@/lib/auth";

const MIN_PASSWORD_LENGTH = 8;

export default function ChangePasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [mustChange, setMustChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setMustChange(Boolean(getStoredUser()?.must_change_password));
    setReady(true);
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must differ from the current one.");
      return;
    }
    setLoading(true);
    try {
      const user = await api.changePassword(currentPassword, newPassword);
      updateStoredUser(user);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password.");
      setLoading(false);
    }
  }

  if (!ready) return <main className="p-6">Loading...</main>;

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-lg shadow p-6 space-y-4"
      >
        <h1 className="text-xl font-semibold">Change password</h1>
        {mustChange && (
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            You must set a new password before continuing.
          </p>
        )}
        <input
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full border rounded px-3 py-2"
          autoComplete="current-password"
          required
        />
        <input
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full border rounded px-3 py-2"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full border rounded px-3 py-2"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-white rounded py-2 disabled:opacity-50"
        >
          {loading ? "..." : "Update password"}
        </button>
        {!mustChange && (
          <Link href="/" className="block text-center text-sm text-slate-600 hover:underline">
            Back to farm
          </Link>
        )}
      </form>
    </main>
  );
}
