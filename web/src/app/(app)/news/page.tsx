import type { Metadata } from "next";
import { getNews } from "@/app/actions/news";
import { NewsContent } from "@/components/news/news-content";

export const metadata: Metadata = { title: "News - R U Trading" };

export default async function NewsPage() {
  const { articles } = await getNews();
  return <NewsContent articles={articles} />;
}
