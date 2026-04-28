"use client";

import { Newspaper } from "@phosphor-icons/react";
import { NewsCard } from "./news-card";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/page";
import type { NewsArticle } from "@/app/actions/news";

export const NewsContent = ({ articles }: { articles: NewsArticle[] }) => {
  return (
    <div className="space-y-6">
      <PageHeader divider={false} className="h-auto px-0 pb-2">
        <div>
        <h1 className="text-2xl font-semibold tracking-tight">News</h1>
        <p className="text-sm text-muted-foreground">
          Latest financial news and market headlines.
        </p>
        </div>
      </PageHeader>

      {articles.length === 0 ? (
        <div className="rounded-2xl bg-accent p-6">
          <Empty>
            <EmptyMedia><Newspaper className="size-6 text-muted-foreground" /></EmptyMedia>
            <EmptyTitle>No news available</EmptyTitle>
            <EmptyDescription>Check back later for the latest headlines.</EmptyDescription>
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
