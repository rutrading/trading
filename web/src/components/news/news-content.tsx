"use client";

import { useState, useTransition } from "react";
import { Newspaper } from "@phosphor-icons/react";
import { NewsCard } from "./news-card";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/page";
import { Spinner } from "@/components/ui/spinner";
import { SymbolSearch } from "@/components/symbol-search";
import { getNews, type NewsArticle } from "@/app/actions/news";

export const NewsContent = ({ articles: initialArticles }: { articles: NewsArticle[] }) => {
  const [articles, setArticles] = useState(initialArticles);
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [searchKey, setSearchKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  const applyFilter = (ticker: string | null) => {
    setActiveTicker(ticker);
    setSearchKey((k) => k + 1);
    startTransition(async () => {
      const { articles } = await getNews(ticker ? { ticker } : undefined);
      setArticles(articles);
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader divider={false} className="h-auto px-0 pb-2 flex-wrap items-center gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">News</h1>
          <p className="text-sm text-muted-foreground">
            {activeTicker
              ? `Filtered by ${activeTicker}.`
              : "Latest financial news and market headlines."}
          </p>
        </div>
        <div className="shrink-0 self-center">
          <SymbolSearch
            key={searchKey}
            placeholder="Filter by symbol..."
            onSelect={(item) => applyFilter(item.ticker)}
          />
        </div>
      </PageHeader>

      {isPending ? (
        <div className="flex items-center justify-center rounded-2xl bg-accent p-12">
          <Spinner className="size-5" />
        </div>
      ) : articles.length === 0 ? (
        <div className="rounded-2xl bg-accent p-6">
          <Empty>
            <EmptyMedia><Newspaper className="size-6 text-muted-foreground" /></EmptyMedia>
            <EmptyTitle>No news available</EmptyTitle>
            <EmptyDescription>
              {activeTicker
                ? `No articles found for ${activeTicker}.`
                : "Check back later for the latest headlines."}
            </EmptyDescription>
          </Empty>
        </div>
      ) : (
        <div className="grid items-stretch gap-4 overflow-visible md:grid-cols-2 xl:grid-cols-3">
          {articles.map((item, i) => (
            <NewsCard key={i} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};
