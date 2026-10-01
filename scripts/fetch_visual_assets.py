"""Acquire a small, pinned local set of CC0 materials and an HDR environment."""

import argparse
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
    "paver": "brick_floor",
    "stone": "large_sandstone_blocks_01",
    "bark": "bark_brown_02",
}
SKY = "kloofendal_48d_partly_cloudy_puresky"
MAX_FILE_BYTES = 12 * 1024 * 1024


def load_lock(output):
    """The committed sources.json pins every file's source URL and SHA-256."""
    path = output / "sources.json"
    if not path.exists():
        return {}
    return {Path(item["path"]).name: item for item in json.loads(path.read_text())["files"]}


def fetch(update=False, output=OUTPUT, transport=None):
    """Download the pinned assets. Without update=True, a changed source URL or
    payload is refused rather than trusted from the provider's API."""
    output.mkdir(parents=True, exist_ok=True)
    lock = load_lock(output)
    receipts = []
    with httpx.Client(
        timeout=60,
        headers={"User-Agent": "RiverOaks-local-development-preview/0.1"},
        transport=transport,
    ) as client:

        def save(asset, kind, item, filename):
            path = output / filename
            pinned = lock.get(filename)
            # Refuse an unpinned or changed source before contacting it.
            if not update:
                if pinned is None:
                    raise ValueError(f"{filename} is not pinned; rerun with --update to pin it")
                if item["url"] != pinned["source"]:
                    raise ValueError(f"{filename}: source URL changed from the pinned one")
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
            sha256 = hashlib.sha256(payload).hexdigest()
            if not update:
                if sha256 != pinned["sha256"]:
                    raise ValueError(f"{filename}: payload does not match the pinned SHA-256")
            if not path.exists() or path.read_bytes() != payload:
                path.write_bytes(payload)
            receipts.append(
                {
                    "asset": asset,
                    "kind": kind,
                    "path": f"/assets/materials/{filename}",
                    "source": item["url"],
                    "asset_page": f"https://polyhaven.com/a/{asset}",
                    "bytes": len(payload),
                    "sha256": sha256,
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
    (output / "sources.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"files": len(receipts), "bytes": sum(item["bytes"] for item in receipts)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--update", action="store_true", help="re-pin changed sources in sources.json"
    )
    fetch(update=parser.parse_args().update)
