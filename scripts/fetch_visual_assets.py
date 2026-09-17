"""Acquire a small, pinned local set of CC0 materials and an HDR environment."""

import hashlib
import json
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "preview/public/assets/materials"
ASSETS = {
    "brick": "brick_wall_001",
    "grass": "grass_path_2",
    "asphalt": "asphalt_02",
    "pavement": "pavement_03",
    "stone": "large_sandstone_blocks_01",
}
SKY = "kloofendal_48d_partly_cloudy_puresky"
MAX_FILE_BYTES = 12 * 1024 * 1024


def fetch():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    receipts = []
    with httpx.Client(
        timeout=60, headers={"User-Agent": "RiverOaks-local-development-preview/0.1"}
    ) as client:

        def save(asset, kind, item, filename):
            path = OUTPUT / filename
            if path.exists() and hashlib.md5(path.read_bytes()).hexdigest() == item["md5"]:
                payload = path.read_bytes()
            else:
                if item["size"] > MAX_FILE_BYTES:
                    raise ValueError("Asset exceeds download budget")
                with client.stream("GET", item["url"]) as response:
                    response.raise_for_status()
                    payload = bytearray()
                    for chunk in response.iter_bytes():
                        payload.extend(chunk)
                        if len(payload) > MAX_FILE_BYTES:
                            raise ValueError("Asset exceeds download budget")
                if hashlib.md5(payload).hexdigest() != item["md5"]:
                    raise ValueError("Asset integrity check failed")
                path.write_bytes(payload)
            receipts.append(
                {
                    "asset": asset,
                    "kind": kind,
                    "path": f"/assets/materials/{filename}",
                    "source": item["url"],
                    "asset_page": f"https://polyhaven.com/a/{asset}",
                    "bytes": len(payload),
                    "sha256": hashlib.sha256(payload).hexdigest(),
                    "license": "CC0-1.0",
                }
            )

        for name, asset in ASSETS.items():
            response = client.get(f"https://api.polyhaven.com/files/{asset}")
            response.raise_for_status()
            files = response.json()
            for kind, channel in [("color", "Diffuse"), ("normal", "nor_gl"), ("arm", "arm")]:
                save(asset, kind, files[channel]["1k"]["jpg"], f"{name}-{kind}.jpg")
        response = client.get(f"https://api.polyhaven.com/files/{SKY}")
        response.raise_for_status()
        save(SKY, "environment", response.json()["hdri"]["1k"]["hdr"], "sky.hdr")
    manifest = {
        "provider": "Poly Haven",
        "license_url": "https://polyhaven.com/license",
        "files": receipts,
    }
    (OUTPUT / "sources.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"files": len(receipts), "bytes": sum(item["bytes"] for item in receipts)}))


if __name__ == "__main__":
    fetch()
