import Link from "next/link";
import { ArrowLeft, Newspaper } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { NewsCard } from "./news-card";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/page";
import type { NewsArticle } from "@/app/actions/news";

export const TickerNews = ({ ticker, articles }: { ticker: string; articles: NewsArticle[] }) => {
  const upper = ticker.toUpperCase();

  return (
    <div className="space-y-6">
      <PageHeader divider={false} className="h-auto px-0 pb-2">
      <div className="flex w-full items-center justify-between">
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
      </PageHeader>

      {articles.length === 0 ? (
        <div className="rounded-2xl bg-accent p-6">
          <Empty>
            <EmptyMedia><Newspaper className="size-6 text-muted-foreground" /></EmptyMedia>
            <EmptyTitle>No news for {upper}</EmptyTitle>
            <EmptyDescription>Check back later for articles about this stock.</EmptyDescription>
          </Empty>
        </div>
      ) : (
        <div className="rounded-2xl bg-accent p-6">
          <div className="grid items-stretch gap-4 overflow-visible md:grid-cols-2 xl:grid-cols-3">
            {articles.map((item, i) => (
              <NewsCard key={i} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
