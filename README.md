# R U Trading

Paper trading web app.

- **Frontend**: Next.js (App Router) + Tailwind CSS — `web/`
- **Backend**: Python FastAPI — `api/`
- **Database**: PostgreSQL (Docker)
- **Auth**: better-auth (Next.js handles login/registration, Python validates JWTs)

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Bun](https://bun.sh)
- [uv](https://docs.astral.sh/uv/)

## Setup

### 1. Start Postgres

```bash
docker compose up -d
```

### 2. Set up the web app

```bash
cd web
cp .env.example .env.local
bun install
bunx @better-auth/cli migrate   # creates auth tables
bun dev                          # http://localhost:3000
```

### 3. Set up the API

```bash
cd api
cp .env.example .env
uv run uvicorn app.main:app --reload   # http://localhost:8000
```

### 4. Try it out

1. Go to http://localhost:3000/login
2. Create an account (Sign Up)
3. You'll land on the dashboard: **Hello {your name}**
4. The Python API health check: http://localhost:8000/api/health

## Running Tests

```bash
cd api
uv run pytest
```

## Project Structure

```
trading/
├── web/                # Next.js frontend
│   ├── src/
│   │   ├── app/        # Pages and API routes
│   │   ├── lib/        # Auth config
│   │   └── components/ # React components
│   └── package.json
├── api/                # Python FastAPI backend
│   ├── app/
│   │   ├── main.py     # FastAPI app
│   │   ├── auth.py     # JWT validation
│   │   ├── database.py # SQLAlchemy setup
│   │   └── routers/    # API routes
│   ├── tests/
│   └── pyproject.toml
└── docker-compose.yml  # Postgres
```
