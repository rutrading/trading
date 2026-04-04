"""News endpoints — implementation pending."""

from fastapi import APIRouter, Depends

from app.auth import get_current_user

import app.services.news.new_source_interface as ns_iface

router = APIRouter()

@router.get("/news")
async def get_news(user: dict = Depends(get_current_user)):
    news_dict = await ns_iface.get_interface_singleton(600).news_set_arr(all_articles=True, i=0)
    return {"news": news_dict,"next_page_token": None}
