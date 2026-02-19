ARG BASE_IMAGE=python:3.13-slim
FROM ${BASE_IMAGE}

COPY backend/services/scheduler/ services/scheduler/

RUN mkdir -p services/scheduler/generated && \
    uv run python -m grpc_tools.protoc \
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
CMD ["uv", "run", "python", "-m", "app.server"]
