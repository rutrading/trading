"""Shared gRPC channel creation with keepalive and deadline defaults."""

import grpc


def create_channel(target: str) -> grpc.aio.Channel:
    """Create a reusable async gRPC channel with keepalive configured.

    Args:
        target: The host:port of the gRPC server.

    Returns:
        A configured async gRPC channel.
    """
    options = [
        ("grpc.keepalive_time_ms", 10000),
        ("grpc.keepalive_timeout_ms", 5000),
        ("grpc.keepalive_permit_without_calls", True),
        ("grpc.http2.max_pings_without_data", 0),
    ]
    return grpc.aio.insecure_channel(target, options=options)
