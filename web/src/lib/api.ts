/**
 * Minimal typed API client for server actions.
 */
import { headers as nextHeaders } from "next/headers";
import { auth } from "@/lib/auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_API_URL ?? "http://localhost:8000/api";

async function authHeader(): Promise<Record<string, string>> {
  try {
    const res = await auth.api.getToken({ headers: await nextHeaders() });
    if (res?.token) return { Authorization: `Bearer ${res.token}` };
  } catch {
    // No session — backend will 401.
  }
  return {};
}

type QueryParams = Record<string, string | undefined>;
type JsonBody = Record<string, unknown>;

type RequestOpts = {
  body?: unknown;
  query?: QueryParams;
};

type RequestArg = QueryParams | RequestOpts | JsonBody | undefined;

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: string };
export type ApiResult<T> = ApiOk<T> | ApiErr;

function buildUrl(path: string, params?: QueryParams): string {
  const url = `${API_BASE_URL}${path}`;
  if (!params) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, value);
  }

  const query = search.toString();
  return query ? `${url}?${query}` : url;
}

function isRequestOpts(x: unknown): x is RequestOpts {
  if (typeof x !== "object" || x === null) return false;
  return "body" in x || "query" in x;
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  arg?: RequestArg,
): Promise<ApiResult<T>> {
  let query: QueryParams | undefined;
  let body: unknown | undefined;

  if (method === "GET" || method === "DELETE") {
    query = isRequestOpts(arg) ? arg.query : (arg as QueryParams | undefined);
  } else if (isRequestOpts(arg)) {
    query = arg.query;
    body = arg.body;
  } else {
    body = arg as JsonBody | undefined;
  }

  try {
    const headers: Record<string, string> = { ...(await authHeader()) };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(buildUrl(path, query), {
      method,
      cache: "no-store",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let detail = text;
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed.detail === "string") {
          detail = parsed.detail;
        } else if (parsed && Array.isArray(parsed.detail)) {
          // Pydantic validation errors arrive as [{loc, msg, ...}, ...].
          // Stitch the messages together so the user sees something readable
          // instead of raw JSON.
          detail = parsed.detail
            .map((d: { msg?: string }) => d?.msg)
            .filter(Boolean)
            .join("; ");
        } else if (parsed && typeof parsed.message === "string") {
          detail = parsed.message;
        } else if (parsed && typeof parsed.error === "string") {
          detail = parsed.error;
        }
      } catch {
        // text was not JSON — keep raw
      }
      return { ok: false, error: detail || `Request failed (${res.status})` };
    }

    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export function get<T>(path: string, params?: QueryParams) {
  return request<T>("GET", path, params);
}

export function post<T>(path: string, paramsOrBody?: RequestArg) {
  return request<T>("POST", path, paramsOrBody);
}

export function postJson<T>(path: string, body: JsonBody, params?: QueryParams) {
  return request<T>("POST", path, { query: params, body });
}

export function put<T>(path: string, paramsOrBody?: RequestArg) {
  return request<T>("PUT", path, paramsOrBody);
}

export function patchJson<T>(path: string, body: JsonBody, params?: QueryParams) {
  return request<T>("PATCH", path, { query: params, body });
}

export function del<T>(path: string, params?: QueryParams) {
  return request<T>("DELETE", path, params);
}
