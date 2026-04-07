import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { NewsCard } from "../_components/news-card";
import { NEWS_ITEMS, SYMBOLS } from "../_components/news-data";

type Props = { params: Promise<{ ticker: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} News - R U Trading` };
}

export default async function TickerNewsPage({ params }: Props) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();
  const company = SYMBOLS.find((s) => s.ticker === upper);
  const items = NEWS_ITEMS.filter((n) => n.symbol === upper);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {company?.name ?? upper}
            </h1>
            <span className="rounded bg-foreground/10 px-2 py-1 text-sm font-semibold">
              {upper}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length} article{items.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/test/news">
          <Button variant="outline" size="icon">
            <ArrowLeft size={16} />
          </Button>
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No news found for {upper}.</p>
      ) : (
        <div className="rounded-2xl bg-accent p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, i) => (
              <NewsCard key={i} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
