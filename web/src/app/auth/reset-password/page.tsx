import Link from "next/link";
import { ResetPasswordForm } from "./form";

export const metadata = { title: "Reset password - R U Trading" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Reset password
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your new password below
        </p>
      </div>
      <ResetPasswordForm token={token ?? ""} />
      <p className="text-sm text-muted-foreground">
        Back to{" "}
        <Link
          className="text-foreground underline underline-offset-4 hover:text-foreground/80"
          href="/auth/login"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
