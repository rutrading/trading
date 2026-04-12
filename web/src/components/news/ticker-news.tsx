import Link from "next/link";
import { ArrowLeft, Newspaper } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { NewsCard } from "./news-card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import type { NewsArticle } from "@/app/actions/news";

export const TickerNews = ({ ticker, articles }: { ticker: string; articles: NewsArticle[] }) => {
  const upper = ticker.toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{upper}</h1>
            <span className="rounded bg-foreground/10 px-2 py-1 text-sm font-semibold">
              News
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {articles.length} article{articles.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/news">
          <Button variant="outline" size="icon">
            <ArrowLeft size={16} />
          </Button>
        </Link>
      </div>

      {articles.length === 0 ? (
        <div className="rounded-2xl bg-accent p-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Newspaper /></EmptyMedia>
              <EmptyTitle>No news for {upper}</EmptyTitle>
              <EmptyDescription>Check back later for articles about this stock.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="rounded-2xl bg-accent p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((item, i) => (
              <NewsCard key={i} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
