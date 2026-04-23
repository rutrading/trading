import type { Metadata } from "next";
import { OrdersTable, type FormattedOrderDates } from "@/components/orders/orders-table";
import { getAccounts } from "@/app/actions/auth";
import { getAllOrders } from "@/app/actions/orders";
import { resolveAccountScope } from "@/lib/accounts";

export const metadata: Metadata = { title: "Orders - R U Trading" };

// Pre-format on the server with a fixed locale + timezone so SSR matches the
// browser's first paint (avoids hydration warnings — same fix as commit 1877847).
const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});
const DATE_TIME_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short",
  hour12: true,
});

type Props = { searchParams: Promise<{ page?: string; account?: string }> };

export default async function OrdersPage({ searchParams }: Props) {
  const { page: pageParam, account: accountParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const accounts = await getAccounts();
  const { scopedId, scopedAccount, activeIds, accountsById } = resolveAccountScope(
    accounts,
    accountParam,
  );

  const { orders, total, perPage } = await getAllOrders(activeIds, page);

  const formattedDates: Record<number, FormattedOrderDates> = {};
  for (const o of orders) {
    formattedDates[o.id] = {
      date: DATE_FMT.format(new Date(o.created_at)),
      createdAt: DATE_TIME_FMT.format(new Date(o.created_at)),
      lastFillAt: o.last_fill_at
        ? DATE_TIME_FMT.format(new Date(o.last_fill_at))
        : null,
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          {scopedAccount
            ? `Orders for ${scopedAccount.name}.`
            : "Your pending, filled, and cancelled orders across all accounts."}
        </p>
      </div>
      <OrdersTable
        orders={orders}
        accountsById={scopedAccount ? undefined : accountsById}
        page={page}
        perPage={perPage}
        total={total}
        scopedAccountId={scopedId ?? undefined}
        formattedDates={formattedDates}
      />
    </div>
  );
}
