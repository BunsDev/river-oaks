"""Stage the bundled River Oaks District footprint for the Unreal runtime."""

import json
from pathlib import Path

from river_oaks.district import district_manifest

ROOT = Path(__file__).resolve().parents[1]


def main():
    source = json.loads((ROOT / "preview/public/data/district.json").read_text())
    target = ROOT / "unreal/Content/Data/district.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(district_manifest(source), separators=(",", ":")) + "\n")
    print(f"Staged {len(source['buildings'])} district buildings at {target}")


if __name__ == "__main__":
    main()
