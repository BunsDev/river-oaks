import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from river_oaks.agents import DecisionEngine
from river_oaks.elevenlabs_voice import ElevenLabsUnavailable, ElevenLabsVoice, JevVoiceRequest
from river_oaks.service import create_app


def test_selected_voice_and_bounded_cached_audio():
    calls = []

    async def provider(request):
        calls.append(request)
        return httpx.Response(200, content=b"ID3audio", headers={"content-type": "audio/mpeg"})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
            voice = ElevenLabsVoice(client, "secret-key")
            packet = JevVoiceRequest(text="My love, lead the way.")
            assert await voice.speak(packet) == b"ID3audio"
            assert await voice.speak(packet) == b"ID3audio"
            assert len(calls) == 1
            assert calls[0].url.path.endswith("/s3TPKV1kjDlVtZbl4Ksh")
            assert calls[0].headers["xi-api-key"] == "secret-key"
            assert json.loads(calls[0].content) == {
                "text": packet.text,
                "model_id": "eleven_multilingual_v2",
            }
            voice.set_key("new-secret")
            await voice.speak(packet)
            assert len(calls) == 2

    asyncio.run(run())


def test_voice_key_override_is_private_and_resettable():
    voice = ElevenLabsVoice(api_key="server-secret")
    with TestClient(
        create_app(engine=DecisionEngine(), elevenlabs_voice=voice), base_url="http://127.0.0.1"
    ) as client:
        assert client.get("/v1/settings/elevenlabs").json()["source"] == "server"
        response = client.put("/v1/settings/elevenlabs", json={"api_key": "manual-secret"})
        assert response.json()["source"] == "manual"
        assert "secret" not in response.text
        assert voice.api_key == "manual-secret"
        selected = client.put("/v1/settings/elevenlabs/voice", json={"voice_id": "testVoice123"})
        assert selected.json()["voice_id"] == "testVoice123"
        assert voice.api_key == "manual-secret"
        assert (
            client.put("/v1/settings/elevenlabs/voice", json={"voice_id": "../escape"}).status_code
            == 422
        )
        assert client.delete("/v1/settings/elevenlabs").json()["source"] == "server"
        assert voice.api_key == "server-secret"
        response = client.put("/v1/settings/elevenlabs", json={"api_key": "invalid secret"})
        assert response.status_code == 400
        assert "invalid secret" not in response.text
        assert (
            client.post("/v1/voice/jev", json={"text": "hello", "voice_id": "other"}).status_code
            == 422
        )
        assert client.post("/v1/voice/jev", json={"text": " "}).status_code == 422
        assert client.post("/v1/voice/jev", json={"text": "hello"}).status_code == 503


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(401, json={"detail": "secret provider information"}),
        httpx.Response(200, content=b"wrong", headers={"content-type": "text/html"}),
        httpx.Response(
            200, content=b"x" * (2 * 1024 * 1024 + 1), headers={"content-type": "audio/mpeg"}
        ),
    ],
)
def test_failed_provider_never_becomes_audio_or_exposes_response(response):
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: response)) as client:
            with pytest.raises(ElevenLabsUnavailable) as error:
                await ElevenLabsVoice(client, "key").speak(JevVoiceRequest(text="Hello"))
            assert "secret" not in str(error.value)

    asyncio.run(run())
