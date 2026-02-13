# R U Trading

Paper trading web app built with Next.js and FastAPI.

Senior project for Rowan University, advised by Professor McKee.

**Team:** Kyle Graham (Scrum/Lead), Nitin Sobti (Scrum/Lead), Josh Odom, Lucas Souder, Sean Twomey

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
