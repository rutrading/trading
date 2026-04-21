import { getAccounts } from "@/app/actions/auth";
import { SidebarShell } from "@/components/account-sidebar/sidebar-shell";

export default async function AccountsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const members = await getAccounts();
  const accounts = members.map((m) => ({
    id: m.tradingAccount.id,
    name: m.tradingAccount.name,
    type: m.tradingAccount.type,
    balance: m.tradingAccount.balance,
    isJoint: m.tradingAccount.isJoint,
  }));

  return (
    <SidebarShell accounts={accounts} asOf={new Date()}>
      {children}
    </SidebarShell>
  );
}
