import type { Metadata } from "next";
import { HoldingsTable } from "@/components/portfolio/holdings-table";
import { TransactionHistory } from "@/components/portfolio/transaction-history";

export const metadata: Metadata = { title: "Portfolio - R U Trading" };

const HOLDINGS = [
  { ticker: "AAPL", name: "Apple Inc.", qty: 50, avgCost: 145.0, current: 178.5 },
  { ticker: "MSFT", name: "Microsoft", qty: 30, avgCost: 280.0, current: 415.2 },
  { ticker: "GOOGL", name: "Alphabet", qty: 20, avgCost: 120.0, current: 155.8 },
  { ticker: "TSLA", name: "Tesla", qty: 15, avgCost: 220.0, current: 195.4 },
  { ticker: "AMZN", name: "Amazon", qty: 25, avgCost: 130.0, current: 185.6 },
  { ticker: "NVDA", name: "NVIDIA", qty: 10, avgCost: 450.0, current: 880.3 },
];

const TRANSACTIONS = [
  { date: "2026-04-05", action: "BUY", ticker: "NVDA", qty: 10, price: 450.0 },
  { date: "2026-04-03", action: "SELL", ticker: "META", qty: 20, price: 520.8 },
  { date: "2026-04-01", action: "BUY", ticker: "AAPL", qty: 25, price: 145.0 },
  { date: "2026-03-28", action: "BUY", ticker: "MSFT", qty: 30, price: 280.0 },
  { date: "2026-03-25", action: "BUY", ticker: "GOOGL", qty: 20, price: 120.0 },
  { date: "2026-03-20", action: "BUY", ticker: "TSLA", qty: 15, price: 220.0 },
  { date: "2026-03-18", action: "BUY", ticker: "AMZN", qty: 25, price: 130.0 },
  { date: "2026-03-15", action: "BUY", ticker: "AAPL", qty: 25, price: 145.0 },
];

export default function PortfolioPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
        <p className="text-sm text-muted-foreground">
          Your current holdings and transaction history.
        </p>
      </div>
      <HoldingsTable holdings={HOLDINGS} />
      <TransactionHistory transactions={TRANSACTIONS} />
    </div>
  );
}
