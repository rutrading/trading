import { redirect } from "next/navigation";
import { getSession } from "@/app/actions/auth";

export const metadata = { title: "Portfolio - R U Trading" };

export default async function PortfolioPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
        <p className="text-sm text-muted-foreground">
          Your holdings and transaction history.
        </p>
      </div>
    </div>
  );
}
