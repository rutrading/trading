import os
from concurrent import futures

import grpc
import httpx
from dotenv import load_dotenv
from generated import market_data_pb2, market_data_pb2_grpc

load_dotenv()

API_KEY = os.environ["TWELVE_DATA_API_KEY"]
client = httpx.Client(base_url="https://api.twelvedata.com")


class MarketDataServicer(market_data_pb2_grpc.MarketDataServiceServicer):
    def Fetch(self, request, context):
        data = client.get(
            "/quote", params={"symbol": request.symbol, "apikey": API_KEY}
        ).json()

        if "code" in data:
            context.set_code(grpc.StatusCode.NOT_FOUND)
            context.set_details(data.get("message", "Symbol not found"))
            return market_data_pb2.FetchResponse()

        return market_data_pb2.FetchResponse(
            symbol=data["symbol"],
            price=float(data["close"]),
            open=float(data["open"]),
            volume=float(data["volume"]),
        )

    def Greet(self, request, context):
        return market_data_pb2.GreetResponse(message="Hello World")


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    market_data_pb2_grpc.add_MarketDataServiceServicer_to_server(
        MarketDataServicer(), server
    )
    server.add_insecure_port("[::]:50051")
    server.start()
    print("MarketData running on :50051")
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
