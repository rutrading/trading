# gRPC

A [gRPC](https://grpc.io/docs/what-is-grpc/introduction/) microservice pipeline in Python where a FastAPI gateway chains two gRPC services via [unary RPCs](https://grpc.io/docs/what-is-grpc/core-concepts/#unary-rpc) and each service processes the data before the result returns in one round trip.

Services are defined using [Protocol Buffers](https://protobuf.dev/overview) in the `proto/` directory. Python stubs are auto-generated from those `.proto` files using [grpc_tools](https://grpc.io/docs/languages/python/quickstart/#grpc-tools) and output to `generated/`. The gateway creates a [stub](https://grpc.io/docs/what-is-grpc/core-concepts/#using-the-api) (client) for each service over a [channel](https://grpc.io/docs/what-is-grpc/core-concepts/#channels) and orchestrates calls in sequence.

## Routes

| Route | Services Used | Description |
|---|---|---|
| `GET /hello` | Market Data | Returns `"Hello World"` from the Market Data service |
| `GET /hello/{name}` | Market Data, Transformer | Fetches `"Hello World"` from Market Data, passes it to Transformer which replaces `"World"` with the given name |
| `GET /quote/{symbol}` | Market Data, Transformer | Fetches a live stock quote from [TwelveData](https://twelvedata.com/) via Market Data, passes it to Transformer which computes change and change percent |

## Services

| Service | Port | RPCs |
|---|---|---|
| Market Data | 50051 | `Fetch` (stock quote from TwelveData), `Greet` (returns Hello World) |
| Transformer | 50052 | `Transform` (computes derived values), `Personalize` (string replacement) |

## Getting Started

**Prerequisites:** Python 3.13+, [uv](https://docs.astral.sh/uv/getting-started/installation/)

```bash
cp .env.example .env
```

Add your [TwelveData API key](https://twelvedata.com/docs) to `.env`, then install dependencies and generate gRPC code:

```bash
uv sync
uv run python gen_proto.py
```

Run each gRPC service in its own terminal:

```bash
uv run python services/market_data.py
uv run python services/transformer.py
```

Run the gateway:

```bash
uv run uvicorn api.main:app --reload
```

Try `http://localhost:8000/hello`, `http://localhost:8000/hello/Kyle`, or `http://localhost:8000/quote/AAPL`.

After editing any `.proto` files, run `uv run python gen_proto.py` to regenerate the `generated/` directory.

## Resources

- [Introduction to gRPC](https://grpc.io/docs/what-is-grpc/introduction/)
- [Core concepts (unary RPCs, channels, stubs)](https://grpc.io/docs/what-is-grpc/core-concepts/)
- [Python gRPC quickstart](https://grpc.io/docs/languages/python/quickstart/)
- [Protocol Buffers language guide (proto3)](https://protobuf.dev/programming-guides/proto3)
- [TwelveData API docs](https://twelvedata.com/docs)
