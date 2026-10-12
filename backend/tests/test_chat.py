import importlib
import os

from fastapi.testclient import TestClient


def test_chat_requires_gemini_api_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    os.environ.pop("GEMINI_API_KEY", None)

    app_module = importlib.import_module("app.main")
    app_module.genai = None
    app_module.types = None

    with TestClient(app_module.app) as client:
        response = client.post("/api/chat", json={"message": "Hello"})

    assert response.status_code == 500
    assert response.json()["detail"] == "GEMINI_API_KEY is not configured on the backend."


def test_chat_returns_error_without_external_call_when_client_is_unavailable(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    app_module = importlib.import_module("app.main")
    app_module.GEMINI_API_KEY = "test-key"
    app_module.genai = None
    app_module.types = None

    with TestClient(app_module.app) as client:
        response = client.post("/api/chat", json={"message": "Hello"})

    assert response.status_code == 500
    assert response.json()["detail"] == "google-genai is not installed or failed to import."
