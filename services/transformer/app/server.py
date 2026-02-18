"""Transformer gRPC server entrypoint."""

import asyncio
import logging
from pathlib import Path

from dotenv import load_dotenv

from trading_lib import create_server, get_config

from app.service import TransformerServicer

# Load .env from this service's directory, not cwd
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


async def main() -> None:
    config = get_config()
    logging.basicConfig(
        level=config.log_level,
        format="%(asctime)s.%(msecs)03d %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

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
