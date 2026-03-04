import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/app/actions/auth";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Real server-side session validation — if the user is actually
  // logged in (not just a stale cookie), send them to the dashboard.
  const session = await getSession();
  if (session) redirect("/");

  return (
    <div className="flex min-h-svh flex-col">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          R U Trading
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-4">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
