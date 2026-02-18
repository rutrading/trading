"""gRPC server interceptors for cross-cutting concerns."""

import logging
import time
from typing import Any

import grpc
from grpc import aio

logger = logging.getLogger(__name__)


class LoggingInterceptor(aio.ServerInterceptor):
    """Logs every RPC call with method name, duration, and status code."""

    async def intercept_service(
        self,
        continuation: Any,
        handler_call_details: grpc.HandlerCallDetails,
    ) -> Any:
        method = handler_call_details.method
        start = time.perf_counter()

        handler = await continuation(handler_call_details)

        duration_ms = (time.perf_counter() - start) * 1000
        logger.info("%s resolved in %.2fms", method, duration_ms)

        return handler
