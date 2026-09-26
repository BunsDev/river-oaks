"""Optional offline Kokoro synthesis. One CPU job, bounded audio cache, no remote inference."""

import asyncio
import ctypes.util
import hashlib
import importlib.util
import io
import json
import math
import os
import platform
import struct
import wave
from collections import OrderedDict
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, field_validator

MODEL_FILES = {
    "kokoro-v1.0.int8.onnx": "ae315a79b623f244700e4afb9246c46a26066782e049ba174bf3ba433970ee9c",
    "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
}
VoiceName = Literal[
    "af_heart",
    "af_bella",
    "af_nicole",
    "af_sarah",
    "af_sky",
    "af_jessica",
    "af_nova",
    "af_river",
    "af_alloy",
    "af_aoede",
    "af_kore",
    "am_adam",
    "am_michael",
    "am_fenrir",
    "am_eric",
    "am_liam",
    "am_onyx",
    "am_echo",
    "am_puck",
    "bf_emma",
    "bf_alice",
    "bf_isabella",
    "bf_lily",
    "bm_george",
    "bm_daniel",
    "bm_fable",
    "bm_lewis",
]


class VoiceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: str = Field(min_length=1, max_length=480)
    voice: VoiceName = "af_heart"
    speed: float = Field(default=1.0, ge=0.85, le=1.15)

    @field_validator("text")
    @classmethod
    def nonblank(cls, value):
        value = " ".join(value.split())
        if not value:
            raise ValueError("Speech text cannot be blank")
        return value


class VoiceUnavailable(Exception):
    pass


class VoiceBusy(Exception):
    pass


def espeak_library():
    override = os.environ.get("PHONEMIZER_ESPEAK_LIBRARY")
    if override or platform.system() != "Darwin":
        return override
    # The bundled macOS dylib can exit the process using its build-machine
    # data path. Use the installed system library before entering native code.
    library = ctypes.util.find_library("espeak-ng")
    if not library:
        library = next(
            (
                str(path)
                for path in (
                    Path("/opt/homebrew/lib/libespeak-ng.dylib"),
                    Path("/usr/local/lib/libespeak-ng.dylib"),
                )
                if path.is_file()
            ),
            None,
        )
    if not library:
        raise VoiceUnavailable("Install espeak-ng for local voices on macOS")
    return library


def append_timings(wav, timings, duration):
    """Optional RIFF metadata: ordinary WAV players skip this unknown chunk."""
    if not timings:
        return wav
    if len(timings) > 4096:
        raise VoiceUnavailable("Too many speech timing entries")
    phonemes, previous = [], 0.0
    for cue in timings:
        start, end = float(cue.start), float(cue.end)
        if (
            not isinstance(cue.phoneme, str)
            or not 1 <= len(cue.phoneme) <= 4
            or not math.isfinite(start)
            or not math.isfinite(end)
            or not previous <= start <= end <= duration
        ):
            raise VoiceUnavailable("Invalid speech timing output")
        phonemes.append({"phoneme": cue.phoneme, "start": start, "end": end})
        previous = end
    metadata = json.dumps(
        {"version": 1, "duration": duration, "phonemes": phonemes},
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    if len(metadata) > 512 * 1024:
        raise VoiceUnavailable("Speech timing metadata exceeds its budget")
    payload = wav + b"JEVS" + struct.pack("<I", len(metadata)) + metadata
    if len(metadata) % 2:
        payload += b"\0"
    return payload[:4] + struct.pack("<I", len(payload) - 8) + payload[8:]


class LocalVoice:
    def __init__(self, model_dir="data/models/kokoro", *, synthesizer=None, timeout=20):
        self.model_dir = Path(model_dir)
        self.synthesizer = synthesizer
        self.model = None
        self.busy = False
        self.timeout = timeout
        self.cache = OrderedDict()
        self.cache_bytes = 0
        self.cache_limit = 16 * 1024 * 1024

    @property
    def available(self):
        return self.synthesizer is not None or (
            importlib.util.find_spec("kokoro_onnx") is not None
            and all((self.model_dir / name).is_file() for name in MODEL_FILES)
        )

    def _load(self):
        import onnxruntime as ort
        from kokoro_onnx import Kokoro
        from kokoro_onnx.config import EspeakConfig

        speech_library = espeak_library()
        for name, expected in MODEL_FILES.items():
            if hashlib.sha256((self.model_dir / name).read_bytes()).hexdigest() != expected:
                raise VoiceUnavailable("Local model integrity check failed")
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        session = ort.InferenceSession(
            str(self.model_dir / "kokoro-v1.0.int8.onnx"),
            sess_options=options,
            providers=["CPUExecutionProvider"],
        )
        self.model = Kokoro.from_session(
            session,
            str(self.model_dir / "voices-v1.0.bin"),
            espeak_config=EspeakConfig(lib_path=speech_library),
        )

    def _render(self, request):
        key = (request.voice, request.speed, request.text)
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        if self.synthesizer is not None:
            rendered = self.synthesizer(request)
        else:
            if self.model is None:
                self._load()
            rendered = self.model.create_timed(
                request.text,
                voice=request.voice,
                speed=request.speed,
                lang="en-gb" if request.voice.startswith("b") else "en-us",
            )
        samples, rate, *timing_output = rendered
        timings = timing_output[0] if timing_output else []
        samples = np.asarray(samples)
        if rate != 24000 or samples.ndim != 1 or not 0 < len(samples) <= rate * 45:
            raise VoiceUnavailable("Invalid local audio output")
        if not np.isfinite(samples).all():
            raise VoiceUnavailable("Invalid local audio samples")
        pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(rate)
            wav.writeframes(pcm)
        payload = append_timings(output.getvalue(), timings, len(samples) / rate)
        while self.cache and (
            len(self.cache) >= 32 or self.cache_bytes + len(payload) > self.cache_limit
        ):
            _, old = self.cache.popitem(last=False)
            self.cache_bytes -= len(old)
        self.cache[key] = payload
        self.cache_bytes += len(payload)
        return payload

    async def speak(self, request):
        if not self.available:
            raise VoiceUnavailable("Install the optional local voice model first")
        if self.busy:
            raise VoiceBusy("Previous local voice is still rendering")
        self.busy = True
        task = asyncio.create_task(asyncio.to_thread(self._render, request))

        def finished(done):
            self.busy = False
            # Retrieve exceptions even if the browser disconnected or timed out.
            if not done.cancelled():
                done.exception()

        task.add_done_callback(finished)
        try:
            return await asyncio.wait_for(asyncio.shield(task), timeout=self.timeout)
        except TimeoutError:
            raise VoiceBusy("Local speech exceeded its wait budget") from None
        except asyncio.CancelledError:
            raise
        except Exception:
            raise VoiceUnavailable("Local speech could not be generated") from None
