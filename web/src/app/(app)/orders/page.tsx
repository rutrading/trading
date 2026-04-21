import type { Metadata } from "next";
import { OrdersTable } from "@/components/orders/orders-table";
import { getAccounts } from "@/app/actions/auth";
import { getAllOrders } from "@/app/actions/orders";

export const metadata: Metadata = { title: "Orders - R U Trading" };

type Props = { searchParams: Promise<{ page?: string }> };

export default async function OrdersPage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const accounts = await getAccounts();
  const accountIds = accounts.map((m) => m.tradingAccount.id);
  const accountsById: Record<number, { name: string; type: "investment" | "crypto" }> = {};
  for (const m of accounts) {
    accountsById[m.tradingAccount.id] = {
      name: m.tradingAccount.name,
      type: m.tradingAccount.type,
    };
  }

  const { orders, total, perPage } = await getAllOrders(accountIds, page);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Your pending, filled, and cancelled orders across all accounts.
        </p>
      </div>
      <OrdersTable
        orders={orders}
        accountsById={accountsById}
        page={page}
        perPage={perPage}
        total={total}
      />
    </div>
  );
}
