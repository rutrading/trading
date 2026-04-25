/**
 * Shared source of truth for experience levels, starting balances, and the
 * copy shown in the onboarding flow / reset-account dialog. Update here,
 * not in the individual components.
 */

export type Experience = "beginner" | "intermediate" | "advanced" | "expert";

export type ExperienceOption = {
  value: Experience;
  label: string;
  balance: string;
  startingBalance: string;
  description: string;
};

export const EXPERIENCE_OPTIONS: ExperienceOption[] = [
  {
    value: "beginner",
    label: "Beginner",
    balance: "$100,000",
    startingBalance: "100000",
    description: "Start with more capital to learn without pressure.",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    balance: "$50,000",
    startingBalance: "50000",
    description: "A balanced starting point to build your strategy.",
  },
  {
    value: "advanced",
    label: "Advanced",
    balance: "$25,000",
    startingBalance: "25000",
    description: "Less room for error, more room to grow.",
  },
  {
    value: "expert",
    label: "Expert",
    balance: "$10,000",
    startingBalance: "10000",
    description: "Prove your skill with limited capital.",
  },
];

export const BALANCE_MAP: Record<Experience, string> = Object.fromEntries(
  EXPERIENCE_OPTIONS.map((o) => [o.value, o.startingBalance]),
) as Record<Experience, string>;

export const getExperienceOption = (value: Experience): ExperienceOption =>
  EXPERIENCE_OPTIONS.find((o) => o.value === value) ?? EXPERIENCE_OPTIONS[0];
