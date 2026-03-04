"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAccount } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, Radio } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "@/components/ui/dialog";

type Experience = "beginner" | "intermediate" | "expert";
type AccountType = "investment" | "crypto";

const EXPERIENCE_OPTIONS = [
  { value: "beginner", label: "Beginner", balance: "$10,000" },
  { value: "intermediate", label: "Intermediate", balance: "$50,000" },
  { value: "expert", label: "Expert", balance: "$100,000" },
] as const;

export function CreateAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [experience, setExperience] = useState<Experience>("beginner");
  const [accountType, setAccountType] = useState<AccountType>("investment");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() {
    setStep(1);
    setExperience("beginner");
    setAccountType("investment");
    setError("");
    setLoading(false);
  }

  async function handleCreate() {
    setError("");
    setLoading(true);

    const typeLabel = accountType === "investment" ? "Investment" : "Crypto";
    const name = `My ${typeLabel} Account`;

    const result = await createAccount(name, accountType, experience);

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    reset();
    onOpenChange(false);
    router.refresh();
  }

  function handleOpenChange(value: boolean) {
    if (!value) reset();
    onOpenChange(value);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Experience level" : "Account type"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Choose your experience level to set your starting balance."
              : "What would you like to trade?"}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {step === 1 && (
            <RadioGroup
              value={experience}
              onValueChange={(val) => setExperience(val as Experience)}
              className="gap-3"
            >
              {EXPERIENCE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-4 transition-colors has-[data-checked]:border-primary has-[data-checked]:bg-primary/5"
                >
                  <Radio value={opt.value} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Starting balance: {opt.balance}
                    </p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <RadioGroup
                value={accountType}
                onValueChange={(val) => setAccountType(val as AccountType)}
                className="gap-3"
              >
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-4 transition-colors has-[data-checked]:border-primary has-[data-checked]:bg-primary/5">
                  <Radio value="investment" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Investment</p>
                    <p className="text-xs text-muted-foreground">
                      Trade stocks and ETFs
                    </p>
                  </div>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-4 transition-colors has-[data-checked]:border-primary has-[data-checked]:bg-primary/5">
                  <Radio value="crypto" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Crypto</p>
                    <p className="text-xs text-muted-foreground">
                      Trade cryptocurrency pairs
                    </p>
                  </div>
                </label>
              </RadioGroup>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}
        </DialogPanel>
        <DialogFooter variant="bare">
          {step === 1 ? (
            <Button onClick={() => setStep(2)}>Continue</Button>
          ) : (
            <div className="flex w-full gap-3 sm:w-auto">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                disabled={loading}
              >
                Back
              </Button>
              <Button onClick={handleCreate} disabled={loading}>
                {loading ? "Creating..." : "Create account"}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
