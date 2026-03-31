"""News endpoints — implementation pending."""

from fastapi import APIRouter, Depends

from app.auth import get_current_user

import app.services.news.new_source_interface as ns_iface

router = APIRouter()

@router.get("/news")
async def get_news(user: dict = Depends(get_current_user)):
    print(f"{user.get('sub')}\n\n")
    return {"news": ns_iface.get_interface_singleton(600).news_set_arr(all_articles=True, i=0),"next_page_token": None}
