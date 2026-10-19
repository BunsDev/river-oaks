"""Render the second short's dialogue (#501) with the local Kokoro voice (river_oaks.voice).

    python scripts/ipic-short/second-voices.py <script.json> <model-dir> <out-dir>

Each line of the script becomes <out-dir>/line-NN.wav (24 kHz mono, as LocalVoice renders it) and
voices.json lists the speaker, the Kokoro voice id, the text, the duration and the file's SHA-256.
Local inference only: no service, no key, no network. Kokoro-82M weights are Apache-2.0 and are
checked against their pinned hashes before use.
"""

import asyncio
import hashlib
import io
import json
import sys
import wave
from pathlib import Path

from river_oaks.voice import LocalVoice, VoiceRequest


def main(script_path, model_dir, out_dir):
    script = json.loads(Path(script_path).read_text(encoding="utf-8"))
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    voice = LocalVoice(model_dir)
    if not voice.available:
        raise SystemExit("The local Kokoro model is not installed")
    lines = []
    for index, cue in enumerate(c for c in script["cues"] if "line" in c):
        character = script["characters"][cue["speaker"]]
        request = VoiceRequest(text=cue["line"], voice=character["voice"], speed=character["speed"])
        payload = asyncio.run(voice.speak(request))
        # LocalVoice appends a JEVS timing chunk after the WAV data; keep only the audio.
        with wave.open(io.BytesIO(payload), "rb") as source:
            rate, frames = source.getframerate(), source.readframes(source.getnframes())
        path = out / f"line-{index:02d}.wav"
        with wave.open(str(path), "wb") as target:
            target.setnchannels(1)
            target.setsampwidth(2)
            target.setframerate(rate)
            target.writeframes(frames)
        data = path.read_bytes()
        lines.append(
            {
                "index": index,
                "shot": cue["shot"],
                "at": cue["at"],
                "speaker": cue["speaker"],
                "voice": character["voice"],
                "text": cue["line"],
                "file": path.name,
                "durationS": round(len(frames) / 2 / rate, 3),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        )
    manifest = {"model": "Kokoro-82M v1.0 int8 (Apache-2.0), local", "lines": lines}
    (out / "voices.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    summary = [{k: line[k] for k in ("speaker", "voice", "durationS", "text")} for line in lines]
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main(*sys.argv[1:4])
