"""FastAPI gateway that routes HTTP requests to gRPC services."""

import sys
from pathlib import Path

from fastapi import FastAPI

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "generated"))

from api.routers import hello, quotes  # noqa: E402

app = FastAPI()
app.include_router(hello.router)
app.include_router(quotes.router)
