"""News endpoints — implementation pending."""

from app.db import db_session
from fastapi import APIRouter, Depends

from app.auth import get_current_user

from app.db.models import (
    Article_Stock_Ticker,
    ArticleSummaryView,
    News_Article_Ticker_Bridge,
)

router = APIRouter()

@router.get("/news")
async def get_news(
    user: dict = Depends(get_current_user),
    page_token: int = 0,
    limit: int = 25,
    ticker: str | None = None,
):
    news_dict = await get_news_dict(page_token, limit, ticker)
    return news_dict

async def get_news_dict(page_token: int = 0, limit: int = 25, ticker: str | None = None):
    with db_session() as db:
        query = db.query(ArticleSummaryView)
        if ticker:
            article_ids = (
                db.query(News_Article_Ticker_Bridge.article_id)
                .join(
                    Article_Stock_Ticker,
                    Article_Stock_Ticker.ticker_id == News_Article_Ticker_Bridge.ticker_id,
                )
                .filter(Article_Stock_Ticker.ticker == ticker.upper())
                .scalar_subquery()
            )
            query = query.filter(ArticleSummaryView.article_id.in_(article_ids))
        articles = (
            query
            .order_by(ArticleSummaryView.date_published.desc())
            .offset(page_token * limit)
            .limit(limit)
            .all()
        )
    if articles is not None:
        return {
            "news": [
                {
                    "article_id": a.article_id,
                    "title": a.title,
                    "link": a.url,
                    "authors": a.authors.split(", ") if a.authors else [],
                    "body": a.summary,
                    "stock_tickers": a.tickers.split(", ") if a.tickers else [],
                    "thumbnail": a.thumbnail,
                    "date_published": a.date_published,
                    "source_name": a.source_name
                }
                for a in articles
            ],
            "next_page_token": None
        }
    else:
        return {"articles": []}