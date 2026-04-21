import { getAccounts } from "@/app/actions/auth";
import { AccountSidebar } from "@/components/account-sidebar/account-sidebar";

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
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <AccountSidebar accounts={accounts} asOf={new Date()} />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
