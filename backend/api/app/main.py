from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from trading_lib import bootstrap

from app.routers import health, historical_bars, quotes

bootstrap(__file__)

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
