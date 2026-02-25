from fastapi import APIRouter
from generated import market_data_pb2, transformer_pb2
from api.grpc_client import market_data, transformer

router = APIRouter()


@router.get("/hello")
def hello():
    # Single gRPC call: Gateway -> MarketData
    greeting = market_data.Greet(market_data_pb2.GreetRequest())
    return {"message": greeting.message}


@router.get("/hello/{name}")
def hello_name(name: str):
    # First gRPC call: get "Hello World" from MarketData
    greeting = market_data.Greet(market_data_pb2.GreetRequest())

    # Second gRPC call: send it to Transformer to replace "World" with the name
    personalized = transformer.Personalize(
        transformer_pb2.PersonalizeRequest(message=greeting.message, name=name)
    )
    return {"message": personalized.message}
