"""Standardized async gRPC server setup with health checking and reflection."""

import asyncio
import logging
import signal
from collections.abc import Callable
from typing import Any

import grpc
from grpc_health.v1 import health, health_pb2, health_pb2_grpc
from grpc_reflection.v1alpha import reflection

from trading_lib.interceptors import LoggingInterceptor

logger = logging.getLogger(__name__)


async def create_server(
    add_servicer_fn: Callable[[Any, grpc.aio.Server], None],
    servicer: Any,
    port: int,
    service_names: list[str] | None = None,
) -> None:
    """Create and run an async gRPC server with health checking, reflection,
    and graceful shutdown.

    Args:
        add_servicer_fn: The generated add_*Servicer_to_server function.
        servicer: An instance of the servicer implementation.
        port: The port to listen on.
        service_names: Proto service names for reflection (e.g. "trading.MarketDataService").
    """
    server = grpc.aio.server(interceptors=[LoggingInterceptor()])

    # Register the service
    add_servicer_fn(servicer, server)

    # Health checking
    health_servicer = health.aio.HealthServicer()
    health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)
    await health_servicer.set("", health_pb2.HealthCheckResponse.SERVING)

    # Reflection
    reflection_names = [
        reflection.SERVICE_NAME,
        health_pb2.DESCRIPTOR.services_by_name["Health"].full_name,
    ]
    if service_names:
        reflection_names.extend(service_names)
    reflection.enable_server_reflection(reflection_names, server)

    listen_addr = f"[::]:{port}"
    server.add_insecure_port(listen_addr)

    logger.info("Starting gRPC server on %s", listen_addr)
    await server.start()

    # Graceful shutdown on SIGTERM/SIGINT
    shutdown_event = asyncio.Event()

    def _signal_handler() -> None:
        logger.info("Received shutdown signal")
        shutdown_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, _signal_handler)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            pass

    await shutdown_event.wait()
    logger.info("Shutting down gRPC server (5s grace period)")
    await server.stop(5)
    logger.info("Server stopped")
