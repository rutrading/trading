from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_me_unauthorized():
    response = client.get("/api/me")
    assert response.status_code in (401, 403)
