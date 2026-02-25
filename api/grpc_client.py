import grpc
from generated import market_data_pb2_grpc, transformer_pb2_grpc

market_data = market_data_pb2_grpc.MarketDataServiceStub(
    grpc.insecure_channel("localhost:50051")
)
transformer = transformer_pb2_grpc.TransformerServiceStub(
    grpc.insecure_channel("localhost:50052")
)
