import type { Metadata } from "next";
import { TickerNews } from "@/components/news/ticker-news";

type Props = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `${symbol.toUpperCase()} News - R U Trading` };
}

export default async function SymbolNewsPage({ params }: Props) {
  const { symbol } = await params;
  return <TickerNews ticker={symbol} />;
}
