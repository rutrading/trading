import Link from "next/link";
import { ArrowUpRight, Newspaper } from "@phosphor-icons/react/ssr";
import { getNews } from "@/app/actions/news";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";

export const RelatedNews = async ({
  ticker,
  limit = 5,
}: {
  ticker: string;
  limit?: number;
}) => {
  const upper = ticker.toUpperCase();
  const { articles } = await getNews({ ticker: upper, limit });
  const items = articles.slice(0, limit);

  return (
    <div className="rounded-2xl bg-accent p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Related News</h2>
        <Link
          href={`/news/${upper}`}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View all
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl bg-card p-4">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Newspaper />
              </EmptyMedia>
              <EmptyTitle>No news for {upper}</EmptyTitle>
              <EmptyDescription>Check back later for articles about this stock.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card">
          {items.map((item, i) => (
            <div key={i}>
              {i > 0 && <Separator />}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-4 transition-colors hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  {item.source && (
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {item.source}
                    </p>
                  )}
                  <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
                    {item.headline}
                  </h3>
                </div>
                <ArrowUpRight
                  size={16}
                  className="mt-0.5 shrink-0 text-muted-foreground"
                />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
