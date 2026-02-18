"""Transformer gRPC server entrypoint."""

import asyncio
import logging

from trading_lib import create_server, get_config

from app.service import TransformerServicer


async def main() -> None:
    config = get_config()
    logging.basicConfig(level=config.log_level)

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
