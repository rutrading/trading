import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/app/actions/auth";
import { isKalshiEnabled } from "@/lib/kalshi-enabled";
import { OnboardingForm } from "./form";

export const metadata: Metadata = {
  title: "Get Started - R U Trading",
};

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  return <OnboardingForm kalshiEnabled={isKalshiEnabled()} />;
}
