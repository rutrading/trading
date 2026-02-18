"""Persistence gRPC server entrypoint."""

import asyncio

from trading_lib import bootstrap, create_server

from app.service import PersistenceServicer


async def main() -> None:
    config = bootstrap(__file__)

    from generated import persistence_pb2_grpc

    servicer = PersistenceServicer(config)
    port = int(config.persistence_host.split(":")[-1])

    await create_server(
        add_servicer_fn=persistence_pb2_grpc.add_PersistenceServiceServicer_to_server,
        servicer=servicer,
        port=port,
        service_names=["trading.PersistenceService"],
    )


if __name__ == "__main__":
    asyncio.run(main())
