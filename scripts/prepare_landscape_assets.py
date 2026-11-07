"""Pack PBR shrub and grass assets for the browser."""

import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/landscape"
OUTPUT = ROOT / "preview/public/assets/landscape"
CLI = ["pnpm", "dlx", "@gltf-transform/cli@4.3.0"]


def run(*arguments):
    subprocess.run([*CLI, *map(str, arguments)], cwd=ROOT, check=True)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    models = []
    ground_cover = [("boxwood-source", "shrub_02"), ("fountain-grass-source", "grass_medium_02")]
    for name, source in ground_cover:
        run("webp", RAW / source / f"{source}.gltf", OUTPUT / f"{name}.glb", "--quality", 88)
        models.append((name, source))
    sources = {source for _, source in models}
    receipts = [
        item for item in json.loads((RAW / "sources.json").read_text()) if item["asset"] in sources
    ]
    processing = "glTF Transform 4.3.0; ground cover with embedded 2k PBR maps, WebP quality 88"
    derivatives = [
        {
            "path": f"/assets/landscape/{name}.glb",
            "source_asset": source,
            "sha256": hashlib.sha256((OUTPUT / f"{name}.glb").read_bytes()).hexdigest(),
            "bytes": (OUTPUT / f"{name}.glb").stat().st_size,
        }
        for name, source in models
    ]
    result = {
        "license": "CC0-1.0",
        "sources": receipts,
        "processing": processing,
        "derivatives": derivatives,
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
