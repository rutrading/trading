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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          WebSocket Test
        </h1>
        <p className="text-sm text-muted-foreground">
          Dev-only page for testing live quote subscriptions.
        </p>
      </div>
      <TestClient />
    </div>
  );
}
