import { redirect } from "next/navigation";
import { getSession } from "@/app/actions/auth";
import { StockChart } from "./client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} - R U Trading` };
}

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const { ticker } = await params;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {ticker.toUpperCase()}
        </h1>
        <p className="text-sm text-muted-foreground">Stock detail page.</p>
      </div>
      <StockChart ticker={ticker} />
    </div>
  );
}
