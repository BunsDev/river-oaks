"""Build bounded tree LODs and pack PBR landscape assets for the browser."""

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


def untextured(source, target):
    """Copy a glTF with its materials but no texture references.

    The browser takes every crown material, by name, from the high LOD, so the
    mid and low LODs only need geometry. Shipping their own copies of the
    2k maps added about 9.6 MB and eighteen image decodes to each first visit.
    """
    gltf = json.loads(source.read_text())
    for key in ("images", "textures", "samplers"):
        gltf.pop(key, None)
    for material in gltf.get("materials", []):
        pbr = material.get("pbrMetallicRoughness", {})
        pbr.pop("baseColorTexture", None)
        pbr.pop("metallicRoughnessTexture", None)
        for key in ("normalTexture", "occlusionTexture", "emissiveTexture"):
            material.pop(key, None)
    used = [name for name in gltf.get("extensionsUsed", []) if name != "KHR_texture_transform"]
    gltf["extensionsUsed"] = used
    required = gltf.get("extensionsRequired", [])
    gltf["extensionsRequired"] = [name for name in required if name in used]
    for key in ("extensionsUsed", "extensionsRequired"):
        if not gltf[key]:
            del gltf[key]
    target.write_text(json.dumps(gltf))


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source = RAW / "tree_small_02/tree_small_02.gltf"
    welded = RAW / "tree-welded.glb"
    run("weld", source, welded)
    # Written beside the source so its relative buffer URI still resolves.
    bare = source.with_name("tree_small_02-untextured.gltf")
    untextured(source, bare)
    welded_bare = RAW / "tree-welded-untextured.glb"
    run("weld", bare, welded_bare)
    models = []
    for level, ratio, error in [("high", 0.05, 0.004), ("mid", 0.012, 0.012), ("low", 0.003, 0.03)]:
        name = f"shade-tree-{level}"
        if level == "high":
            temporary = RAW / f"{name}.glb"
            run("simplify", welded, temporary, "--ratio", ratio, "--error", error)
            run("webp", temporary, OUTPUT / f"{name}.glb", "--quality", 88)
        else:
            run("simplify", welded_bare, OUTPUT / f"{name}.glb", "--ratio", ratio, "--error", error)
        models.append((name, "tree_small_02"))
    ground_cover = [("boxwood-source", "shrub_02"), ("fountain-grass-source", "grass_medium_02")]
    for name, source in ground_cover:
        run("webp", RAW / source / f"{source}.gltf", OUTPUT / f"{name}.glb", "--quality", 88)
        models.append((name, source))
    receipts = json.loads((RAW / "sources.json").read_text())
    processing = (
        "glTF Transform 4.3.0; mesh LODs; 2k PBR maps, WebP quality 88, on the high LOD "
        "and ground cover; mid and low LODs are geometry only and share the high LOD "
        "materials at runtime"
    )
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
