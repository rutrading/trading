FROM python:3.13-slim AS base

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY backend/pyproject.toml backend/uv.lock* ./
COPY backend/lib/ lib/

RUN uv sync --frozen --no-dev

FROM base AS market-data

COPY backend/services/market_data/ services/market_data/

RUN mkdir -p services/market_data/generated && \
    uv run python -m grpc_tools.protoc \
    -Ilib/proto \
    --python_out=services/market_data/generated \
    --pyi_out=services/market_data/generated \
    --grpc_python_out=services/market_data/generated \
    lib/proto/trading/*.proto && \
    touch services/market_data/generated/__init__.py

RUN if [ -d services/market_data/generated/trading ]; then \
    mv services/market_data/generated/trading/* services/market_data/generated/ && \
    rmdir services/market_data/generated/trading; \
    fi

RUN for f in services/market_data/generated/*_pb2.py services/market_data/generated/*_pb2_grpc.py; do \
    [ -f "$f" ] && sed -i 's/from trading import \(.*_pb2\)/from . import \1/' "$f"; \
    done

EXPOSE 50051

WORKDIR /app/services/market_data
CMD ["uv", "run", "python", "-m", "app.server"]
