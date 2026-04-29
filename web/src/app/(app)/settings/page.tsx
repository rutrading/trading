import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession, getAccounts } from "@/app/actions/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileForm } from "@/components/settings/profile-form";
import { SecurityForm } from "@/components/settings/security-form";
import { AccountsList } from "@/components/settings/accounts-list";
import { isKalshiEnabled } from "@/lib/kalshi-enabled";

export const metadata: Metadata = { title: "Settings - R U Trading" };

async function AccountsLoader() {
  const accounts = await getAccounts();
  return <AccountsList accounts={accounts} kalshiEnabled={isKalshiEnabled()} />;
}

async function ProfileLoader() {
  const session = await getSession();
  if (!session) return null;
  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-lg font-semibold">Profile</h2>
      <div className="rounded-xl bg-card p-4">
        <ProfileForm name={session.user.name} email={session.user.email} />
      </div>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-4 rounded-2xl bg-accent p-6">
      <Skeleton className="h-5 w-24" />
      <div className="rounded-xl bg-card p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="mt-3 h-10 w-full" />
        <Skeleton className="mt-3 h-9 w-20" />
      </div>
    </div>
  );
}

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile and account.
        </p>
      </div>

      <div className="mx-auto max-w-2xl space-y-8">
        <Suspense fallback={<SectionSkeleton />}>
          <AccountsLoader />
        </Suspense>

        <Suspense fallback={<SectionSkeleton />}>
          <ProfileLoader />
        </Suspense>

        <div className="rounded-2xl bg-accent p-6">
          <h2 className="mb-4 text-lg font-semibold">Security</h2>
          <div className="rounded-xl bg-card p-4">
            <SecurityForm />
          </div>
        </div>
      </div>
    </div>
  );
}
