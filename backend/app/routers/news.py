"""News endpoints — implementation pending."""

from app.db import db_session
from fastapi import APIRouter, Depends

from app.auth import get_current_user

from app.db.models import ArticleSummaryView

router = APIRouter()

@router.get("/news")
async def get_news(user: dict = Depends(get_current_user), page_token: int = 0, limit: int = 25):
    news_dict = await get_news_dict(page_token, limit)
    return news_dict

async def get_news_dict(page_token: int = 0, limit: int = 25):
    with db_session() as db:
        articles = (
            db.query(ArticleSummaryView)
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