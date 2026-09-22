"use client";

import { useEffect, useState } from "react";
import type { Lang } from "./copy";

const LANG_KEY = "shrimpy.lang";

function readStoredLang(): Lang {
  try {
    return window.localStorage.getItem(LANG_KEY) === "id" ? "id" : "en";
  } catch {
    return "en";
  }
}

/**
 * Persisted EN/ID language choice, shared by the sign-in and change-password
 * screens. Starts as "en" during SSR/first paint, then syncs from
 * localStorage once mounted (storage access is best-effort: private
 * browsing / blocked storage just falls back to "en" for the session).
 */
export function useLang(): [Lang, (lang: Lang) => void] {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    setLangState(readStoredLang());
  }, []);

  function setLang(next: Lang) {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // Storage unavailable; the choice just won't persist across reloads.
    }
  }

  return [lang, setLang];
}
