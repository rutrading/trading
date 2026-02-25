import grpc
from fastapi import APIRouter, HTTPException
from generated import market_data_pb2, transformer_pb2
from api.grpc_client import market_data, transformer

router = APIRouter()


@router.get("/quote/{symbol}")
def quote(symbol: str):
    try:
        # Step 1: Fetch raw stock data from the Market Data service
        raw = market_data.Fetch(market_data_pb2.FetchRequest(symbol=symbol.upper()))

        print("\n[MarketData]")
        print(f"  symbol: {raw.symbol}")
        print(f"  price:  {raw.price}")
        print(f"  open:   {raw.open}")
        print(f"  volume: {raw.volume}")

        # Step 2: Pass raw data to Transformer to compute change values
        transformed = transformer.Transform(
            transformer_pb2.TransformRequest(raw_quote=raw)
        )

        print("\n[Transformer]")
        print(f"  symbol:         {transformed.symbol}")
        print(f"  price:          {transformed.price}")
        print(f"  change:         {transformed.change}")
        print(f"  change_percent: {transformed.change_percent}%")

        return {
            "raw": {
                "symbol": raw.symbol,
                "price": raw.price,
                "open": raw.open,
                "volume": raw.volume,
            },
            "transformed": {
                "symbol": transformed.symbol,
                "price": transformed.price,
                "change": transformed.change,
                "change_percent": transformed.change_percent,
            },
        }
    except grpc.RpcError as e:
        raise HTTPException(status_code=502, detail=e.details())
