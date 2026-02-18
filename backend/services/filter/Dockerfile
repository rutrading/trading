ARG BASE_IMAGE=python:3.13-slim
FROM ${BASE_IMAGE}

COPY backend/services/filter/ services/filter/

RUN mkdir -p services/filter/generated && \
    uv run python -m grpc_tools.protoc \
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
CMD ["uv", "run", "python", "-m", "app.server"]
