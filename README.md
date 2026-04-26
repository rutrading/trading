# R U Trading

<p align="center"><a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js"></a><a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"></a><a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI"></a><a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python"></a><a href="https://www.postgresql.org/"><img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="Postgres"></a><a href="https://redis.io/"><img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis"></a><a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white" alt="Bun"></a></p>

Paper trading web application that simulates stock market trading using real-time data, allowing users to practice investing strategies without financial risk.

Senior project for Rowan University, advised by Professor McKee.

**Team:** Kyle Graham Matzen (Scrum/Lead), Nitin Sobti (Scrum/Lead), Josh Odom, Lucas Souder, Sean Twomey

## Architecture

![System Architecture](.github/system-architecture.png)

A Next.js frontend talks to a FastAPI backend over REST, with a WebSocket channel for live quotes. Market data comes from [Alpaca](https://alpaca.markets/) and is cached in Redis (hot) and Postgres (warm) before falling back to Alpaca REST. All outbound Alpaca calls go through a shared sliding-window rate limiter.

The schema lives in `web/src/db/schema.ts` as the single source of truth via [Drizzle ORM](https://orm.drizzle.team/), with the Python backend reading and writing through SQLAlchemy models against the same tables. Migrations are handled exclusively by Drizzle (`bun db:push`).

## Overview

- Account registration and sessions powered by [Better Auth](https://www.better-auth.com/)
- Portfolio dashboard with positions, holdings, orders, and activity history
- Stock detail pages with live price, candlestick charts, and trade execution
- Order placement with buying-power reservations and a full transaction ledger
- Watchlists, symbol search with trending tickers, and per-symbol financial news
- Quotes from [Alpaca](https://alpaca.markets/) backed by three-tier caching across Redis, Postgres, and REST, plus a live WebSocket stream with per-user subscriptions
- Company profiles from Alpha Vantage with logos from [Logo.dev](https://logo.dev), themed to the user's preference

## Getting Started

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/), [Bun](https://bun.sh), [uv](https://docs.astral.sh/uv/getting-started/installation/)

```bash
bun install
bun setup
```

The setup script will start Postgres and Redis via Docker Compose, copy `.env.example` files, generate a `BETTER_AUTH_SECRET`, and install dependencies.

Then push the database schema and start:

```bash
bun db:push
bun dev
```

Open http://localhost:3000/login, create an account, and you'll see the dashboard.

## Scripts

```bash
bun setup        # first-time project setup (Docker, env files, deps)
bun dev          # start web + api concurrently
bun db:push      # push Drizzle schema to Postgres (no migration files)
bun db:generate  # generate a migration SQL file from schema diff
bun db:migrate   # run pending migration files
bun db:studio    # open Drizzle Studio GUI
```

## Testing

```bash
# API tests
cd backend
uv run pytest tests/

# Web tests
cd web
bun test
```

## Docker

For local services only:

```bash
docker compose up -d
```

## AI Use Statement

The following contributions were made to this README by Opus 4.6 Extended (Anthropic), solely for the README and organization of separating the project into its current folder structure:

- Grammar and Spelling Check
- Minor Wording and Clarity Improvements
- Final Proofreading of the Product Description
- Feedback on Organization and Structure
