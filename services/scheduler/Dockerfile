FROM python:3.13-slim

WORKDIR /app/services/scheduler

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy shared library (../../lib relative to workdir = /app/lib)
COPY lib/ /app/lib/

# Copy proto definitions
COPY proto/ /proto/

# Copy service code
COPY services/scheduler/ .

# Install dependencies
RUN uv sync --frozen --no-dev

# Generate proto code
RUN mkdir -p generated && \
    uv run python -m grpc_tools.protoc \
    -I/proto \
    --python_out=generated \
    --pyi_out=generated \
    --grpc_python_out=generated \
    /proto/*.proto && \
    touch generated/__init__.py

# Fix imports in generated gRPC files
RUN for f in generated/*_pb2_grpc.py; do \
    sed -i 's/^import \(.*_pb2\) as/from . import \1 as/' "$f"; \
    done

CMD ["uv", "run", "python", "-m", "app.server"]
