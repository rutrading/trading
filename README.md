# R U Trading

<p align="center">
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-1.3+-black.svg" alt="Bun"></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.13+-blue.svg" alt="Python"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5+-blue.svg" alt="TypeScript"></a>
  <a href="https://www.postgresql.org/"><img src="https://img.shields.io/badge/Postgres-16-blue.svg" alt="Postgres"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

Paper trading web app for Rowan University.

## Getting Started

**Prerequisites**
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Bun](https://bun.sh)
- [uv](https://docs.astral.sh/uv/)

**Setup**

```bash
# Start Postgres
docker compose up -d

# Web (Next.js)
cd web
cp .env.example .env.local
bun install
bunx @better-auth/cli migrate
bun dev

# API (FastAPI) — in a separate terminal
cd api
cp .env.example .env
uv run uvicorn app.main:app --reload
```

Then go to http://localhost:3000/login, create an account, and you'll see the dashboard.

## Testing

```bash
# API tests
cd api
uv run pytest

# Web tests
cd web
bun test
```

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for development setup and guidelines.

## License

MIT License. See [LICENSE](LICENSE) for details.
