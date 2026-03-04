import { redirect } from "next/navigation";
import { getSession, getAccounts } from "@/app/actions/auth";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const accounts = await getAccounts();
  if (accounts.length > 0) redirect("/");

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">R U Trading</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Paper trading for Rowan students
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
