from fastapi import FastAPI
from api.routers.grpc import hello as grpc_hello, quotes as grpc_quotes
from api.routers.no_grpc import hello as no_grpc_hello, quotes as no_grpc_quotes

app = FastAPI()

app.include_router(grpc_hello.router, prefix="/api/grpc")
app.include_router(grpc_quotes.router, prefix="/api/grpc")
app.include_router(no_grpc_hello.router, prefix="/api/no-grpc")
app.include_router(no_grpc_quotes.router, prefix="/api/no-grpc")
