import { redirect } from "next/navigation";
import { getSession } from "@/app/actions/auth";

export const metadata = { title: "Watchlist - R U Trading" };

export default async function WatchlistPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Watchlist</h1>
        <p className="text-sm text-muted-foreground">
          Stocks you're keeping an eye on.
        </p>
      </div>
    </div>
  );
}
