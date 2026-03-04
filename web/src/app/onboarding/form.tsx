"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAccount } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, Radio } from "@/components/ui/radio-group";

type Experience = "beginner" | "intermediate" | "expert";
type AccountType = "investment" | "crypto";
type Ownership = "solo" | "joint";
type Step = "experience" | "type" | "ownership" | "confirm";

const EXPERIENCE_OPTIONS = [
  { value: "beginner", label: "Beginner", balance: "$10,000" },
  { value: "intermediate", label: "Intermediate", balance: "$50,000" },
  { value: "expert", label: "Expert", balance: "$100,000" },
] as const;

const TYPE_OPTIONS = [
  { value: "investment", label: "Investment", description: "Trade stocks and ETFs" },
  { value: "crypto", label: "Crypto", description: "Trade cryptocurrency pairs" },
] as const;

export function OnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("experience");
  const [experience, setExperience] = useState<Experience>("beginner");
  const [accountType, setAccountType] = useState<AccountType>("investment");
  const [ownership, setOwnership] = useState<Ownership>("solo");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function accountName() {
    const typeLabel = accountType === "investment" ? "Investment" : "Crypto";
    return ownership === "joint"
      ? `Joint ${typeLabel} Account`
      : `My ${typeLabel} Account`;
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);

    const result = await createAccount(
      accountName(),
      accountType,
      experience,
      ownership === "joint" ? partnerEmail : undefined,
    );

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    router.push("/");
  }

  return (
    <div className="space-y-6">
      {step === "experience" && (
        <div className="space-y-4">
          <Label className="text-sm font-medium">Experience level</Label>
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
          <Button className="w-full" onClick={() => setStep("type")}>
            Continue
          </Button>
        </div>
      )}

      {step === "type" && (
        <div className="space-y-4">
          <Label className="text-sm font-medium">Account type</Label>
          <RadioGroup
            value={accountType}
            onValueChange={(val) => setAccountType(val as AccountType)}
            className="gap-3"
          >
            {TYPE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-4 transition-colors has-[data-checked]:border-primary has-[data-checked]:bg-primary/5"
              >
                <Radio value={opt.value} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {opt.description}
                  </p>
                </div>
              </label>
            ))}
          </RadioGroup>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep("experience")}
            >
              Back
            </Button>
            <Button className="flex-1" onClick={() => setStep("ownership")}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === "ownership" && (
        <div className="space-y-4">
          <Label className="text-sm font-medium">Account ownership</Label>
          <RadioGroup
            value={ownership}
            onValueChange={(val) => setOwnership(val as Ownership)}
            className="gap-3"
          >
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-4 transition-colors has-[data-checked]:border-primary has-[data-checked]:bg-primary/5">
              <Radio value="solo" />
              <div className="flex-1">
                <p className="text-sm font-medium">Solo</p>
                <p className="text-xs text-muted-foreground">
                  Just you trading on this account
                </p>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-4 transition-colors has-[data-checked]:border-primary has-[data-checked]:bg-primary/5">
              <Radio value="joint" />
              <div className="flex-1">
                <p className="text-sm font-medium">Joint</p>
                <p className="text-xs text-muted-foreground">
                  Share this account with a partner
                </p>
              </div>
            </label>
          </RadioGroup>
          {ownership === "joint" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="partner-email">Partner&apos;s email</Label>
              <Input
                id="partner-email"
                type="email"
                placeholder="partner@students.rowan.edu"
                value={partnerEmail}
                onChange={(e) => setPartnerEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Your partner must already have an account.
              </p>
            </div>
          )}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep("type")}
            >
              Back
            </Button>
            <Button
              className="flex-1"
              onClick={() => setStep("confirm")}
              disabled={ownership === "joint" && !partnerEmail}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-4 space-y-3">
            <h3 className="text-sm font-medium">Review your account</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account name</span>
                <span className="font-medium">{accountName()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium capitalize">{accountType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Starting balance</span>
                <span className="font-medium">
                  {EXPERIENCE_OPTIONS.find((o) => o.value === experience)?.balance}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ownership</span>
                <span className="font-medium capitalize">{ownership}</span>
              </div>
              {ownership === "joint" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Partner</span>
                  <span className="font-medium">{partnerEmail}</span>
                </div>
              )}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep("ownership")}
              disabled={loading}
            >
              Back
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Creating..." : "Create account"}
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-center gap-2">
        {(["experience", "type", "ownership", "confirm"] as Step[]).map(
          (s, i) => (
            <div
              key={s}
              className={`h-1.5 w-8 rounded-full transition-colors ${
                i <=
                ["experience", "type", "ownership", "confirm"].indexOf(step)
                  ? "bg-primary"
                  : "bg-muted"
              }`}
            />
          ),
        )}
      </div>
    </div>
  );
}
