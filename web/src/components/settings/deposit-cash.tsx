"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { depositCash } from "@/app/actions/auth";
import { fmtUsd } from "@/lib/format";
import { toast } from "@/lib/toasts";

type Props = {
  accountId: number;
  accountName: string;
};

const MIN_DEPOSIT = 10;

export const DepositCash = ({ accountId, accountName }: Props) => {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [pending, startTransition] = useTransition();

  const parsed = Number(amount);
  const canSubmit = Number.isFinite(parsed) && parsed > MIN_DEPOSIT;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    startTransition(async () => {
      const result = await depositCash(accountId, amount);
      if (!result.success) {
        toast.error("Deposit failed", result.error);
        return;
      }
      toast.success("Deposit complete", `${fmtUsd(parsed)} added to ${accountName}.`);
      setAmount("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        type="number"
        inputMode="decimal"
        step="0.01"
        min={MIN_DEPOSIT + 0.01}
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={pending}
        className="h-8 w-40"
      />
      <Button type="submit" variant="outline" size="sm" disabled={!canSubmit || pending}>
        <Plus size={14} />
        {pending ? "Depositing..." : "Deposit"}
      </Button>
    </form>
  );
};
