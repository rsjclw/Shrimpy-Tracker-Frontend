"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { clearSession, getStoredUser, getToken, type AuthUser } from "./auth";

/**
 * Client-side route guard. Returns the signed-in user once the token check has
 * run, redirecting to /login (no token) or /change-password (temporary
 * password) first. Pages render nothing until it returns a user.
 */
export function useRequireUser({ allowPasswordChange = false } = {}): AuthUser | null {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const stored = getStoredUser();
    if (!getToken() || !stored) {
      router.replace("/login");
      return;
    }
    if (stored.must_change_password && !allowPasswordChange) {
      router.replace("/change-password");
      return;
    }
    setUser(stored);
  }, [router, allowPasswordChange]);

  return user;
}

export function signOut() {
  clearSession();
  window.location.assign("/login");
}
