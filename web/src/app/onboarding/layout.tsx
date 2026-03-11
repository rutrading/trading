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
    <div className="flex min-h-svh flex-col">
      {children}
    </div>
  );
}
