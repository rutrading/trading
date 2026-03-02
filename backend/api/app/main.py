import logging
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_config

from app.routers import health, historical_bars, quotes

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
config = get_config()
logging.basicConfig(
    level=config.log_level,
    format="%(asctime)s.%(msecs)03d %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

app = FastAPI(title="R U Trading API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(quotes.router, prefix="/api")
app.include_router(historical_bars.router, prefix="/api")
