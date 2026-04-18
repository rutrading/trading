import type { Metadata } from "next";
import { OrdersTable } from "@/components/orders/orders-table";
import { getAccounts } from "@/app/actions/auth";
import { getOrders } from "@/app/actions/orders";

export const metadata: Metadata = { title: "Orders - R U Trading" };

type Props = { searchParams: Promise<{ page?: string }> };

export default async function OrdersPage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const accounts = await getAccounts();
  const accountId = accounts[0]?.tradingAccount.id;

  const res = accountId ? await getOrders(accountId, { page }) : null;
  const orders = res?.ok ? res.data.orders : [];
  const total = res?.ok ? res.data.total : 0;
  const perPage = res?.ok ? res.data.per_page : 25;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Your pending, filled, and cancelled orders.
        </p>
      </div>
      <OrdersTable
        orders={orders}
        page={page}
        perPage={perPage}
        total={total}
      />
    </div>
  );
}
