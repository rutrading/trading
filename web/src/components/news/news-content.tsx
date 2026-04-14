"use client";

import { Newspaper } from "@phosphor-icons/react";
import { NewsCard } from "./news-card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import type { NewsArticle } from "@/app/actions/news";

export const NewsContent = ({ articles }: { articles: NewsArticle[] }) => {
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((item, i) => (
            <NewsCard key={i} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};
