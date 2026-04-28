import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_API_URL ?? "http://localhost:8000/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = await auth.api.getToken({ headers: await headers() });
  if (!token?.token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const tradingAccountId = url.searchParams.get("trading_account_id");
  if (!tradingAccountId) {
    return NextResponse.json({ error: "trading_account_id is required" }, { status: 400 });
  }

  const upstream = await fetch(
    `${API_BASE_URL}/strategy-stream?trading_account_id=${encodeURIComponent(tradingAccountId)}`,
    {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token.token}`,
        Accept: "text/event-stream",
      },
    },
  );

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "Stream failed");
    return NextResponse.json({ error: detail || "Stream failed" }, { status: upstream.status || 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
