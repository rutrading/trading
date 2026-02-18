"""Market data gRPC server entrypoint."""

import asyncio
import logging

from trading_lib import create_server, get_config

from app.service import MarketDataServicer


async def main() -> None:
    config = get_config()
    logging.basicConfig(level=config.log_level)

    # Import generated code
    from generated import market_data_pb2_grpc

    servicer = MarketDataServicer(config)
    port = int(config.market_data_host.split(":")[-1])

    await create_server(
        add_servicer_fn=market_data_pb2_grpc.add_MarketDataServiceServicer_to_server,
        servicer=servicer,
        port=port,
        service_names=["trading.MarketDataService"],
    )


if __name__ == "__main__":
    asyncio.run(main())
