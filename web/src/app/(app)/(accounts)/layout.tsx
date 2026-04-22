import { cookies } from "next/headers";

import { getAccounts } from "@/app/actions/auth";
import {
  SIDEBAR_COLLAPSED_COOKIE,
  SidebarShell,
} from "@/components/account-sidebar/sidebar-shell";

// Format with formatToParts so the output is independent of ICU's locale
// connectors (Node emits "Apr 21, 2026, 12:59 AM" while browsers emit
// "Apr 21, 2026 at 12:59 AM" from the same options).
function formatAsOf(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
    hour12: true,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return (
    `${get("month")} ${get("day")}, ${get("year")}, ` +
    `${get("hour")}:${get("minute")} ${get("dayPeriod")} ${get("timeZoneName")}`
  );
}

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

  // Read the sidebar preference from a cookie so the server-rendered HTML
  // matches the user's choice. Without this, the client flips the sidebar
  // closed after mount, producing a one-frame flash.
  const cookieStore = await cookies();
  const initialCollapsed =
    cookieStore.get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1";

  return (
    <SidebarShell
      accounts={accounts}
      asOf={formatAsOf(new Date())}
      initialCollapsed={initialCollapsed}
    >
      {children}
    </SidebarShell>
  );
}
