import type { Metadata } from "next";
import { NewsContent } from "@/components/news/news-content";

export const metadata: Metadata = { title: "News - R U Trading" };

export default function NewsPage() {
  return <NewsContent />;
}
