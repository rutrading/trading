import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/app/actions/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileSection } from "./profile-section";
import { SecuritySection } from "./security-section";
import { AccountsSection } from "./accounts-section";

export const metadata = { title: "Settings - R U Trading" };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile and trading accounts.
        </p>
      </div>

      <Suspense fallback={<SectionSkeleton />}>
        <ProfileSection />
      </Suspense>

      <SecuritySection />

      <Suspense fallback={<SectionSkeleton />}>
        <AccountsSection />
      </Suspense>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-4 rounded-xl border border-border p-6">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-9 w-20" />
    </div>
  );
}
