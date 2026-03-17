"use server";

import { getSession } from "@/app/actions/auth";
import * as api from "@/lib/api";

// TODO: define NewsArticle shape once the news data source is decided
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getNews(params?: {
  ticker?: string;
  limit?: number;
  page_token?: string;
}): Promise<api.ApiResult<{ news: unknown[]; next_page_token: string | null }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };

  return api.get("/news", {
    ticker: params?.ticker,
    limit: params?.limit?.toString(),
    page_token: params?.page_token,
  });
}
