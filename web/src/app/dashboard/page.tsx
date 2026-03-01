import { auth } from "@/lib/auth";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Hello {session.user.name}</h1>
      <Link
        href="/Historical_Candlestick"
        className="inline-block rounded bg-black px-4 py-2 text-white"
      >
        Open Historical_Candlestick
      </Link>
    </div>
  );
}
