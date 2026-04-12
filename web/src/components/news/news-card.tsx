import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import type { NewsItem } from "./news-data";

export const NewsCard = ({ item }: { item: NewsItem }) => {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="p-2">
        <div className="flex h-40 w-full items-center justify-center rounded-xl bg-muted">
          <span className="text-sm text-muted-foreground">No image available</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-center gap-2">
          {item.symbol && (
            <Link href={`/news/${item.symbol}`}>
              <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-foreground transition-colors hover:bg-foreground/20">
                {item.symbol}
              </span>
            </Link>
          )}
          <span className="text-xs text-muted-foreground">{item.source}</span>
          <span className="text-xs text-muted-foreground">{item.timestamp}</span>
        </div>
        <h3 className="mb-1 text-sm font-semibold leading-snug">
          {item.headline}
        </h3>
        <p className="mb-4 flex-1 text-xs leading-relaxed text-muted-foreground">
          {item.summary}
        </p>
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="w-fit">
            Read Article
            <ArrowUpRight size={14} />
          </Button>
        </a>
      </div>
    </div>
  );
};
