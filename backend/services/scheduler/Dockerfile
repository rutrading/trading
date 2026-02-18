FROM python:3.13-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY backend/pyproject.toml backend/uv.lock* ./
COPY backend/lib/ lib/

RUN uv sync --frozen --no-dev --package scheduler

COPY backend/services/scheduler/ services/scheduler/

RUN uv run --package scheduler python -m grpc_tools.protoc \
    -Ilib/proto \
    --python_out=services/scheduler/generated \
    --pyi_out=services/scheduler/generated \
    --grpc_python_out=services/scheduler/generated \
    lib/proto/trading/*.proto && \
    touch services/scheduler/generated/__init__.py

RUN if [ -d services/scheduler/generated/trading ]; then \
    mv services/scheduler/generated/trading/* services/scheduler/generated/ && \
    rmdir services/scheduler/generated/trading; \
    fi

RUN for f in services/scheduler/generated/*_pb2.py services/scheduler/generated/*_pb2_grpc.py; do \
    [ -f "$f" ] && sed -i 's/from trading import \(.*_pb2\)/from . import \1/' "$f"; \
    done

WORKDIR /app/services/scheduler
CMD ["uv", "run", "--package", "scheduler", "python", "-m", "app.server"]
