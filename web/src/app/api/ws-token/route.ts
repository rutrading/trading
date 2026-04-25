import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ token: null }, { status: 401 });
  }

  try {
    const res = await auth.api.getToken({ headers: await headers() });
    return NextResponse.json({ token: res?.token ?? null });
  } catch {
    return NextResponse.json({ token: null }, { status: 500 });
  }
}
