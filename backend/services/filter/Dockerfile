FROM python:3.13-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY backend/pyproject.toml backend/uv.lock* ./
COPY backend/lib/ lib/

RUN uv sync --frozen --no-dev --package filter

COPY backend/services/filter/ services/filter/

RUN uv run --package filter python -m grpc_tools.protoc \
    -Ilib/proto \
    --python_out=services/filter/generated \
    --pyi_out=services/filter/generated \
    --grpc_python_out=services/filter/generated \
    lib/proto/trading/*.proto && \
    touch services/filter/generated/__init__.py

RUN if [ -d services/filter/generated/trading ]; then \
    mv services/filter/generated/trading/* services/filter/generated/ && \
    rmdir services/filter/generated/trading; \
    fi

RUN for f in services/filter/generated/*_pb2.py services/filter/generated/*_pb2_grpc.py; do \
    [ -f "$f" ] && sed -i 's/from trading import \(.*_pb2\)/from . import \1/' "$f"; \
    done

EXPOSE 50053

WORKDIR /app/services/filter
CMD ["uv", "run", "--package", "filter", "python", "-m", "app.server"]
