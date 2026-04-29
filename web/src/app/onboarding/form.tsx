"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, LayoutGroup } from "motion/react";
import {
  ArrowLeftIcon,
  GraduationCapIcon,
  CurrencyCircleDollarIcon,
  HandshakeIcon,
  CheckCircleIcon,
  TagIcon,
  WalletIcon,
  CoinsIcon,
  UsersThreeIcon,
  EnvelopeSimpleIcon,
  Robot,
} from "@phosphor-icons/react";

import { createAccount, createKalshiAccount } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stepper, type Step } from "@/components/ui/stepper";
import { toast } from "@/lib/toasts";
import {
  EXPERIENCE_OPTIONS,
  getExperienceOption,
  type Experience,
} from "@/lib/experience";
import type { BrokerageAccountType } from "@/lib/accounts";

type OnboardingAccountType = BrokerageAccountType;
type Ownership = "solo" | "joint";

const STEPS: Step[] = [
  { label: "Experience", icon: <GraduationCapIcon weight="duotone" /> },
  { label: "Account", icon: <CurrencyCircleDollarIcon weight="duotone" /> },
  { label: "Ownership", icon: <HandshakeIcon weight="duotone" /> },
  { label: "Confirm", icon: <CheckCircleIcon weight="duotone" /> },
];

const STEP_KEYS = ["experience", "type", "ownership", "confirm"] as const;

const TYPE_OPTIONS = [
  {
    value: "investment" as const,
    label: "Investment",
    description: "Trade stocks and ETFs on major US exchanges.",
  },
  {
    value: "crypto" as const,
    label: "Crypto",
    description: "Trade pairs like BTC/USD around the clock.",
  },
];

const OWNERSHIP_OPTIONS = [
  {
    value: "solo" as const,
    label: "Solo",
    description: "A personal account managed only by you.",
  },
  {
    value: "joint" as const,
    label: "Joint",
    description: "Share this account with a partner.",
  },
];

// custom ease-out with more energy than the CSS built-in
const snappyEase = [0.22, 1, 0.36, 1] as const;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 40 : -40,
    opacity: 0,
    filter: "blur(4px)",
  }),
  center: {
    x: 0,
    opacity: 1,
    filter: "blur(0px)",
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -40 : 40,
    opacity: 0,
    filter: "blur(4px)",
  }),
};

interface OptionCardProps<T extends string> {
  groupId: string;
  value: T;
  selected: boolean;
  label: string;
  description: string;
  detail?: string;
  onSelect: (value: T) => void;
}

function OptionCard<T extends string>({
  groupId,
  value,
  selected,
  label,
  description,
  detail,
  onSelect,
}: OptionCardProps<T>) {
  return (
    <button
      className="relative flex w-full cursor-pointer flex-col rounded-lg border border-border px-4 py-4 text-left transition-colors duration-150 hover:bg-muted/50"
      onClick={() => onSelect(value)}
      type="button"
    >
      {/* accent bar slides between cards via shared layoutId per group */}
      {selected && (
        <motion.div
          className="absolute inset-y-0 left-0 w-1 rounded-l-lg bg-primary"
          layoutId={`accent-${groupId}`}
          transition={{ duration: 0.2, ease: snappyEase }}
        />
      )}
      <div className="flex w-full items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        {detail && (
          <span className="shrink-0 text-sm font-semibold text-emerald-600">
            {detail}
          </span>
        )}
      </div>
    </button>
  );
}

export function OnboardingForm({ kalshiEnabled }: { kalshiEnabled: boolean }) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [experience, setExperience] = useState<Experience>("beginner");
  const [accountType, setAccountType] = useState<OnboardingAccountType>("investment");
  const [ownership, setOwnership] = useState<Ownership>("solo");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [kalshiPending, startKalshi] = useTransition();

  // derive slide direction from previous step
  const prevStepRef = useRef(0);
  const direction = stepIndex > prevStepRef.current ? 1 : -1;

  const step = STEP_KEYS[stepIndex];

  function goNext() {
    prevStepRef.current = stepIndex;
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function goBack() {
    prevStepRef.current = stepIndex;
    setStepIndex((i) => Math.max(i - 1, 0));
  }

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
      toast.error("Account creation failed", result.error);
      setLoading(false);
      return;
    }

    toast.accountCreated(accountName());
    router.push("/");
  }

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partnerEmail);

  // joint ownership requires a valid partner email before continuing
  const canContinue =
    step !== "ownership" || ownership !== "joint" || isValidEmail;

  return (
    <>
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          R U Trading
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 pb-16">
        <div className="pb-8">
          <Stepper currentStep={stepIndex} steps={STEPS} />
        </div>

        <main className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">
            Open your first account
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose your experience level and account type to get started with
            paper trading.
          </p>

          <LayoutGroup>
            <div className="relative mt-8 min-h-[26rem] flex-1">
              <AnimatePresence custom={direction} initial={false} mode="wait">
                <motion.div
                  key={step}
                  animate="center"
                  custom={direction}
                  exit="exit"
                  initial="enter"
                  transition={{ duration: 0.15, ease: snappyEase }}
                  variants={slideVariants}
                >
                  {step === "experience" && (
                    <div className="space-y-4">
                      <Label className="text-sm font-medium">
                        Experience level
                      </Label>
                      <div className="space-y-4">
                        {EXPERIENCE_OPTIONS.map((opt) => (
                          <OptionCard
                            key={opt.value}
                            description={opt.description}
                            detail={opt.balance}
                            groupId="experience"
                            label={opt.label}
                            onSelect={setExperience}
                            selected={experience === opt.value}
                            value={opt.value}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {step === "type" && (
                    <div className="space-y-4">
                      <Label className="text-sm font-medium">
                        Account type
                      </Label>
                      <div className="grid grid-cols-2 gap-4">
                        {TYPE_OPTIONS.map((opt) => (
                          <OptionCard
                            key={opt.value}
                            description={opt.description}
                            groupId="type"
                            label={opt.label}
                            onSelect={setAccountType}
                            selected={accountType === opt.value}
                            value={opt.value}
                          />
                        ))}
                      </div>
                      {kalshiEnabled && (
                        <>
                          <div className="my-4 flex items-center gap-3">
                            <div className="h-px flex-1 bg-border" />
                            <span className="text-xs text-muted-foreground">or</span>
                            <div className="h-px flex-1 bg-border" />
                          </div>
                          <Button
                            variant="outline"
                            type="button"
                            disabled={kalshiPending}
                            onClick={() => {
                              startKalshi(async () => {
                                const result = await createKalshiAccount(
                                  "My Kalshi Account",
                                );
                                if (!result.success) {
                                  toast.error(
                                    "Could not create Kalshi account",
                                    result.error,
                                  );
                                  return;
                                }
                                router.push("/kalshi");
                              });
                            }}
                          >
                            <Robot size={16} weight="duotone" />
                            {kalshiPending
                              ? "Creating..."
                              : "Create a Kalshi bot account instead"}
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {step === "ownership" && (
                    <div className="space-y-4">
                      <Label className="text-sm font-medium">
                        Account ownership
                      </Label>
                      <div className="grid grid-cols-2 gap-4">
                        {OWNERSHIP_OPTIONS.map((opt) => (
                          <OptionCard
                            key={opt.value}
                            description={opt.description}
                            groupId="ownership"
                            label={opt.label}
                            onSelect={setOwnership}
                            selected={ownership === opt.value}
                            value={opt.value}
                          />
                        ))}
                      </div>
                      {ownership === "joint" && (
                        <motion.div
                          animate={{ height: "auto", opacity: 1 }}
                          className="space-y-2 overflow-hidden"
                          exit={{ height: 0, opacity: 0 }}
                          initial={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15, ease: snappyEase }}
                        >
                          <Label htmlFor="partner-email">
                            Partner&apos;s email
                          </Label>
                          <Input
                            id="partner-email"
                            onChange={(e) => setPartnerEmail(e.target.value)}
                            placeholder="partner@students.rowan.edu"
                            type="email"
                            value={partnerEmail}
                          />
                          {partnerEmail.length > 0 && !isValidEmail ? (
                            <p className="text-xs text-destructive">
                              Enter a valid email address.
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              They&apos;ll receive an invite to join this
                              account.
                            </p>
                          )}
                        </motion.div>
                      )}
                    </div>
                  )}

                  {step === "confirm" && (
                    <div className="space-y-6">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Starting balance
                        </p>
                        <p className="mt-1 text-4xl font-bold tracking-tight text-emerald-600">
                          {getExperienceOption(experience).balance}
                        </p>
                      </div>

                      <div className="space-y-4">
                        {([
                          {
                            icon: <TagIcon weight="duotone" />,
                            label: "Account name",
                            value: accountName(),
                            caps: false,
                          },
                          {
                            icon: <WalletIcon weight="duotone" />,
                            label: "Type",
                            value: accountType,
                            caps: true,
                          },
                          {
                            icon: <GraduationCapIcon weight="duotone" />,
                            label: "Experience",
                            value: experience,
                            caps: true,
                          },
                          {
                            icon: <UsersThreeIcon weight="duotone" />,
                            label: "Ownership",
                            value: ownership,
                            caps: true,
                          },
                          ...(ownership === "joint"
                            ? [
                                {
                                  icon: <EnvelopeSimpleIcon weight="duotone" />,
                                  label: "Partner",
                                  value: partnerEmail,
                                  caps: false,
                                },
                              ]
                            : []),
                        ] as const).map((row, i) => (
                          <motion.div
                            key={row.label}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-4"
                            initial={{ opacity: 0, y: 8 }}
                            transition={{
                              delay: i * 0.04,
                              duration: 0.15,
                              ease: snappyEase,
                            }}
                          >
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-5">
                              {row.icon}
                            </div>
                            <div className="flex-1">
                              <p className="text-xs text-muted-foreground">
                                {row.label}
                              </p>
                              <p className={`text-sm font-medium ${row.caps ? "capitalize" : ""}`}>
                                {row.value}
                              </p>
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      {error && (
                        <p className="text-sm text-destructive">{error}</p>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </LayoutGroup>

          <div className="mt-8 flex items-center justify-between">
            {stepIndex > 0 ? (
              <Button disabled={loading} onClick={goBack} variant="outline">
                <ArrowLeftIcon className="size-4" weight="bold" />
                Back
              </Button>
            ) : (
              <div />
            )}
            <Button
              disabled={step === "confirm" ? loading : !canContinue}
              onClick={step === "confirm" ? handleSubmit : goNext}
            >
              {step === "confirm"
                ? loading
                  ? "Creating..."
                  : "Create account"
                : "Continue"}
            </Button>
          </div>
        </main>
      </div>
    </>
  );
}
