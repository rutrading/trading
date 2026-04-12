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

type Holding = {
  ticker: string;
  name: string;
  qty: number;
  avgCost: number;
  current: number;
};

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const HoldingsTable = ({ holdings }: { holdings: Holding[] }) => {
  return (
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
            {holdings.map((h) => {
              const value = h.qty * h.current;
              const cost = h.qty * h.avgCost;
              const gain = value - cost;
              const gainPct = (gain / cost) * 100;
              return (
                <TableRow key={h.ticker} className="cursor-pointer">
                  <TableCell>
                    <Link
                      href={`/stocks/${h.ticker}`}
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
  );
};
