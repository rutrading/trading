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

# Start everything (web + API)
bun dev
```

**Database**
```bash
docker compose up -d db
```

**Running Tests**
```bash
# API
cd backend/api
uv run pytest

# API
cd backend
uv run --package trading-api pytest api/tests/

# Web
cd web
bun test
```

## Pull Requests

- Keep changes focused and atomic
- Write clear commit messages
- Test your changes locally before pushing

## Commit Message Format

- `feat(frontend): add webhook dashboard`
- `feat(backend): add retry mechanism`
- `fix(frontend): correct login redirect`
- `fix(backend): handle expired tokens`
- `chore: clean up env files`
- `ci: update workflow triggers`

## License

By contributing, you agree your code will be licensed under the MIT License.
