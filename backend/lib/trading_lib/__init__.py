"""Trading library - shared utilities for all gRPC services.

This library provides common functionality used across all services:
- Configuration loading from environment variables
- Database session management
- gRPC server creation with health checks
- gRPC channel creation for service-to-service communication
- Logging setup
"""

import asyncio
import logging
from pathlib import Path
from typing import Any, Callable

from dotenv import load_dotenv

from trading_lib.channel import create_channel
from trading_lib.config import Config, get_config
from trading_lib.db import db_session
from trading_lib.server import create_server

__all__ = [
    "Config",
    "bootstrap",
    "create_channel",
    "create_server",
    "db_session",
    "get_config",
    "run_service",
]


def bootstrap(caller_file: str) -> Config:
    """One-call setup for any service.

    This function:
    1. Loads .env file from the service's directory
    2. Configures logging with timestamps
    3. Returns a Config object with all settings

    Usage:
        config = bootstrap(__file__)
    """
    # Find the service's root directory (parent of app/)
    service_dir = Path(caller_file).resolve().parent.parent
    load_dotenv(service_dir / ".env")

    config = get_config()

    logging.basicConfig(
        level=config.log_level,
        format="%(asctime)s.%(msecs)03d %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    return config


def run_service(
    servicer_class: type,
    service_name: str,
    add_servicer_fn: Callable[[Any, Any], None],
    proto_service_name: str,
) -> None:
    """Run a gRPC service with standard setup.

    This is a convenience function that handles all the boilerplate
    for starting a gRPC server:
    1. Loads configuration and sets up logging
    2. Creates the servicer instance
    3. Starts the gRPC server with health checks

    Args:
        servicer_class: The servicer class to instantiate (e.g., MarketDataServicer)
        service_name: Name used for config lookup (e.g., "market_data" -> MARKET_DATA_HOST)
        add_servicer_fn: The generated add_*Servicer_to_server function
        proto_service_name: Full proto service name (e.g., "trading.MarketDataService")

    Example:
        from trading_lib import run_service
        from app.service import MarketDataServicer
        from generated import market_data_pb2_grpc

        if __name__ == "__main__":
            run_service(
                servicer_class=MarketDataServicer,
                service_name="market_data",
                add_servicer_fn=market_data_pb2_grpc.add_MarketDataServiceServicer_to_server,
                proto_service_name="trading.MarketDataService",
            )
    """

    async def main():
        # Step 1: Load config and setup logging
        config = bootstrap(__file__)

        # Step 2: Create the servicer
        servicer = servicer_class(config)

        # Step 3: Get the port from config (e.g., "localhost:50051" -> 50051)
        host_attr = f"{service_name}_host"
        host = getattr(config, host_attr)
        port = int(host.split(":")[-1])

        # Step 4: Start the server
        await create_server(
            add_servicer_fn=add_servicer_fn,
            servicer=servicer,
            port=port,
            service_names=[proto_service_name],
        )

    asyncio.run(main())
