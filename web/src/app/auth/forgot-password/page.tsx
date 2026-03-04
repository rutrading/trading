import Link from "next/link";
import { ForgotPasswordForm } from "./form";

export const metadata = { title: "Forgot password - R U Trading" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: redirectTo } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Forgot password?
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a reset link
        </p>
      </div>
      <ForgotPasswordForm />
      <p className="text-sm text-muted-foreground">
        Remember your password?{" "}
        <Link
          className="text-foreground underline underline-offset-4 hover:text-foreground/80"
          href={{
            pathname: "/auth/login",
            query: redirectTo ? { redirect: redirectTo } : undefined,
          }}
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
