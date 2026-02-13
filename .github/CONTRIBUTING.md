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

# Web
bun dev

# API (separate terminal)
cd api && uv run uvicorn app.main:app --reload
```

**Running Tests**
```bash
# API
cd api
uv run pytest

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
- `fix(web): correct login redirect`
- `fix(api): handle expired tokens`

## License

By contributing, you agree your code will be licensed under the MIT License.
