import app.services.news.news_sources as ns
from app.db import db_session
from app.db.models import News_Article, News_Source, News_Article_Source_Bridge, Author, Article_Stock_Ticker, News_Article_Ticker_Bridge

import asyncio

news_feeds = [
    ns.News_Source_NBC("https://feeds.nbcnews.com/nbcnews/public/business"), #NBC business news
    ns.News_Source_ABC("https://abcnews.com/abcnews/usheadlines"), #ABC news US headlines
    ns.News_Source_invescom("https://www.investing.com/rss/news.rss") #Investing.com news
]

async def get_news() -> None:
    for feed in news_feeds:
        df = feed.df
        leng = len(df)
        with db_session() as db:
            for i in range(leng):
                existing_article = (db.query(News_Article).filter(News_Article.url == df.iloc[i]["link"]).first())
                # If the article doesn't already exist in the database, add it along with its associated source, authors, and tickers
                if not existing_article:
                    article_body = await feed.get_article_body_link(df.iloc[i]['link'])
                    tickers = await feed.nlp_get_stock_tickers(article_body)
                    date_published = f"{df.iloc[i]['pub_year']}-{df.iloc[i]['pub_month']}-{df.iloc[i]['pub_day']}"
                    
                    new_article = News_Article(
                        title=df.iloc[i]['title'],
                        url=df.iloc[i]['link'],
                        summary=f"{article_body[:197]}..." if len(article_body) > 200 else article_body,
                        thumbnail=None,
                        date_published=date_published
                    )

                    db.add(new_article)
                    db.flush()  # Flush to get the article_id for the new article

                    #Do Logic for adding a potential new news source for the article
                    source_name = df.iloc[i]["source"]

                    article_source = (
                        db.query(News_Source)
                        .filter(News_Source.source_name == source_name)
                        .first()
                    )

                    if not article_source:
                        article_source = News_Source(
                            source_name=source_name
                        )
                        db.add(article_source)
                        db.flush()

                    #Do bridging table between news article and news source
                    news_source_bridge = News_Article_Source_Bridge(
                    article_id=new_article.article_id,
                    news_source_id=article_source.news_source_id
                    )

                    db.add(news_source_bridge)

                    # Adding author(s) for the article to the authors table
                    authors = df.iloc[i]['authors']
                    if authors is not None:
                        for author_name in authors:
                            new_author = Author(
                                article_id=new_article.article_id,
                                author_name=author_name
                            )
                            db.add(new_author)
                    else:
                        new_author = Author(
                            article_id=new_article.article_id,
                            author_name="Unknown"
                        )
                        db.add(new_author)
                    
                    # Adding tickers(s) for the article to the authors table
                    for ticker in set(tickers):
                        existing_ticker = db.query(Article_Stock_Ticker).filter(Article_Stock_Ticker.ticker == ticker).first()
                        if not existing_ticker:
                            new_ticker = Article_Stock_Ticker(
                                ticker=ticker
                            )
                            db.add(new_ticker)
                            db.flush()  # Flush to get the ticker_id for the new ticker
                            db.add(News_Article_Ticker_Bridge(
                                article_id=new_article.article_id,
                                ticker_id=new_ticker.ticker_id
                            ))
                        else:
                            db.add(News_Article_Ticker_Bridge(
                                article_id=new_article.article_id,
                                ticker_id=existing_ticker.ticker_id
                            ))

            db.commit()
