FROM python:3.13-slim

WORKDIR /app/services/market_data

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy shared library (../../lib relative to workdir = /app/lib)
COPY lib/ /app/lib/

# Copy proto definitions
COPY proto/ /proto/

# Copy service code
COPY services/market_data/ .

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

# Fix imports in generated files to use relative imports
RUN for f in generated/*_pb2.py generated/*_pb2_grpc.py; do \
    [ -f "$f" ] && sed -i 's/^import \(.*_pb2\) as/from . import \1 as/' "$f"; \
    done

EXPOSE 50051

CMD ["uv", "run", "python", "-m", "app.server"]
