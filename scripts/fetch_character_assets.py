"""Fetch and verify the CC0 human assets and MPFB source used by build_characters.py."""

import hashlib
import zipfile
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1] / "data/raw/characters"
ARCHIVES = [
    (
        "mpfb.zip",
        "https://github.com/makehumancommunity/mpfb2/archive/refs/tags/v2.0.17.zip",
        "d08e726c798fdc4eefb02b06b6c4efe37d40b5439777e53cf96dce0e5073297d",
        45_000_000,
        "mpfb-src",
    ),
    (
        "system-assets.zip",
        "https://files2.makehumancommunity.org/asset_packs/"
        "makehuman_system_assets/makehuman_system_assets_cc0.zip",
        "b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107",
        282_000_000,
        "assets",
    ),
]


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    with httpx.Client(follow_redirects=True, timeout=60) as client:
        for name, url, expected, maximum, folder in ARCHIVES:
            path = ROOT / name
            if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                temporary = path.with_suffix(".part")
                try:
                    with client.stream("GET", url) as response:
                        response.raise_for_status()
                        count, digest = 0, hashlib.sha256()
                        with temporary.open("wb") as output:
                            for chunk in response.iter_bytes(1024 * 1024):
                                count += len(chunk)
                                if count > maximum:
                                    raise ValueError("Character archive exceeds download budget")
                                output.write(chunk)
                                digest.update(chunk)
                    if digest.hexdigest() != expected:
                        raise ValueError("Character archive integrity check failed")
                    temporary.replace(path)
                finally:
                    temporary.unlink(missing_ok=True)
            with zipfile.ZipFile(path) as archive:
                if any(Path(n).is_absolute() or ".." in Path(n).parts for n in archive.namelist()):
                    raise ValueError("Unsafe archive path")
                if sum(item.file_size for item in archive.infolist()) > 1_000_000_000:
                    raise ValueError("Character archive exceeds extraction budget")
                archive.extractall(ROOT / folder)
            print(f"Verified {name}: {expected}")


if __name__ == "__main__":
    main()
