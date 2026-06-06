import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOP_BY_HOP_HEADERS = [
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

function backendBaseUrl(): string | null {
  const configured =
    process.env.BACKEND_URL?.trim() ||
    (process.env.NEXT_PUBLIC_API_URL?.startsWith("http")
      ? process.env.NEXT_PUBLIC_API_URL.trim()
      : "") ||
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:8000");

  if (!configured || configured.startsWith("/")) return null;
  return configured.replace(/\/+$/, "");
}

function targetUrl(request: NextRequest, path: string[]): string | null {
  const baseUrl = backendBaseUrl();
  if (!baseUrl) return null;

  const upstream = new URL(`${baseUrl}/${path.map(encodeURIComponent).join("/")}`);
  upstream.search = request.nextUrl.search;
  return upstream.toString();
}

function forwardedHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.set("x-forwarded-host", request.headers.get("host") ?? "");
  headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));

  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }
  headers.delete("host");
  return headers;
}

async function proxy(request: NextRequest, context: { params: { path: string[] } }) {
  const url = targetUrl(request, context.params.path);
  if (!url) {
    return Response.json(
      {
        detail:
          "Backend proxy is not configured. Set BACKEND_URL to the backend API origin.",
      },
      { status: 500 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const method = request.method.toUpperCase();
    const response = await fetch(url, {
      method,
      headers: forwardedHeaders(request),
      body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });

    const headers = new Headers(response.headers);
    for (const header of HOP_BY_HOP_HEADERS) {
      headers.delete(header);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return Response.json(
      {
        detail: aborted
          ? "Backend request timed out."
          : "Backend request failed.",
      },
      { status: aborted ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
