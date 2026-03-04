import type { Metadata } from "next";
import { OnboardingForm } from "./form";

export const metadata: Metadata = {
  title: "Get Started - R U Trading",
};

export default function OnboardingPage() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold tracking-tight">
          Open your first account
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose your experience level and account type to get started with
          paper trading.
        </p>
      </div>
      <OnboardingForm />
    </div>
  );
}
