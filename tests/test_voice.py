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


async def test_http_busy_voice_can_be_retried_but_missing_model_cannot(tmp_path):
    engine = LocalVoice(synthesizer=lambda request: (np.zeros(2400), 24000))
    engine.busy = True
    transport = httpx.ASGITransport(app=create_app(voice=engine))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        reply = await client.post("/v1/voice", json={"text": "Hello"})
        assert reply.status_code == 503
        assert reply.headers.get("retry-after") == "1"
    transport = httpx.ASGITransport(app=create_app(voice=LocalVoice(tmp_path)))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        reply = await client.post("/v1/voice", json={"text": "Hello"})
        assert reply.status_code == 503
        assert "retry-after" not in reply.headers


async def test_timed_speech_keeps_wave_audio_and_embeds_bounded_phoneme_cues():
    import json
    import struct
    from types import SimpleNamespace

    cues = [SimpleNamespace(phoneme="ɑ", start=0.02, end=0.08)]
    engine = LocalVoice(synthesizer=lambda request: (np.ones(2400) * 0.1, 24000, cues))
    result = await engine.speak(VoiceRequest(text="Ah"))
    assert struct.unpack_from("<I", result, 4)[0] == len(result) - 8
    with wave.open(io.BytesIO(result)) as wav:
        assert wav.getnframes() == 2400
        assert len(wav.readframes(2400)) == 4800
    offset = 12
    while result[offset : offset + 4] != b"JEVS":
        size = struct.unpack_from("<I", result, offset + 4)[0]
        offset += 8 + size + size % 2
    size = struct.unpack_from("<I", result, offset + 4)[0]
    metadata = json.loads(result[offset + 8 : offset + 8 + size])
    assert metadata == {
        "version": 1,
        "duration": 0.1,
        "phonemes": [
            {"phoneme": "ɑ", "start": 0.02, "end": 0.08},
        ],
    }
    assert await engine.speak(VoiceRequest(text="Ah")) == result


@pytest.mark.parametrize(
    "cues",
    [
        [{"phoneme": "a", "start": -0.1, "end": 0.1}],
        [{"phoneme": "a", "start": 0, "end": 0.2}],
        [{"phoneme": "a", "start": float("nan"), "end": 0.1}],
        [{"phoneme": "a", "start": 0.05, "end": 0.02}],
        [
            {"phoneme": "a", "start": 0.02, "end": 0.08},
            {"phoneme": "b", "start": 0.04, "end": 0.09},
        ],
        [{"phoneme": "too-long", "start": 0, "end": 0.1}],
        [{"phoneme": "a", "start": 0, "end": 0}] * 4097,
    ],
)
async def test_invalid_phoneme_timings_cannot_enter_the_voice_cache(cues):
    from types import SimpleNamespace

    timings = [SimpleNamespace(**cue) for cue in cues]
    engine = LocalVoice(synthesizer=lambda request: (np.zeros(2400), 24000, timings))
    with pytest.raises(VoiceUnavailable):
        await engine.speak(VoiceRequest(text="Hello"))
    assert not engine.cache


def test_macos_espeak_uses_an_installed_library_and_fails_before_native_initialization(monkeypatch):
    from river_oaks import voice

    monkeypatch.delenv("PHONEMIZER_ESPEAK_LIBRARY", raising=False)
    monkeypatch.setattr(voice.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(voice.ctypes.util, "find_library", lambda name: None)
    monkeypatch.setattr(voice.Path, "is_file", lambda path: False)
    with pytest.raises(VoiceUnavailable, match="Install espeak-ng"):
        voice.espeak_library()
    monkeypatch.setattr(voice.Path, "is_file", lambda path: str(path).startswith("/opt/homebrew/"))
    assert voice.espeak_library() == "/opt/homebrew/lib/libespeak-ng.dylib"
    monkeypatch.setenv("PHONEMIZER_ESPEAK_LIBRARY", "/custom/espeak.dylib")
    assert voice.espeak_library() == "/custom/espeak.dylib"
    monkeypatch.delenv("PHONEMIZER_ESPEAK_LIBRARY")
    monkeypatch.setattr(voice.platform, "system", lambda: "Linux")
    assert voice.espeak_library() is None
