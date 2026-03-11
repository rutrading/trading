import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/app/actions/auth";
import { TestClient } from "./client";

export const metadata: Metadata = {
  title: "WebSocket Test - R U Trading",
};

export default async function TestPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  // dev-only page
  if (process.env.NODE_ENV !== "development") redirect("/");

  return <TestClient />;
}
