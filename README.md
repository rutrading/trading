# R U Trading

Paper trading web app built with Next.js, FastAPI, and gRPC.

Senior project for Rowan University, advised by Professor McKee.

**Team:** Kyle Graham Matzen (Scrum/Lead), Nitin Sobti (Scrum/Lead), Josh Odom, Lucas Souder, Sean Twomey

## Getting Started

**Prerequisites**
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Bun](https://bun.sh)
- [uv](https://docs.astral.sh/uv/getting-started/installation/)

**Setup**

```bash
bun install
bun setup
```

The setup script will:
- Start Postgres via Docker Compose
- Copy `.env.example` files and generate a `BETTER_AUTH_SECRET`
- Install web dependencies (`bun install`)
- Install API dependencies (`uv sync`)

Then run the database migration and start the servers:

```bash
# Run database migration
bun migrate

# Web (Next.js)
bun dev

# API (FastAPI) — in a separate terminal
cd api && uv run uvicorn app.main:app --reload
```

Then go to http://localhost:3000/login, create an account, and you'll see the dashboard.

## gRPC Services

The backend uses a gRPC pipeline for market data processing. Services communicate over protobuf and run as separate Docker containers.

**Architecture**

```
Frontend --REST--> FastAPI --gRPC--> MarketData -> Transformer -> Filter -> DB
                                         |
                                    Scheduler (background, interval-based)
```

**Services**

| Service | Port | Description |
|---|---|---|
| market-data | 50051 | Fetches quotes from TwelveData |
| transformer | 50052 | Normalizes and enriches raw data |
| filter | 50053 | Filters relevant data, persists to DB |
| scheduler | - | Polls pipeline on an interval, adjusts by market hours |

**Running the services**

```bash
# Generate proto code (run once, or after changing .proto files)
cd services/market_data && uv sync && cd ../..
python scripts/gen_proto.py

# Start all services via Docker Compose
docker compose up -d

# Or run a single service locally (example: market-data)
cd services/market_data
uv sync
python -m app.server
```

**Proto definitions** live in `proto/`. Shared library code lives in `lib/`. Run `python scripts/gen_proto.py` to regenerate code after editing `.proto` files.

## Testing

```bash
# API tests
cd api
uv run pytest

# Service tests (example: transformer)
cd services/transformer
uv sync
uv run pytest

# Web tests
cd web
bun test
```

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for development setup and guidelines.

## License

MIT License. See [LICENSE](LICENSE) for details.
