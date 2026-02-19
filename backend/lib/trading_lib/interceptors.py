"""gRPC server interceptors for cross-cutting concerns."""

import logging
import time
from typing import Any

import grpc
from grpc import aio

logger = logging.getLogger(__name__)


class _TimedHandler(grpc.RpcMethodHandler):
    """Wraps an RPC handler to measure actual execution time."""

    def __init__(self, method: str, inner: grpc.RpcMethodHandler) -> None:
        self._method = method
        self._inner = inner

        # Copy all attributes from the inner handler
        self.request_streaming = inner.request_streaming
        self.response_streaming = inner.response_streaming
        self.request_deserializer = inner.request_deserializer
        self.response_serializer = inner.response_serializer
        self.unary_unary = None
        self.unary_stream = None
        self.stream_unary = None
        self.stream_stream = None

        # Wrap the appropriate handler
        if inner.unary_unary:
            self.unary_unary = self._wrap(inner.unary_unary)
        elif inner.unary_stream:
            self.unary_stream = self._wrap(inner.unary_stream)
        elif inner.stream_unary:
            self.stream_unary = self._wrap(inner.stream_unary)
        elif inner.stream_stream:
            self.stream_stream = self._wrap(inner.stream_stream)

    def _wrap(self, fn):
        method = self._method

        async def timed(request, context):
            start = time.perf_counter_ns()
            result = await fn(request, context)
            elapsed_ms = (time.perf_counter_ns() - start) / 1_000_000
            logger.info("%s completed in %.2fms", method, elapsed_ms)
            return result

        return timed


class LoggingInterceptor(aio.ServerInterceptor):
    """Logs every RPC call with method name and execution duration in ms."""

    async def intercept_service(
        self,
        continuation: Any,
        handler_call_details: grpc.HandlerCallDetails,
    ) -> Any:
        method = handler_call_details.method
        handler = await continuation(handler_call_details)

        if handler is None:
            return handler

        return _TimedHandler(method, handler)
