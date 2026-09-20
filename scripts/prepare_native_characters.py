"""Run with uv run --extra assets python scripts/prepare_native_characters.py."""

import hashlib
import json
from pathlib import Path

from river_oaks.native_characters import prepare_character

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "preview/public/assets/characters"
OUTPUT = ROOT / "data/generated/native-characters"


def main():
    manifest = json.loads((SOURCE / "sources.json").read_text())
    results = []
    for entry in manifest["files"]:
        source = SOURCE / Path(entry["path"]).name
        output = OUTPUT / source.name
        prepare_character(source, output, entry["sha256"])
        results.append(
            {
                "id": entry["id"],
                "source_sha256": entry["sha256"],
                "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                "filename": output.name,
            }
        )
    (OUTPUT / "manifest.json").write_text(
        json.dumps({"license": manifest["license"], "files": results}, indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
