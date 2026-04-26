
from app.db import db_session
from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.db.models import ArticleSummaryView

"""News endpoints — implementation pending."""

router = APIRouter()

@router.get("/testendpoint")
def get_news(user: dict = Depends(get_current_user), skip: int = 0, limit: int = 10):
    with db_session() as db:
        articles = db.query(ArticleSummaryView).offset(skip*10).limit(limit).all()
    if articles is not None:
        return {
            "articles": [
                {
                    "article_id": a.article_id,
                    "url": a.url,
                    "summary": a.summary,
                    "thumbnail": a.thumbnail,
                    "date_published": a.date_published,
                    "source_name": a.source_name,
                    "authors": a.authors.split(", ") if a.authors else [],
                    "tickers": a.tickers.split(", ") if a.tickers else []
                }
                for a in articles
            ]
        }
    else:
        return {"articles": []}