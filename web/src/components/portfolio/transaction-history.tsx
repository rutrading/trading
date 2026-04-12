import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Transaction = {
  date: string;
  action: string;
  ticker: string;
  qty: number;
  price: number;
};

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const TransactionHistory = ({ transactions }: { transactions: Transaction[] }) => {
  return (
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
            {transactions.map((t, i) => (
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
  );
};
