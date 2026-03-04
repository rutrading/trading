"use client";

import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";

export function DashboardTabs({
  summaryPanel,
  positionsPanel,
  ordersPanel,
  balancesPanel,
}: {
  summaryPanel: React.ReactNode;
  positionsPanel: React.ReactNode;
  ordersPanel: React.ReactNode;
  balancesPanel: React.ReactNode;
}) {
  return (
    <Tabs defaultValue="summary">
      <TabsList variant="underline">
        <TabsTab value="summary">Summary</TabsTab>
        <TabsTab value="positions">Positions</TabsTab>
        <TabsTab value="orders">Activity & Orders</TabsTab>
        <TabsTab value="balances">Balances</TabsTab>
      </TabsList>

      <TabsPanel value="summary">{summaryPanel}</TabsPanel>
      <TabsPanel value="positions">{positionsPanel}</TabsPanel>
      <TabsPanel value="orders">{ordersPanel}</TabsPanel>
      <TabsPanel value="balances">{balancesPanel}</TabsPanel>
    </Tabs>
  );
}
