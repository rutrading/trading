from fastapi import APIRouter

router = APIRouter()


@router.get("/hello")
def hello():
    return {"message": "Hello World"}


@router.get("/hello/{name}")
def hello_name(name: str):
    message = "Hello World".replace("World", name)
    return {"message": message}
