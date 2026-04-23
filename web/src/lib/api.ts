/**
 * Minimal typed API client for server actions.
 */
const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_API_URL ?? "http://localhost:8000/api";

type QueryParams = Record<string, string | undefined>;
type JsonBody = Record<string, unknown>;

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

async function request<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  params?: QueryParams,
  body?: JsonBody,
): Promise<ApiResult<T>> {
  try {
    const headers: HeadersInit = {};
    const requestInit: RequestInit = {
      method,
      cache: "no-store",
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestInit.body = JSON.stringify(body);
    }

    if (Object.keys(headers).length > 0) {
      requestInit.headers = headers;
    }

    const res = await fetch(buildUrl(path, params), {
      ...requestInit,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (!text) return { ok: false, error: `Request failed (${res.status})` };

      try {
        const payload = JSON.parse(text) as { detail?: string; message?: string; error?: string };
        return {
          ok: false,
          error: payload.detail || payload.message || payload.error || text,
        };
      } catch {
        return { ok: false, error: text };
      }
    }

    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

/**
 * Example:
 * type BarsResponse = {
 *   ticker: string; timeframe: string; source: string;
 *   bars: Array<{ time: number; open: number; high: number; low: number; close: number }>;
 * }
 * const res = await get<BarsResponse>("/historical-bars", {
 *   ticker: "AAPL",
 *   timeframe: "1Day",
 *   start: "2025-01-01T00:00:00Z",
 * })
 * if (res.ok) console.log(res.data.ticker, res.data.bars.length)
 */
export function get<T>(path: string, params?: QueryParams) {
  return request<T>("GET", path, params);
}

/**
 * Example:
 * type AddWatchlistResponse = { ticker: string; added: boolean }
 * const res = await post<AddWatchlistResponse>("/watchlist", {
 *   ticker: "AAPL",
 * })
 * if (res.ok) console.log(res.data.ticker, res.data.added)
 */
export function post<T>(path: string, params?: QueryParams) {
  return request<T>("POST", path, params);
}

export function postJson<T>(path: string, body: JsonBody, params?: QueryParams) {
  return request<T>("POST", path, params, body);
}

/**
 * Example:
 * type SymbolResponse = {
 *   ticker: string; name: string; exchange: string | null;
 *   asset_class: "us_equity" | "crypto";
 * }
 * const res = await put<SymbolResponse>("/symbols/AAPL")
 * if (res.ok) console.log(res.data.name)
 */
export function put<T>(path: string, params?: QueryParams) {
  return request<T>("PUT", path, params);
}

export function patchJson<T>(path: string, body: JsonBody, params?: QueryParams) {
  return request<T>("PATCH", path, params, body);
}

/**
 * Example:
 * type RemoveWatchlistResponse = { ticker: string; removed: boolean }
 * const res = await del<RemoveWatchlistResponse>("/watchlist/AAPL")
 * if (res.ok) console.log(res.data.ticker, res.data.removed)
 */
export function del<T>(path: string, params?: QueryParams) {
  return request<T>("DELETE", path, params);
}
