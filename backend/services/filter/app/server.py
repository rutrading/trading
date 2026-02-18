"""Filter gRPC server entrypoint."""

import asyncio

from trading_lib import bootstrap, create_server

from app.service import FilterServicer


async def main() -> None:
    config = bootstrap(__file__)

    from generated import filter_pb2_grpc

    servicer = FilterServicer(config)
    port = int(config.filter_host.split(":")[-1])

    await create_server(
        add_servicer_fn=filter_pb2_grpc.add_FilterServiceServicer_to_server,
        servicer=servicer,
        port=port,
        service_names=["trading.FilterService"],
    )


if __name__ == "__main__":
    asyncio.run(main())
