import type { Metadata } from "next";
import { getNews } from "@/app/actions/news";
import { TickerNews } from "@/components/news/ticker-news";

type Props = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `${symbol.toUpperCase()} News - R U Trading` };
}

export default async function SymbolNewsPage({ params }: Props) {
  const { symbol } = await params;
  const { articles } = await getNews({ ticker: symbol.toUpperCase() });
  return <TickerNews ticker={symbol} articles={articles} />;
}
