# R U Trading

Paper trading web application that simulates stock market trading using real-time data, allowing users to practice investing strategies without financial risk.

Senior project for Rowan University, advised by Professor McKee.

**Team:** Kyle Graham Matzen (Scrum/Lead), Nitin Sobti (Scrum/Lead), Josh Odom, Lucas Souder, Sean Twomey

## Overview

- Authentication with account registration and session management
- Single quote endpoint that fetches real-time market data through the API pipeline

**Planned:**

- Virtual cash balance for simulated trading
- Dashboard for searching stocks, viewing live and historical price charts, and executing trades
- Portfolio tracking with holdings, average cost basis, unrealized gains/losses, and full transaction history
- Financial news integration from RSS/XML feeds displayed alongside stock data
- Watchlist for tracking saved stocks with current prices and daily changes
- Settings page for profile management and account actions

## Architecture

![System Architecture Diagram](.github/system_architecture_diagram.png)

*Last updated: February 19, 2026*

The Next.js frontend communicates with a FastAPI backend over REST. The backend fetches market data from [TwelveData](https://twelvedata.com/), computes derived fields, and stores normalized quotes in Postgres for caching. Authentication is handled by [Better Auth](https://www.better-auth.com/) on the Next.js server.

### Backend Flow

1. API receives `/api/quote?symbol=...`
2. Checks Postgres cache freshness
3. Fetches from TwelveData on cache miss
4. Computes indicators and signal
5. Upserts the quote into Postgres

### Database

Schema is defined in `web/src/db/schema.ts` using [Drizzle ORM](https://orm.drizzle.team/) (single source of truth). Python backend code uses SQLAlchemy models as read/write mappings against the same tables. Migrations are handled exclusively by Drizzle (`bun migrate` runs `drizzle-kit push`).

## Getting Started

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/), [Bun](https://bun.sh), [uv](https://docs.astral.sh/uv/getting-started/installation/)

```bash
bun install
bun setup
```

The setup script will start Postgres via Docker Compose, copy `.env.example` files, generate a `BETTER_AUTH_SECRET`, and install dependencies.

Then run the database migration and start:

```bash
bun migrate
bun dev
```

Open http://localhost:3000/login, create an account, and you'll see the dashboard.

## Testing

```bash
# API tests
cd backend
uv run --package trading-api pytest api/tests/

# Web tests
cd web
bun test
```

## Docker

For local database only:

```bash
docker compose up -d db
```

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for development setup and guidelines.

## License

MIT License. See [LICENSE](LICENSE) for details.

## AI Use Statement

The following contributions were made to this README by Opus 4.6 Extended (Anthropic), solely for the README and organization of separating the project into its current folder structure:

- Grammar and Spelling Check
- Minor Wording and Clarity Improvements
- Final Proofreading of the Product Description
- Feedback on Organization and Structure
