"""Export separate expressive CC0 humans without rewriting canonical assets.

Run inside Blender with --factory-startup, --threads 1 and an explicit cached
source directory. See the #517 ledger for the pinned source/tool versions.
"""

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_characters as characters  # noqa: E402
import build_facial_candidates as facial  # noqa: E402
from character_build_inputs import collect_inputs  # noqa: E402

PROFILES = (
    (
        "man-realistic-casual",
        "young_caucasian_male",
        "male_casualsuit02",
        "short01",
        "shoes01",
        1,
        0.4,
    ),
    (
        "woman-realistic-tailored",
        "middleage_african_female",
        "female_elegantsuit01",
        "bob02",
        "shoes02",
        0,
        0.6,
    ),
)
EXPRESSIONS = ("mouthSmileLeft", "mouthSmileRight", "browInnerUp")
FACE_ARCHIVE_SHA = "d113107bd7eb59f3af4df6fc0ec29bfcc593f496d0b336aec14f086a80ce7146"
VISEME_ARCHIVE_SHA = "a69ab6fb95ddd5f56f70acc7e859f5f9c6ae613c527d577ea1571eff2183d29e"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=ROOT / "preview/public/assets/characters")
    parser.add_argument("--profile", choices=[profile[0] for profile in PROFILES])
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])
    source, output = args.source.resolve(), args.out.resolve()
    assets = source / "assets"
    characters.SOURCE = facial.SOURCE = source
    characters.ASSETS = facial.ASSETS = assets
    facial.TARGETS = ("eyeBlinkLeft", "eyeBlinkRight", *EXPRESSIONS)
    inputs = {}
    for archive, expected, names, folder in (
        ("faceunits01.zip", FACE_ARCHIVE_SHA, facial.TARGETS, "faceunits"),
        ("visemes02.zip", VISEME_ARCHIVE_SHA, facial.VISEMES, "visemes"),
    ):
        path = source / archive
        if digest(path) != expected:
            raise ValueError(f"Unverified source archive: {archive}")
        inputs[archive] = expected
        with zipfile.ZipFile(path) as pack:
            for name in names:
                fragment = f"targets/{folder}/{name}.target"
                extracted = (
                    source / ("faceunits" if folder == "faceunits" else "visemes02") / fragment
                )
                if extracted.read_bytes() != pack.read(fragment):
                    raise ValueError(f"Unverified extracted expression: {name}")
                inputs[str(extracted.relative_to(source))] = digest(extracted)
    bpy.context.preferences.extensions.repos.new(
        name="Realistic human fixture build",
        module="river_oaks",
        custom_directory=str(source / "mpfb-src/mpfb2-2.0.17/src"),
    )
    bpy.ops.preferences.addon_enable(module="bl_ext.river_oaks.mpfb")
    from bl_ext.river_oaks.mpfb.services.humanservice import HumanService
    from bl_ext.river_oaks.mpfb.services.targetservice import TargetService

    def prepare(base):
        # The base exporter adds low-poly eyes. Replace only this new fixture's
        # eye mesh; no canonical file is loaded or changed.
        for obj in list(bpy.context.scene.objects):
            if obj.type == "MESH" and "low-poly" in obj.name:
                bpy.data.objects.remove(obj, do_unlink=True)
        for category, asset in (
            ("eyes", "high-poly"),
            ("eyebrows", "eyebrow001"),
            ("eyelashes", "eyelashes01"),
        ):
            path = assets / category / asset / f"{asset}.mhclo"
            obj = HumanService.add_mhclo_asset(
                str(path), base, asset_type=category, subdiv_levels=0
            )
            obj.data.materials.clear()
            surface = characters.material(
                path.parent / characters.fields(path)["material"],
                "eyes" if category == "eyes" else "hair",
            )
            obj.data.materials.append(surface)
            if category == "eyes":
                shader = surface.node_tree.nodes.get("Principled BSDF")
                texture = next(node for node in surface.node_tree.nodes if node.type == "TEX_IMAGE")
                surface.node_tree.links.new(texture.outputs["Alpha"], shader.inputs["Alpha"])
                surface.surface_render_method = "DITHERED"
                shader.inputs["Roughness"].default_value = 0.18
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
        modifier = base.modifiers.new("Portrait surface", "SUBSURF")
        modifier.levels = modifier.render_levels = 1
        facial.prepare_export(base, speech=True)
        # Blender's modifier-preservation helper leaves accessory key values at
        # one. Export the neutral basis on every surface, not only the body.
        for obj in bpy.context.scene.objects:
            if obj.type == "MESH" and obj.data.shape_keys:
                for key in obj.data.shape_keys.key_blocks:
                    key.value = 0
        bpy.context.view_layer.update()

    output.mkdir(parents=True, exist_ok=True)
    files = []
    for profile in PROFILES:
        if args.profile and profile[0] != args.profile:
            continue
        # Capture the exact input asset files, not just their nominal names.
        groups = [
            ("skins", profile[1]),
            ("clothes", profile[2]),
            ("hair", profile[3]),
            ("clothes", profile[4]),
            ("eyes", "high-poly"),
            ("eyes", "low-poly"),
            ("eyebrows", "eyebrow001"),
            ("eyelashes", "eyelashes01"),
            ("teeth", "teeth_base"),
            ("tongue", "tongue01"),
        ]
        for category, asset in groups:
            directory = assets / category / asset
            if not directory.is_dir():
                raise ValueError(f"Missing cached asset: {category}/{asset}")
            inputs.update(
                collect_inputs(
                    source, sorted(path for path in directory.rglob("*") if path.is_file())
                )
            )
        result = characters.build(
            profile, HumanService, TargetService, output_dir=output, prepare_export=prepare
        )
        result.update(
            eyes="high-poly",
            brows="eyebrow001",
            lashes="eyelashes01",
            bodySubdivision=1,
            expressions=list(EXPRESSIONS),
            blinks=["eyeBlinkLeft", "eyeBlinkRight"],
            visemes=list(facial.VISEMES),
        )
        files.append(result)
    # The cached tool supplies the base mesh, macro targets and rig definitions.
    tool = source / "mpfb-src/mpfb2-2.0.17/src/mpfb"
    tool_inputs = {
        str(path.relative_to(tool)): digest(path)
        for path in sorted(tool.rglob("*"))
        if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc"
    }
    generator_inputs = {
        f"scripts/{name}": digest(ROOT / "scripts" / name)
        for name in (
            "build_realistic_humans.py",
            "build_characters.py",
            "build_facial_candidates.py",
            "character_build_inputs.py",
        )
    }
    receipt = {
        "generator": "MPFB 2.0.17 / Blender " + bpy.app.version_string,
        "generatorScript": "scripts/build_realistic_humans.py",
        "generatorSha256": digest(Path(__file__)),
        "generatorInputs": generator_inputs,
        "blenderBinarySha256": digest(Path(bpy.app.binary_path)),
        "source": "https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html",
        "license": "CC0-1.0",
        "fictional_generic_appearance": True,
        "inputs": inputs,
        "toolInputsSha256": hashlib.sha256(
            json.dumps(tool_inputs, sort_keys=True).encode()
        ).hexdigest(),
        "toolInputs": tool_inputs,
        "files": files,
    }
    (output / "realistic-humans.sources.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print("REALISTIC_HUMANS", json.dumps({"files": files}))


if __name__ == "__main__":
    main()
