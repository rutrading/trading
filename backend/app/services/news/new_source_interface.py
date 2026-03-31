from datetime import datetime
import pandas as pd
from app.services.news import news_sources as ns

nbc = ns.News_Source_NBC("https://feeds.nbcnews.com/nbcnews/public/business")
abc = ns.News_Source_ABC("https://abcnews.com/abcnews/usheadlines")
invescom = ns.News_Source_invescom("https://www.investing.com/rss/news.rss")

news_feeds = [nbc, abc, invescom]

class news_source_interface(): 
    def __init__(self):
        self.ttl = 600
        self.last_update = datetime.now().timestamp()
        self.df = pd.DataFrame()
        self.news_set = [dict]

    def news_source_sample_df(self, sample_size: int, seed: int = None) -> pd.DataFrame:
        if seed == None:
            time = datetime.now()
            seed = time.month + time.day + time.year%(time.hour+1)*time.month + time.day * time.year * (time.hour+1)
        for i in range(0, len(news_feeds)):
            news_feeds[i].reduce_random(sample_size, seed)
            news_feeds[i].add_article_body_df()
        return pd.concat(news_feeds[i].df for i in range(0, len(news_feeds))).reset_index(drop=True)

    def all_news_samples_df(self) -> pd.DataFrame:
        for i in range(0, len(news_feeds)):
            news_feeds[i].add_article_body_df()
        return pd.concat(news_feeds[i].df for i in range(0, len(news_feeds))).reset_index(drop=True)

    def compile_result(self, df: pd.DataFrame):
        leng = len(df)
        result = []
        for i in range(0, leng):
            result.append(
                {
                    'title': df.loc[i, 'title'],
                    'link': df.loc[i, 'link'],
                    'authors': df.loc[i, 'authors'],
                    'body': df.loc[i, 'body']
                }
            )
        return result

    def news_set_arr(self, sample_size: int=2, seed: int = None, all_articles: bool = False, chunk_access: int = None, i: int = 0) -> list[dict]:
        if (datetime.now().timestamp() - self.last_update  > self.ttl or self.df.empty):
            if all_articles:
                self.df = self.all_news_samples_df()
            else:
                self.df = self.news_source_sample_df(sample_size=sample_size, seed=seed)
            self.news_set = self.compile_result(self.df)
        if chunk_access != None:
            start = i*chunk_access
            return self.news_set[start:start+chunk_access]
        else:
            return self.news_set


iface = news_source_interface()

def get_interface_singleton(ttl: int):
    if ttl != iface.ttl:
        iface.ttl = ttl
    return iface