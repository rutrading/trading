# R U Trading - Contributing

## Development Setup

**Prerequisites**
- Bun 1.3+
- Python 3.13+ with [uv](https://docs.astral.sh/uv/getting-started/installation/)
- Docker and Docker Compose

**Getting Started**
```bash
git clone https://github.com/rutrading/trading.git
cd trading
bun install
bun setup

# Run database migration
bun migrate

# Start everything (web + API + gRPC services)
bun dev
```

**gRPC Services**
```bash
# Generate proto code
bun dev:gen

# Start all services via Docker
docker compose up -d

# Or run one locally
cd backend/services/market_data && uv sync && uv run python -m app.server
```

**Running Tests**
```bash
# API
cd backend/api
uv run pytest

# Services
cd backend/services/transformer
uv run pytest

# Integration
cd backend
uv run pytest tests/

# Web
cd web
bun test
```

## Pull Requests

- Keep changes focused and atomic
- Write clear commit messages
- Test your changes locally before pushing

## Commit Message Format

- `feat(web): add portfolio chart`
- `feat(api): add trade endpoint`
- `feat(services): add news feed parser`
- `fix(web): correct login redirect`
- `fix(api): handle expired tokens`
- `refactor(services): rename GetQuote to Fetch`
- `chore: clean up env files`
- `ci: update workflow triggers`

## License

By contributing, you agree your code will be licensed under the MIT License.
