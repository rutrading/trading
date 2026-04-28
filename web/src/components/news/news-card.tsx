"use client";

import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import type { NewsArticle } from "@/app/actions/news";

export const NewsCard = ({ item }: { item: NewsArticle }) => {
  const symbols = item.symbols ?? [];
  const visibleSymbols = symbols.slice(0, 3);
  const hiddenSymbols = symbols.slice(visibleSymbols.length);

  return (
    <Card className="overflow-visible">
      <CardHeader className="p-4 pb-3">
        <div className="mb-1 flex min-h-5 flex-wrap items-center gap-1 overflow-visible">
          {visibleSymbols.length ? (
            <>
              {visibleSymbols.map((symbol) => (
                <Link key={symbol} href={`/news/${symbol}`} className="inline-flex">
                  <Badge variant="default" className="text-[11px] tracking-wide transition-transform hover:-translate-y-px">
                    {symbol}
                  </Badge>
                </Link>
              ))}
              {hiddenSymbols.length > 0 ? (
                <Menu>
                  <MenuTrigger
                    openOnHover
                    nativeButton={false}
                    render={
                      <Badge variant="default" className="inline-flex cursor-pointer text-[11px] tracking-wide transition-transform hover:-translate-y-px">
                        +{hiddenSymbols.length}
                      </Badge>
                    }
                  />
                  <MenuPopup align="end" side="bottom" sideOffset={6} className="w-32">
                    {hiddenSymbols.map((symbol) => (
                      <MenuItem key={symbol} render={<Link href={`/news/${symbol}`} />}>
                        {symbol}
                      </MenuItem>
                    ))}
                  </MenuPopup>
                </Menu>
              ) : null}
            </>
          ) : (
            <Badge variant="default" className="text-[11px] tracking-wide opacity-72">
              Market
            </Badge>
          )}
        </div>
        <CardTitle className="text-sm leading-snug">
          {item.headline}
        </CardTitle>
        {item.source ? (
          <CardAction>
            <span className="text-xs text-muted-foreground">{item.source}</span>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardPanel className="flex flex-1 flex-col px-4 pb-0 pt-0">
        <CardDescription className="line-clamp-4 text-xs leading-relaxed">
          {item.summary}
        </CardDescription>
      </CardPanel>
      <CardFooter className="p-4 pt-4">
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="w-fit">
            Read Article
            <ArrowUpRight size={14} />
          </Button>
        </a>
      </CardFooter>
    </Card>
  );
};
