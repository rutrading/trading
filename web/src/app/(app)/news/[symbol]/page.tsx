import { redirect } from "next/navigation";
import { getSession } from "@/app/actions/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  return { title: `${symbol.toUpperCase()} News - R U Trading` };
}

export default async function SymbolNewsPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const { symbol } = await params;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {symbol.toUpperCase()} News
        </h1>
        <p className="text-sm text-muted-foreground">
          Latest news for {symbol.toUpperCase()}.
        </p>
      </div>
    </div>
  );
}
