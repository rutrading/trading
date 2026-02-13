# R U Trading

Paper trading web app built with Next.js and FastAPI.

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

This starts Postgres, creates `.env` files with generated secrets, and installs dependencies.

Then run the database migration and start both servers:

```bash
# Run database migration
bun migrate

# Web (Next.js)
bun dev

# API (FastAPI) — in a separate terminal
cd api && uv run uvicorn app.main:app --reload
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
