// /portfolio was split into /holdings and /activity. Kept here as a permanent
// redirect so any external bookmarks or stale links don't 404.

import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ page?: string; account?: string }> };

export default async function PortfolioPage({ searchParams }: Props) {
  const { account } = await searchParams;
  const qs = account ? `?account=${account}` : "";
  redirect(`/holdings${qs}`);
}
