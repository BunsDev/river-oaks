"""Generate the real timed WAV used by browser speech playback checks."""

import asyncio
import hashlib
import io
import json
import wave
from pathlib import Path

from river_oaks.voice import MODEL_FILES, LocalVoice, VoiceRequest

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/raw/speech-voice-checks"
TEXT = "Welcome back, Jevica. Your carriage is waiting by the fountain."


async def main():
    request = VoiceRequest(text=TEXT)
    audio = await LocalVoice(ROOT / "data/models/kokoro").speak(request)
    with wave.open(io.BytesIO(audio)) as wav:
        duration = wav.getnframes() / wav.getframerate()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    path = OUTPUT / "integrated.wav"
    path.write_bytes(audio)
    receipt = {
        "request": request.model_dump(),
        "models": MODEL_FILES,
        "durationSeconds": duration,
        "bytes": len(audio),
        "sha256": hashlib.sha256(audio).hexdigest(),
    }
    (OUTPUT / "integrated.sources.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    asyncio.run(main())
