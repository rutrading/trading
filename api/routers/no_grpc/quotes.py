import os

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException

load_dotenv()

router = APIRouter()
API_KEY = os.environ["TWELVE_DATA_API_KEY"]
client = httpx.Client(base_url="https://api.twelvedata.com")


@router.get("/quote/{symbol}")
def quote(symbol: str):
    data = client.get(
        "/quote", params={"symbol": symbol.upper(), "apikey": API_KEY}
    ).json()

    if "code" in data:
        raise HTTPException(status_code=404, detail=data.get("message", "Not found"))

    price = float(data["close"])
    open_price = float(data["open"])
    volume = float(data["volume"])

    change = price - open_price
    change_percent = (change / open_price * 100) if open_price else 0

    return {
        "raw": {
            "symbol": data["symbol"],
            "price": price,
            "open": open_price,
            "volume": volume,
        },
        "transformed": {
            "symbol": data["symbol"],
            "price": price,
            "change": round(change, 4),
            "change_percent": round(change_percent, 4),
        },
    }
