"use client";

// Client-side cache so the dashboard does not refetch what it just loaded.
//
// Entries live in memory for the whole tab session (surviving navigation
// between pages), and a few small ones are also persisted to localStorage so a
// fresh visit can draw real names before the backend answers.
//
// An entry is fresh for FRESH_MS after the request that produced it started,
// and only if nothing has been saved since: every successful write through
// api.ts calls markAllStale(). Stale entries are still shown; callers refetch
// them in the background.

const FRESH_MS = 5 * 60_000;
const STORAGE_PREFIX = "shrimpy.cache.";

type Entry = { value: unknown; at: number };

const mem = new Map<string, Entry>();
const inflight = new Map<string, { promise: Promise<unknown>; at: number }>();
let staleBefore = 0;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isFresh(at: number) {
  return at > staleBefore && Date.now() - at < FRESH_MS;
}

/** The cached value, if any, and whether it can be used without refetching. */
export function peek<T>(key: string): { value: T; fresh: boolean } | null {
  let entry = mem.get(key);
  if (!entry) {
    try {
      const raw = storage()?.getItem(STORAGE_PREFIX + key);
      // Persisted values are from an earlier visit: shown, but always revalidated.
      if (raw) entry = { value: JSON.parse(raw), at: 0 };
      if (entry) mem.set(key, entry);
    } catch {
      // unreadable storage: treat as a miss
    }
  }
  return entry ? { value: entry.value as T, fresh: isFresh(entry.at) } : null;
}

/** Store a value produced by a request that started at `at`. */
export function put(key: string, value: unknown, { persist = false, at = Date.now() } = {}) {
  mem.set(key, { value, at });
  if (!persist) return;
  try {
    storage()?.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // quota or private mode: memory copy still works
  }
}

/** A request for `key` that started after the last write, if one is running. */
export function pending(key: string): Promise<unknown> | undefined {
  const p = inflight.get(key);
  return p && p.at > staleBefore ? p.promise : undefined;
}

/** Register one promise as the in-flight request for several keys (a batched fetch). */
export function track(keys: string[], promise: Promise<unknown>, at: number) {
  keys.forEach((k) => inflight.set(k, { promise, at }));
  promise
    .finally(() => keys.forEach((k) => inflight.get(k)?.promise === promise && inflight.delete(k)))
    .catch(() => {});
}

/** Fetch and cache one key, sharing a request already in flight. */
export function load<T>(key: string, fetcher: () => Promise<T>, { persist = false } = {}): Promise<T> {
  const running = pending(key);
  if (running) return running as Promise<T>;
  const at = Date.now();
  const promise = fetcher().then((value) => {
    put(key, value, { persist, at });
    return value;
  });
  track([key], promise, at);
  return promise;
}

/** Called after any successful write: everything cached so far needs revalidating. */
export function markAllStale() {
  staleBefore = Date.now();
}

/** Drop persisted copies, e.g. on sign-out so the next account never sees them. */
export function clearPersisted() {
  mem.clear();
  const store = storage();
  if (!store) return;
  try {
    for (let i = store.length - 1; i >= 0; i--) {
      const k = store.key(i);
      if (k?.startsWith(STORAGE_PREFIX)) store.removeItem(k);
    }
  } catch {
    // ignore
  }
}
