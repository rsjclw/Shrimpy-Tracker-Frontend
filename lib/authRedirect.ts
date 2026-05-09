"use client";

const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");

export function authRedirectUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const origin =
    configuredSiteUrl ||
    (typeof window !== "undefined" ? window.location.origin : "");

  return `${origin}${normalizedPath}`;
}
