"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowCounterClockwise } from "@phosphor-icons/react";

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
import { resetAccountBalance } from "@/app/actions/auth";
import { toast } from "@/lib/toasts";
import {
  EXPERIENCE_OPTIONS,
  getExperienceOption,
  type Experience,
} from "@/lib/experience";

const snappyEase = [0.22, 1, 0.36, 1] as const;

type Props = {
  accountId: number;
  accountName: string;
  currentLevel: Experience;
};

export const ResetBalance = ({ accountId, accountName, currentLevel }: Props) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
        `${accountName} restored to ${getExperienceOption(selectedLevel).balance}.`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setSelectedLevel(currentLevel);
          setOpen(true);
        }}
      >
        <ArrowCounterClockwise size={14} />
        Reset balance
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
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
                const isCurrent = currentLevel === opt.value;
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
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{opt.label}</p>
                          {isCurrent && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                              Current
                            </span>
                          )}
                        </div>
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
              onClick={() => setOpen(false)}
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
    </>
  );
};
