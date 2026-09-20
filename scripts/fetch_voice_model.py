"""Install the optional pinned Kokoro int8 model locally. No inference API or key."""

import hashlib
import json
from pathlib import Path

import httpx

from river_oaks.voice import MODEL_FILES

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "data/models/kokoro"
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
LIMITS = {"kokoro-v1.0.int8.onnx": 93_000_000, "voices-v1.0.bin": 29_000_000}


def fetch():
    DESTINATION.mkdir(parents=True, exist_ok=True)
    receipts = []
    with httpx.Client(follow_redirects=True, timeout=60) as client:
        for name, expected in MODEL_FILES.items():
            path = DESTINATION / name
            if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                temporary = path.with_suffix(".part")
                try:
                    with client.stream("GET", f"{RELEASE}/{name}") as reply:
                        reply.raise_for_status()
                        digest, count = hashlib.sha256(), 0
                        with temporary.open("wb") as output:
                            for chunk in reply.iter_bytes(1024 * 1024):
                                count += len(chunk)
                                if count > LIMITS[name]:
                                    raise ValueError("Voice model exceeded its download budget")
                                output.write(chunk)
                                digest.update(chunk)
                    if digest.hexdigest() != expected:
                        raise ValueError("Voice model hash does not match the pinned release")
                    temporary.replace(path)
                finally:
                    temporary.unlink(missing_ok=True)
            receipts.append({"name": name, "sha256": expected, "bytes": path.stat().st_size})
    print(json.dumps({"files": receipts, "local_inference": True, "license": "Apache-2.0"}))


if __name__ == "__main__":
    fetch()
