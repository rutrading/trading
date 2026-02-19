ARG BASE_IMAGE=python:3.13-slim
FROM ${BASE_IMAGE}

COPY backend/services/persistence/ services/persistence/

RUN mkdir -p services/persistence/generated && \
    uv run python -m grpc_tools.protoc \
    -Ilib/proto \
    --python_out=services/persistence/generated \
    --pyi_out=services/persistence/generated \
    --grpc_python_out=services/persistence/generated \
    lib/proto/trading/*.proto && \
    touch services/persistence/generated/__init__.py

RUN if [ -d services/persistence/generated/trading ]; then \
    mv services/persistence/generated/trading/* services/persistence/generated/ && \
    rmdir services/persistence/generated/trading; \
    fi

RUN for f in services/persistence/generated/*_pb2.py services/persistence/generated/*_pb2_grpc.py; do \
    [ -f "$f" ] && sed -i 's/from trading import \(.*_pb2\)/from . import \1/' "$f"; \
    done

EXPOSE 50053

WORKDIR /app/services/persistence
CMD ["uv", "run", "python", "-m", "app.server"]
