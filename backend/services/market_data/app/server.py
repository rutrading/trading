"""Market data gRPC server entrypoint."""

import asyncio

from trading_lib import bootstrap, create_server

from app.service import MarketDataServicer


async def main() -> None:
    config = bootstrap(__file__)

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
