"""Hello world routes demonstrating simple gRPC calls."""

from fastapi import APIRouter

import market_data_pb2
import transformer_pb2
from api.grpc_client import market_data, transformer

router = APIRouter()


@router.get("/hello")
def hello():
    greeting = market_data.Greet(market_data_pb2.GreetRequest())
    return {"message": greeting.message}


@router.get("/hello/{name}")
def hello_name(name: str):
    greeting = market_data.Greet(market_data_pb2.GreetRequest())
    personalized = transformer.Personalize(
        transformer_pb2.PersonalizeRequest(message=greeting.message, name=name)
    )
    return {"message": personalized.message}
