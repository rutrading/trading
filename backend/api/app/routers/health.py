from fastapi import APIRouter, Depends

from app.auth import get_current_user

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user
