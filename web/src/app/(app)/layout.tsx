import { redirect } from "next/navigation";
import { getSession, getAccounts } from "@/app/actions/auth";
import { AppShell } from "@/components/sidebar/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const accounts = await getAccounts();
  if (accounts.length === 0) redirect("/onboarding");
  const hasKalshiAccount = accounts.some(
    (m) => m.tradingAccount.type === "kalshi",
  );

  return (
    <AppShell
      accounts={accounts}
      hasKalshiAccount={hasKalshiAccount}
      userName={session.user.name}
      userImage={session.user.image}
    >
      {children}
    </AppShell>
  );
}
