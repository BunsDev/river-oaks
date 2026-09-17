import asyncio
import io
import threading
import wave

import httpx
import numpy as np
import pytest
from pydantic import ValidationError

from river_oaks.service import create_app
from river_oaks.voice import LocalVoice, VoiceBusy, VoiceRequest, VoiceUnavailable


def test_voice_request_bounds():
    for args in [
        {"text": " "},
        {"text": "x" * 481},
        {"text": "hi", "voice": "someone"},
        {"text": "hi", "speed": float("nan")},
        {"text": "hi", "speed": 2.0},
    ]:
        with pytest.raises(ValidationError):
            VoiceRequest(**args)
    assert VoiceRequest(text=" hi  there ").text == "hi there"


async def test_wave_and_cache_are_bounded_and_voice_specific():
    calls = []

    def synth(request):
        calls.append(request.voice)
        return np.ones(2400, dtype=np.float32) * 0.1, 24000

    engine = LocalVoice(synthesizer=synth)
    request = VoiceRequest(text="Hello")
    result = await engine.speak(request)
    assert await engine.speak(request) == result
    await engine.speak(VoiceRequest(text="Hello", voice="am_michael"))
    assert calls == ["af_heart", "am_michael"]
    with wave.open(io.BytesIO(result)) as wav:
        assert (wav.getnchannels(), wav.getframerate(), wav.getnframes()) == (1, 24000, 2400)
    for i in range(40):
        await engine.speak(VoiceRequest(text=str(i)))
    assert len(engine.cache) == 32
    assert engine.cache_bytes <= engine.cache_limit


async def test_timeout_does_not_release_the_worker_or_build_a_queue():
    started, release = threading.Event(), threading.Event()

    def synth(request):
        started.set()
        release.wait(2)
        return np.zeros(2400), 24000

    engine = LocalVoice(synthesizer=synth, timeout=0.01)
    try:
        with pytest.raises(VoiceBusy):
            await engine.speak(VoiceRequest(text="Hello"))
        assert started.is_set() and engine.busy
        with pytest.raises(VoiceBusy):
            await engine.speak(VoiceRequest(text="Do not queue"))
    finally:
        release.set()
    for _ in range(100):
        if not engine.busy:
            break
        await asyncio.sleep(0.01)
    assert not engine.busy


async def test_missing_model_and_invalid_audio_are_unavailable(tmp_path):
    engine = LocalVoice(tmp_path)
    assert not engine.available
    with pytest.raises(VoiceUnavailable):
        await engine.speak(VoiceRequest(text="Hello"))
    engine = LocalVoice(synthesizer=lambda request: (np.array([np.nan]), 24000))
    with pytest.raises(VoiceUnavailable):
        await engine.speak(VoiceRequest(text="Hello"))


async def test_http_speech_returns_wave_and_rejects_oversized_requests():
    engine = LocalVoice(synthesizer=lambda request: (np.zeros(2400), 24000))
    transport = httpx.ASGITransport(app=create_app(voice=engine))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        status = (await client.get("/v1/voice")).json()
        assert status["available"] and status["local"] and not status["remote_inference"]
        reply = await client.post("/v1/voice", json={"text": "Hello", "voice": "af_bella"})
        assert reply.status_code == 200
        assert reply.headers["content-type"] == "audio/wav"
        assert reply.content[:4] == b"RIFF"
        assert (await client.post("/v1/voice", json={"text": "x" * 481})).status_code == 422
