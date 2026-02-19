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
- Install Python dependencies (`uv sync`)
- Generate gRPC proto code

Then run the database migration and start:

```bash
# Push database schema (Drizzle)
bun migrate

# Start everything (web + API + gRPC services)
bun dev
```

Then go to http://localhost:3000/login, create an account, and you'll see the dashboard.

## Architecture

```
Frontend (Next.js) --REST--> FastAPI --gRPC--> MarketData -> Transformer -> Persistence -> DB
                                                    |
                                               Scheduler (background, interval-based)
```

The frontend talks to a FastAPI gateway over REST. The gateway fans out to gRPC microservices for market data processing. All services share a single Postgres database.

### Database

Schema is defined in `web/src/db/schema.ts` using [Drizzle ORM](https://orm.drizzle.team/) (single source of truth). Python services use SQLAlchemy models as read/write mappings against the same tables. Migrations are handled exclusively by Drizzle (`bun migrate` runs `drizzle-kit push`).

[Better Auth](https://www.better-auth.com/) handles authentication using the Drizzle adapter (`better-auth/minimal` for smaller bundles) with experimental joins enabled for 2-3x faster session lookups.

## gRPC Services

| Service | Port | Description |
|---|---|---|
| market-data | 50051 | Fetches quotes from TwelveData |
| transformer | 50052 | Normalizes and enriches raw data |
| persistence | 50053 | Persists transformed data to DB |
| scheduler | - | Polls pipeline on an interval, adjusts by market hours |

Proto definitions live in `backend/lib/proto/`. Shared Python library code lives in `backend/lib/trading_lib/`.

If you edit `.proto` files, regenerate code:

```bash
bun dev:gen
```

## Scripts

| Script | Description |
|---|---|
| `bun dev` | Start everything (web + API + all gRPC services) |
| `bun dev:gen` | Regenerate gRPC proto code |
| `bun migrate` | Push schema changes to database |
| `bun setup` | First-time project setup |

## Project Structure

```
trading/
  web/                          # Next.js frontend
    src/
      db/
        schema.ts               # Drizzle schema (source of truth)
        index.ts                # Drizzle client
      lib/
        auth.ts                 # Better Auth config
        auth-client.ts          # Client-side auth
    drizzle.config.ts           # Drizzle Kit config
  backend/
    api/                        # FastAPI gateway
    lib/
      proto/trading/            # Protobuf definitions
      trading_lib/              # Shared Python library
        models.py               # SQLAlchemy models (read/write mapping)
        config.py               # Shared config
    services/
      market_data/              # gRPC: TwelveData fetcher
      transformer/              # gRPC: data enrichment
      persistence/              # gRPC: DB writer
      scheduler/                # gRPC: background polling
    scripts/
      gen_proto.py              # Proto code generator
      setup.ts                  # Setup script
  docker-compose.yml
  package.json
```

## Testing

```bash
# Service tests (example: transformer)
cd backend/services/transformer
uv run pytest

# Integration tests
cd backend
uv run pytest tests/

# Web tests
cd web
bun test
```

## Docker

To run gRPC services via Docker instead of locally:

```bash
docker compose up -d market-data transformer persistence scheduler
```

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for development setup and guidelines.

## License

MIT License. See [LICENSE](LICENSE) for details.
