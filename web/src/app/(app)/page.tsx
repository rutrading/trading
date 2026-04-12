import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUp, ArrowDown, CaretRight } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { ChartSection } from "@/components/dashboard/chart-section";
import { HoldingsList } from "@/components/dashboard/holdings-list";

export const metadata: Metadata = { title: "Dashboard - R U Trading" };

const HOLDINGS = [
  { ticker: "AAPL", name: "Apple Inc.", qty: 50, avgCost: 145.0, current: 178.5, change: 23.1 },
  { ticker: "MSFT", name: "Microsoft", qty: 30, avgCost: 280.0, current: 415.2, change: 48.3 },
  { ticker: "GOOGL", name: "Alphabet", qty: 20, avgCost: 120.0, current: 155.8, change: 29.8 },
  { ticker: "TSLA", name: "Tesla", qty: 15, avgCost: 220.0, current: 195.4, change: -11.2 },
];

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DashboardPage() {
  const totalValue = HOLDINGS.reduce((s, h) => s + h.qty * h.current, 0);
  const totalCost = HOLDINGS.reduce((s, h) => s + h.qty * h.avgCost, 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = (totalGain / totalCost) * 100;
  const cashBalance = 50000;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-baseline gap-4">
          <h1 className="text-5xl font-bold tabular-nums tracking-tight">
            ${fmt(totalValue + cashBalance)}
          </h1>
          <span
            className={`flex items-center gap-1 text-2xl font-semibold tabular-nums ${
              totalGain >= 0 ? "text-emerald-500" : "text-red-500"
            }`}
          >
            {totalGain >= 0 ? (
              <ArrowUp size={20} weight="bold" />
            ) : (
              <ArrowDown size={20} weight="bold" />
            )}
            {Math.abs(totalGainPct).toFixed(2)}%
          </span>
          <p className="text-sm text-muted-foreground">Total Value</p>
        </div>

        <div className="flex items-end justify-between gap-8">
          <div className="flex gap-8">
            <div>
              <p className="text-2xl font-semibold tabular-nums">{HOLDINGS.length}</p>
              <p className="text-xs text-muted-foreground">Holdings</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums">${fmt(cashBalance)}</p>
              <p className="text-xs text-muted-foreground">Cash Balance</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums">
                {totalGain >= 0 ? "+" : "-"}${fmt(Math.abs(totalGain))}
              </p>
              <p className="text-xs text-muted-foreground">Total Gain/Loss</p>
            </div>
          </div>
          <ChartSection />
        </div>
      </div>

      <div className="rounded-2xl bg-accent p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Holdings</h2>
          <Link href="/portfolio">
            <Button variant="ghost" size="sm">
              See All <CaretRight size={14} />
            </Button>
          </Link>
        </div>
        <HoldingsList holdings={HOLDINGS} />
      </div>
    </div>
  );
}
