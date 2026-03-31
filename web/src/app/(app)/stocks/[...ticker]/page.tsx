import { redirect } from "next/navigation";
import { getSession } from "@/app/actions/auth";
import { StockChart } from "@/components/StockChart";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string[] }>;
}) {
  const { ticker } = await params;
  const symbol = ticker.join("/");
  return { title: `${symbol.toUpperCase()} - R U Trading` };
}

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ ticker: string[] }>;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const { ticker } = await params;
  const symbol = ticker.join("/");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {symbol.toUpperCase()}
        </h1>
        <p className="text-sm text-muted-foreground">Stock detail page.</p>
      </div>
      <StockChart ticker={symbol} />
    </div>
  );
}
