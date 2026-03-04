import Link from "next/link";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in - R U Trading" };

function getSafeRedirect(url: string | undefined): string {
  if (!url) return "/";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: redirectTo } = await searchParams;
  const safeRedirect = getSafeRedirect(redirectTo);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to your trading account
        </p>
      </div>
      <LoginForm redirectTo={safeRedirect} />
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>
          Don&apos;t have an account?{" "}
          <Link
            className="text-foreground underline underline-offset-4 hover:text-foreground/80"
            href={{
              pathname: "/auth/register",
              query:
                safeRedirect !== "/"
                  ? { redirect: safeRedirect }
                  : undefined,
            }}
          >
            Sign up
          </Link>
        </p>
        <Link
          className="text-foreground underline underline-offset-4 hover:text-foreground/80"
          href={{
            pathname: "/auth/forgot-password",
            query:
              safeRedirect !== "/"
                ? { redirect: safeRedirect }
                : undefined,
          }}
        >
          Forgot password?
        </Link>
      </div>
    </div>
  );
}
