"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { resetAccountBalance, deleteAccount } from "@/app/actions/auth";
import { toast } from "@/lib/toasts";

type Experience = "beginner" | "intermediate" | "advanced" | "expert";

const EXPERIENCE_OPTIONS: {
  value: Experience;
  label: string;
  balance: string;
  description: string;
}[] = [
  {
    value: "beginner",
    label: "Beginner",
    balance: "$100,000",
    description: "Start with more capital to learn without pressure.",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    balance: "$50,000",
    description: "A balanced starting point to build your strategy.",
  },
  {
    value: "advanced",
    label: "Advanced",
    balance: "$25,000",
    description: "Less room for error, more room to grow.",
  },
  {
    value: "expert",
    label: "Expert",
    balance: "$10,000",
    description: "Prove your skill with limited capital.",
  },
];

const snappyEase = [0.22, 1, 0.36, 1] as const;

type Props = {
  accountId: number;
  accountName: string;
  currentLevel: Experience;
};

export const AccountActions = ({
  accountId,
  accountName,
  currentLevel,
}: Props) => {
  const router = useRouter();
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<Experience>(currentLevel);
  const [pending, startTransition] = useTransition();

  function handleReset() {
    startTransition(async () => {
      const result = await resetAccountBalance(accountId, selectedLevel);
      if (!result.success) {
        toast.error("Reset failed", result.error);
        return;
      }
      toast.success(
        "Balance reset",
        `${accountName} restored to ${EXPERIENCE_OPTIONS.find((o) => o.value === selectedLevel)?.balance}.`,
      );
      setResetOpen(false);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAccount(accountId);
      if (!result.success) {
        toast.error("Delete failed", result.error);
        return;
      }
      toast.success("Account deleted", accountName);
      setDeleteOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSelectedLevel(currentLevel);
            setResetOpen(true);
          }}
        >
          Reset balance
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setDeleteOpen(true)}
        >
          Delete
        </Button>
      </div>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset balance</AlertDialogTitle>
            <AlertDialogDescription>
              Choose an experience level to restore {accountName}&apos;s virtual
              cash. This resets positions and orders.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 px-6 pb-4">
            <Label className="text-sm font-medium">Experience level</Label>
            <div className="space-y-3">
              {EXPERIENCE_OPTIONS.map((opt) => {
                const selected = selectedLevel === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedLevel(opt.value)}
                    className="relative flex w-full cursor-pointer flex-col rounded-lg border border-border px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/50"
                  >
                    {selected && (
                      <motion.div
                        layoutId="reset-level-accent"
                        className="absolute inset-y-0 left-0 w-1 rounded-l-lg bg-primary"
                        transition={{ duration: 0.2, ease: snappyEase }}
                      />
                    )}
                    <div className="flex w-full items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{opt.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {opt.description}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-emerald-600">
                        {opt.balance}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={handleReset} disabled={pending}>
              {pending ? "Resetting..." : "Reset balance"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete {accountName}. All positions, orders, and
              history will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending ? "Deleting..." : "Delete account"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
