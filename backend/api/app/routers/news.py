"""News endpoints — implementation pending."""

from fastapi import APIRouter, Depends

from app.auth import get_current_user

router = APIRouter()


@router.get("/news")
async def get_news(user: dict = Depends(get_current_user)):
    return {"news": [], "next_page_token": None}
