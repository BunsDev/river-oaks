"""Build the realism layer's skin roughness map from MPFB's CC0 region masks (#517).

The masks share the MakeHuman skin UV layout, so the map lines up with every
shipped rig's skin texture. Region values are MPFB 2.0.17's own enhanced-skin
defaults. Run from the repository root:

    uv run python scripts/build_character_realism_maps.py --source <path to data/raw/characters>

Sources live in the ignored data/raw/characters (see fetch_character_assets.py).
"""

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "preview/public/assets/characters/realism"
MPFB = "mpfb-src/mpfb2-2.0.17/src/mpfb/data"
SIZE = 512
# Roughness from MPFB settings/enhanced_settings.default.json: body, lips and nails.
SETTINGS = "settings/enhanced_settings.default.json"
REGIONS = {"lips": "lips", "fingernails": "fingernails", "toenails": "toenails"}


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=ROOT / "data/raw/characters")
    args = parser.parse_args()
    data = args.source / MPFB
    settings = json.loads((data / SETTINGS).read_text())
    body = settings["body"]["Roughness"]
    roughness = [body] * (SIZE * SIZE)
    inputs = {SETTINGS: sha256(data / SETTINGS)}
    for region, key in REGIONS.items():
        path = data / f"textures/mpfb_{region}.jpg"
        inputs[f"textures/mpfb_{region}.jpg"] = sha256(path)
        mask = Image.open(path).convert("L").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
        target = settings[key]["Roughness"]
        for i, value in enumerate(mask.tobytes()):
            weight = value / 255.0
            roughness[i] = roughness[i] * (1 - weight) + target * weight
    channel = Image.new("L", (SIZE, SIZE))
    channel.putdata([round(value * 255) for value in roughness])
    # Three.js reads roughness from the green channel.
    image = Image.merge("RGB", (channel, channel, channel))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    out = OUTPUT / "skin-roughness.webp"
    image.save(out, "WEBP", lossless=True, method=6)
    receipt = {
        "id": "skin-roughness",
        "path": "/assets/characters/realism/skin-roughness.webp",
        "generator": "scripts/build_character_realism_maps.py (Pillow)",
        "source": "MPFB 2.0.17 CC0 assets: region masks and enhanced-skin defaults",
        "license": "CC0-1.0",
        "size": [SIZE, SIZE],
        "channels": "roughness in R, G and B (Three.js samples G)",
        "values": {
            "body": body,
            **{region: settings[key]["Roughness"] for region, key in REGIONS.items()},
        },
        "inputs": inputs,
        "bytes": out.stat().st_size,
        "sha256": sha256(out),
    }
    (OUTPUT / "sources.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({key: receipt[key] for key in ("path", "bytes", "sha256", "values")}))


if __name__ == "__main__":
    main()
