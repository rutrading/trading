import type { Metadata } from "next";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Portfolio - R U Trading" };

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

      <div className="rounded-2xl bg-accent p-6">
        <h2 className="mb-4 text-lg font-semibold">Holdings</h2>
        <div className="rounded-xl bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Avg Cost</TableHead>
                <TableHead className="text-right">Current Price</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
                <TableHead className="text-right">Gain/Loss</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {HOLDINGS.map((h) => {
                const value = h.qty * h.current;
                const cost = h.qty * h.avgCost;
                const gain = value - cost;
                const gainPct = (gain / cost) * 100;
                return (
                  <TableRow key={h.ticker} className="cursor-pointer">
                    <TableCell>
                      <Link
                        href={`/test/stocks/${h.ticker}`}
                        className="font-medium hover:underline"
                      >
                        {h.ticker}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{h.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.qty}</TableCell>
                    <TableCell className="text-right tabular-nums">${fmt(h.avgCost)}</TableCell>
                    <TableCell className="text-right tabular-nums">${fmt(h.current)}</TableCell>
                    <TableCell className="text-right tabular-nums">${fmt(value)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Badge variant={gain >= 0 ? "success" : "error"} size="sm">
                        {gain >= 0 ? "+" : ""}{gainPct.toFixed(2)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-2xl bg-accent p-6">
        <h2 className="mb-4 text-lg font-semibold">Transaction History</h2>
        <div className="rounded-xl bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TRANSACTIONS.map((t, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground">{t.date}</TableCell>
                  <TableCell>
                    <Badge
                      variant={t.action === "BUY" ? "success" : "error"}
                      size="sm"
                    >
                      {t.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{t.ticker}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.qty}</TableCell>
                  <TableCell className="text-right tabular-nums">${fmt(t.price)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    ${fmt(t.qty * t.price)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
