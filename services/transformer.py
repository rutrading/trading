"""Transformer gRPC service."""

import sys
from concurrent import futures
from pathlib import Path

import grpc

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "generated"))

import market_data_pb2  # noqa: F401
import transformer_pb2
import transformer_pb2_grpc


class TransformerServicer(transformer_pb2_grpc.TransformerServiceServicer):
    def Transform(self, request, context):
        raw = request.raw_quote
        change = raw.price - raw.open
        change_percent = (change / raw.open * 100) if raw.open else 0

        return transformer_pb2.TransformResponse(
            symbol=raw.symbol,
            price=raw.price,
            change=round(change, 4),
            change_percent=round(change_percent, 4),
        )

    def Personalize(self, request, context):
        return transformer_pb2.PersonalizeResponse(
            message=request.message.replace("World", request.name)
        )


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    transformer_pb2_grpc.add_TransformerServiceServicer_to_server(
        TransformerServicer(), server
    )
    server.add_insecure_port("[::]:50052")
    server.start()
    print("Transformer running on :50052")
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
