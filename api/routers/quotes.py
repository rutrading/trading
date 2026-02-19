"""Quote routes demonstrating chained gRPC calls with TwelveData."""

import grpc
from fastapi import APIRouter, HTTPException

import market_data_pb2
import transformer_pb2
from api.grpc_client import market_data, transformer

router = APIRouter()


@router.get("/quote/{symbol}")
def quote(symbol: str):
    try:
        raw = market_data.Fetch(market_data_pb2.FetchRequest(symbol=symbol.upper()))
        transformed = transformer.Transform(
            transformer_pb2.TransformRequest(raw_quote=raw)
        )
        return {
            "symbol": transformed.symbol,
            "price": transformed.price,
            "change": transformed.change,
            "change_percent": transformed.change_percent,
        }
    except grpc.RpcError as e:
        raise HTTPException(status_code=502, detail=e.details())
