import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

const API_BASE_URL =
  process.env.INTERNAL_BACKEND_API_URL ??
  process.env.NEXT_PUBLIC_BACKEND_API_URL ??
  "http://localhost:8000/api";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticker = url.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ ok: false, error: "ticker required" }, { status: 400 });
  }

  // Require an authenticated session up-front instead of bouncing the call
  // through to the backend. Aligns with /api/ws-token and prevents this
  // route from being used as a generic anonymous bouncer (and from leaking
  // backend error detail strings to anonymous callers).
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  let tokenHeader: Record<string, string> = {};
  try {
    const res = await auth.api.getToken({ headers: reqHeaders });
    if (res?.token) tokenHeader = { Authorization: `Bearer ${res.token}` };
  } catch {
    // let backend reject
  }

  const backendUrl = `${API_BASE_URL}/quote?ticker=${encodeURIComponent(ticker)}`;
  try {
    const res = await fetch(backendUrl, {
      cache: "no-store",
      headers: tokenHeader,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let detail = text;
      try {
        const parsed = JSON.parse(text);
        if (parsed?.detail) detail = parsed.detail;
      } catch {
        // plain text
      }
      return NextResponse.json(
        { ok: false, error: detail || `HTTP ${res.status}` },
        { status: res.status },
      );
    }
    const data = await res.json();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Network error" },
      { status: 503 },
    );
  }
}
