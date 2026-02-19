ARG BASE_IMAGE=python:3.13-slim
FROM ${BASE_IMAGE}

COPY backend/services/transformer/ services/transformer/

RUN mkdir -p services/transformer/generated && \
    uv run python -m grpc_tools.protoc \
    -Ilib/proto \
    --python_out=services/transformer/generated \
    --pyi_out=services/transformer/generated \
    --grpc_python_out=services/transformer/generated \
    lib/proto/trading/*.proto && \
    touch services/transformer/generated/__init__.py

RUN if [ -d services/transformer/generated/trading ]; then \
    mv services/transformer/generated/trading/* services/transformer/generated/ && \
    rmdir services/transformer/generated/trading; \
    fi

RUN for f in services/transformer/generated/*_pb2.py services/transformer/generated/*_pb2_grpc.py; do \
    [ -f "$f" ] && sed -i 's/from trading import \(.*_pb2\)/from . import \1/' "$f"; \
    done

EXPOSE 50052

WORKDIR /app/services/transformer
CMD ["uv", "run", "python", "-m", "app.server"]
