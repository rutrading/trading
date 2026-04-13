"""Company endpoint for symbol metadata and description."""

from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.config import get_config
from app.db import db_session
from app.db.models import Company, Symbol

router = APIRouter()


def _extract_description(payload: object) -> str | None:
    if not isinstance(payload, dict):
        return None
    description = payload.get("Description")
    if isinstance(description, str) and description.strip():
        return description.strip()
    return None


def _extract_text(payload: object, key: str) -> str | None:
    if not isinstance(payload, dict):
        return None
    value = payload.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _build_logo_url(website: str | None) -> str | None:
    if not website:
        return None
    return (
        "https://www.google.com/s2/favicons?sz=128&domain_url="
        f"{quote(website, safe=':/')}"
    )


@router.get("/company/{ticker}")
async def get_company(
    ticker: str,
    _user: dict = Depends(get_current_user),
):
    ticker = ticker.upper().strip()

    with db_session() as db:
        symbol = db.query(Symbol).filter(Symbol.ticker == ticker).first()
        if not symbol:
            raise HTTPException(status_code=404, detail=f"Ticker {ticker} not found")
        existing_company = db.query(Company).filter(Company.ticker == ticker).first()
        if existing_company:
            return {
                "description": existing_company.description,
                "sector": existing_company.sector,
                "industry": existing_company.industry,
                "logo_url": existing_company.logo_url,
            }

    config = get_config()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            company_res = await client.get(
                config.alpha_vantage_url,
                params={
                    "function": "OVERVIEW",
                    "symbol": ticker,
                    "apikey": config.alpha_vantage_api_key,
                },
            )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Company request failed: {exc}")

    description = None
    sector = None
    industry = None
    logo_url = None
    if company_res.status_code < 400:
        payload = company_res.json()
        if isinstance(payload, dict) and "Note" in payload:
            raise HTTPException(status_code=429, detail=payload["Note"])
        if isinstance(payload, dict) and "Error Message" in payload:
            raise HTTPException(status_code=404, detail=payload["Error Message"])
        if isinstance(payload, dict) and "Information" in payload:
            raise HTTPException(status_code=503, detail=payload["Information"])
        description = _extract_description(payload)
        sector = _extract_text(payload, "Sector")
        industry = _extract_text(payload, "Industry")
        logo_url = _build_logo_url(_extract_text(payload, "OfficialSite"))
    elif company_res.status_code not in {401, 403, 404, 422, 429}:
        raise HTTPException(
            status_code=503,
            detail=f"Company details request failed: {company_res.status_code}",
        )

    with db_session() as db:
        row = db.query(Company).filter(Company.ticker == ticker).first()
        if not row:
            db.add(
                Company(
                    ticker=ticker,
                    description=description,
                    sector=sector,
                    industry=industry,
                    logo_url=logo_url,
                )
            )
            db.commit()

    return {
        "description": description,
        "sector": sector,
        "industry": industry,
        "logo_url": logo_url,
    }
