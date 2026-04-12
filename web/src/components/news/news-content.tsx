"use client";

import { useMemo } from "react";
import { Newspaper } from "@phosphor-icons/react";
import { NewsCard } from "./news-card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import type { NewsArticle } from "@/app/actions/news";

export const NewsContent = ({ articles }: { articles: NewsArticle[] }) => {
  const groupedNews = useMemo(() => {
    const groups: Record<string, NewsArticle[]> = {};
    for (const item of articles) {
      const key = item.symbol ?? "General";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }, [articles]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">News</h1>
        <p className="text-sm text-muted-foreground">
          Latest financial news and market headlines.
        </p>
      </div>

      {articles.length === 0 ? (
        <div className="rounded-2xl bg-accent p-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Newspaper /></EmptyMedia>
              <EmptyTitle>No news available</EmptyTitle>
              <EmptyDescription>Check back later for the latest headlines.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        Object.entries(groupedNews).map(([symbol, items]) => (
          <section key={symbol} className="rounded-2xl bg-accent p-6">
            <div className="mb-4 flex items-center gap-2">
              {symbol !== "General" ? (
                <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-xs font-semibold">
                  {symbol}
                </span>
              ) : (
                <span className="text-sm font-medium text-muted-foreground">Market News</span>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item, i) => (
                <NewsCard key={i} item={item} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
};
