"use client";

import Link from "next/link";
import {
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

type Holding = {
  ticker: string;
  qty: number;
  avgCost: number;
};

type Account = {
  id: number;
  name: string;
  type: "investment" | "crypto";
  balance: number;
  isJoint: boolean;
  holdings: Holding[];
};

const ACCOUNTS: Account[] = [
  {
    id: 1, name: "Main Portfolio", type: "investment", balance: 100000, isJoint: false,
    holdings: [
      { ticker: "AAPL", qty: 50, avgCost: 145.0 },
      { ticker: "MSFT", qty: 30, avgCost: 280.0 },
      { ticker: "GOOGL", qty: 20, avgCost: 120.0 },
    ],
  },
  {
    id: 2, name: "Crypto Trading", type: "crypto", balance: 25000, isJoint: false,
    holdings: [
      { ticker: "BTC", qty: 0.5, avgCost: 42000 },
      { ticker: "ETH", qty: 8, avgCost: 2800 },
    ],
  },
  {
    id: 3, name: "Joint Investment", type: "investment", balance: 50000, isJoint: true,
    holdings: [],
  },
];

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function AccountCard({ acct }: { acct: Account }) {
  return (
    <div className="rounded-2xl bg-accent p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="font-semibold">{acct.name}</p>
          <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
            {acct.type}
          </span>
          {acct.isJoint && (
            <span className="rounded bg-info/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-info-foreground">
              Joint
            </span>
          )}
        </div>
        <p className="text-2xl font-bold tabular-nums">${fmt(acct.balance)}</p>
      </div>

      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm">
          <PencilSimple size={14} />
          Edit
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive">
          <Trash size={14} />
          Delete
        </Button>
      </div>

      {acct.holdings.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {acct.holdings.map((h) => (
            <Link
              key={h.ticker}
              href={`/stocks/${h.ticker}`}
              className="rounded-xl bg-card p-4 transition-colors hover:bg-card/80"
            >
              <p className="text-sm font-semibold">{h.ticker}</p>
              <p className="mt-1 text-lg font-bold tabular-nums">${fmt(h.qty * h.avgCost)}</p>
              <p className="text-xs text-muted-foreground">{h.qty} @ ${fmt(h.avgCost)}</p>
            </Link>
          ))}
        </div>
      )}

      {acct.holdings.length === 0 && (
        <p className="mt-4 text-center text-xs text-muted-foreground">No holdings yet</p>
      )}
    </div>
  );
}

export default function TestPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accounts (Test)</h1>
        <p className="text-sm text-muted-foreground">Account management demo.</p>
      </div>

      <div className="space-y-3">
        {ACCOUNTS.map((a) => <AccountCard key={a.id} acct={a} />)}
      </div>
    </div>
  );
}
