"use server";

import { getSession } from "@/app/actions/auth";
import * as api from "@/lib/api";

export type NewsArticle = {
  headline: string;
  summary: string;
  source: string;
  url: string;
  symbol: string | null;
};

type BackendArticle = {
  title: string;
  link: string;
  authors: string[] | null;
  body: string;
};

type BackendResponse = {
  news: BackendArticle[];
  next_page_token: string | null;
};

function transform(article: BackendArticle): NewsArticle {
  return {
    headline: article.title,
    summary: article.body,
    source: article.authors?.join(", ") || "",
    url: article.link,
    symbol: null,
  };
}

export async function getNews(params?: {
  ticker?: string;
  limit?: number;
  page_token?: string;
}): Promise<{ articles: NewsArticle[]; nextPageToken: string | null }> {
  const session = await getSession();
  if (!session) return { articles: [], nextPageToken: null };

  const res = await api.get<BackendResponse>("/news", {
    ticker: params?.ticker,
    limit: params?.limit?.toString(),
    page_token: params?.page_token,
  });

  if (!res.ok) return { articles: [], nextPageToken: null };

  return {
    articles: res.data.news.map(transform),
    nextPageToken: res.data.next_page_token,
  };
}
