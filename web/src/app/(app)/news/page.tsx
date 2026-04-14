import { redirect } from "next/navigation";
import { getSession } from "@/app/actions/auth";
import * as api from "@/lib/api";

export const metadata = { title: "News - R U Trading" };

export default async function NewsPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  type NewsResponse = {
    news: { title: string; link: string; authors: string[]; body: string; stock_tickers: string[] }[];
  };
  const newsDict = await api.get<NewsResponse>("/news");
  if (!newsDict.ok) {
    return <h1>error</h1>
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">News</h1>
        <p className="text-sm text-muted-foreground">
          Financial news and headlines.
        </p>
        {newsDict.data.news.map((item: { title: string; link: string; authors: string[]; body: string; stock_tickers: string[] }, index: number) => (
          <div key={index} className="py-2">
            <h2 style={{ fontSize: '20pt' }} className="text-lg font-bold">{item.title}</h2>
            <a href={item.link} target="_blank" style={{ textDecoration: 'underline' }} className="text-sm text-muted-foreground">
              Article Link
            </a>
            <p>Relevant Stocks: {item.stock_tickers.join(", ")}</p>
            <p>{item.body}</p>
            <br></br>
          </div>
        ))}
      </div>
    </div>
  );
}
