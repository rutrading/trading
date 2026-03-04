import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileSection } from "./profile-section";
import { SecuritySection } from "./security-section";
import { AccountsSection } from "./accounts-section";

export const metadata = { title: "Settings - R U Trading" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
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
