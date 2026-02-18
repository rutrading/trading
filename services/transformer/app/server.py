"""Transformer gRPC server entrypoint."""

import asyncio

from trading_lib import bootstrap, create_server

from app.service import TransformerServicer


async def main() -> None:
    config = bootstrap(__file__)

    from generated import transformer_pb2_grpc

    servicer = TransformerServicer(config)
    port = int(config.transformer_host.split(":")[-1])

    await create_server(
        add_servicer_fn=transformer_pb2_grpc.add_TransformerServiceServicer_to_server,
        servicer=servicer,
        port=port,
        service_names=["trading.TransformerService"],
    )


if __name__ == "__main__":
    asyncio.run(main())
