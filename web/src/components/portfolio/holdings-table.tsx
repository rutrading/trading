import Link from "next/link";
import { Briefcase } from "@phosphor-icons/react/ssr";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import type { Holding } from "@/app/actions/portfolio";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const HoldingsTable = ({ holdings }: { holdings: Holding[] }) => {
  if (holdings.length === 0) {
    return (
      <div className="rounded-2xl bg-accent p-6">
        <h2 className="mb-4 text-lg font-semibold">Holdings</h2>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Briefcase /></EmptyMedia>
            <EmptyTitle>No holdings</EmptyTitle>
            <EmptyDescription>Place a trade to see your positions here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-lg font-semibold">Holdings</h2>
      <div className="rounded-xl bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Asset Class</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Avg Cost</TableHead>
              <TableHead className="text-right">Total Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holdings.map((h) => {
              const qty = parseFloat(h.quantity);
              const avgCost = parseFloat(h.average_cost);
              const totalCost = qty * avgCost;
              return (
                <TableRow key={h.id}>
                  <TableCell>
                    <Link
                      href={`/stocks/${h.ticker}`}
                      className="font-medium hover:underline"
                    >
                      {h.ticker}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {h.asset_class === "crypto" ? "Crypto" : "US Equity"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{qty}</TableCell>
                  <TableCell className="text-right tabular-nums">${fmt(avgCost)}</TableCell>
                  <TableCell className="text-right tabular-nums">${fmt(totalCost)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
