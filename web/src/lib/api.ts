/**
 * Typed HTTP client for the FastAPI backend.
 *
 * Meant to be called from server actions only (runs on the Next.js server).
 * Handles base URL resolution, query string building, and error shaping
 * so individual actions stay thin.
 */

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL ?? "http://localhost:8000/api";

// ── response types ──────────────────────────────────────────────────────────

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: string };
export type ApiResult<T> = ApiOk<T> | ApiErr;

// ── helpers ─────────────────────────────────────────────────────────────────

function buildUrl(path: string, params?: Record<string, string | undefined>): string {
  const url = `${BASE_URL}${path}`;
  if (!params) return url;

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, v);
  }
  const str = qs.toString();
  return str ? `${url}?${str}` : url;
}

async function request<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { cache: "no-store" as const, ...init });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: body || `Request failed (${res.status})` };
    }

    const data: T = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

// ── public methods ──────────────────────────────────────────────────────────

export function get<T>(path: string, params?: Record<string, string | undefined>) {
  return request<T>(buildUrl(path, params));
}

export function post<T>(path: string, params?: Record<string, string | undefined>) {
  return request<T>(buildUrl(path, params), { method: "POST" });
}

export function put<T>(path: string, params?: Record<string, string | undefined>) {
  return request<T>(buildUrl(path, params), { method: "PUT" });
}

export function del<T>(path: string, params?: Record<string, string | undefined>) {
  return request<T>(buildUrl(path, params), { method: "DELETE" });
}
