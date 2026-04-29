import { redirect } from "next/navigation";
import { getSession, getAccounts } from "@/app/actions/auth";
import { AppShell } from "@/components/sidebar/app-shell";
import { isKalshiEnabled } from "@/lib/kalshi-enabled";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const accounts = await getAccounts();
  if (accounts.length === 0) redirect("/onboarding");
  const showKalshiNav =
    isKalshiEnabled() &&
    accounts.some((m) => m.tradingAccount.type === "kalshi");

  return (
    <AppShell
      accounts={accounts}
      hasKalshiAccount={showKalshiNav}
      userName={session.user.name}
      userImage={session.user.image}
    >
      {children}
    </AppShell>
  );
}
