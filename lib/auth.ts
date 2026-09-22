"use client";

// Storage-only session helpers. No fetch calls live here so that api.ts can
// import this module without creating a cycle.

import { clearPersisted } from "./cache";

export type AuthUser = {
  id: string;
  email: string;
  is_admin: boolean;
  must_change_password: boolean;
};

const TOKEN_KEY = "shrimpy.token";
const USER_KEY = "shrimpy.user";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  try {
    return storage()?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = storage()?.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AuthUser) {
  // A new sign-in never inherits the previous account's cached farms.
  clearPersisted();
  try {
    const store = storage();
    store?.setItem(TOKEN_KEY, token);
    store?.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Storage unavailable (private mode, quota); the session simply won't persist.
  }
}

export function updateStoredUser(user: AuthUser) {
  try {
    storage()?.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // ignore
  }
}

export function clearSession() {
  clearPersisted();
  try {
    const store = storage();
    store?.removeItem(TOKEN_KEY);
    store?.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}
