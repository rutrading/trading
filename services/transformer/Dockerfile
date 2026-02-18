FROM python:3.13-slim

WORKDIR /app/services/transformer

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY lib/ /app/lib/
COPY proto/ /proto/
COPY services/transformer/ .

RUN uv sync --frozen --no-dev

RUN mkdir -p generated && \
    uv run python -m grpc_tools.protoc \
    -I/proto \
    --python_out=generated \
    --pyi_out=generated \
    --grpc_python_out=generated \
    /proto/*.proto && \
    touch generated/__init__.py

RUN for f in generated/*_pb2.py generated/*_pb2_grpc.py; do \
    [ -f "$f" ] && sed -i 's/^import \(.*_pb2\) as/from . import \1 as/' "$f"; \
    done

EXPOSE 50052

CMD ["uv", "run", "python", "-m", "app.server"]
