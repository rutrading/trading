import Link from "next/link";
import { RegisterForm } from "./form";

export const metadata = { title: "Sign up - R U Trading" };

function getSafeRedirect(url: string | undefined): string {
  if (!url) return "/dashboard";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return "/dashboard";
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: redirectTo } = await searchParams;
  const safeRedirect = getSafeRedirect(redirectTo);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Create an account
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start paper trading with $100k in virtual funds
        </p>
      </div>
      <RegisterForm redirectTo={safeRedirect} />
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          className="text-foreground underline underline-offset-4 hover:text-foreground/80"
          href={{
            pathname: "/auth/login",
            query:
              safeRedirect !== "/dashboard"
                ? { redirect: safeRedirect }
                : undefined,
          }}
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
