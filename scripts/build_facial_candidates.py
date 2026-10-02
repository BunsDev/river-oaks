"""Build isolated facial donors; never overwrite the shipped character assets.

Run with the same bpy/MPFB environment as build_jevica.py. Merge compatible
donors onto original GLBs with add-facial-targets.mjs after visual verification.
"""

import hashlib
import json
import os
import sys
import zipfile
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_characters import ASSETS, PROFILES, SOURCE, build, fields, material

TARGETS = ("eyeBlinkLeft", "eyeBlinkRight")
VISEMES = tuple(
    f"viseme_{name}"
    for name in (
        "sil",
        "PP",
        "FF",
        "TH",
        "DD",
        "kk",
        "CH",
        "SS",
        "nn",
        "RR",
        "aa",
        "E",
        "I",
        "O",
        "U",
    )
)

# Face-shape targets from MPFB's own catalogue (CC0), giving residents on a shared
# rig different faces at runtime. Left/right pairs are driven together.
FACE_SHAPES = (
    # head-round, head-oval and forehead-temple-incr touch most of the head
    # (120-220 KB each) and are left out.
    "head-square",
    "head-triangular",
    "nose-hump-incr",
    "nose-scale-horiz-incr",
    "nose-scale-horiz-decr",
    "nose-scale-vert-incr",
    "nose-point-up",
    "mouth-scale-horiz-incr",
    "mouth-scale-horiz-decr",
    "mouth-upperlip-volume-incr",
    "mouth-lowerlip-volume-incr",
    "chin-prominent-incr",
    "chin-width-incr",
    "chin-width-decr",
    "chin-height-incr",
    "l-cheek-bones-incr",
    "r-cheek-bones-incr",
    "l-cheek-volume-incr",
    "r-cheek-volume-incr",
    "l-eye-scale-incr",
    "r-eye-scale-incr",
    "l-eye-trans-out",
    "r-eye-trans-out",
    "eyebrows-trans-up",
    "eyebrows-trans-down",
)


def prepare_export(base, *, speech=False, faces=False):
    from bl_ext.river_oaks.mpfb.entities.clothes.mhclo import Mhclo
    from bl_ext.river_oaks.mpfb.entities.objectproperties import GeneralObjectProperties
    from bl_ext.river_oaks.mpfb.services.exportservice import ExportService
    from bl_ext.river_oaks.mpfb.services.objectservice import ObjectService
    from bl_ext.river_oaks.mpfb.services.targetservice import TargetService
    from mathutils import Vector

    targets = TARGETS + (VISEMES if speech else ()) + (FACE_SHAPES if faces else ())
    if speech:
        from bl_ext.river_oaks.mpfb.services.humanservice import HumanService

        for category, asset in (("teeth", "teeth_base"), ("tongue", "tongue01")):
            path = ASSETS / category / asset / f"{asset}.mhclo"
            obj = HumanService.add_mhclo_asset(
                str(path), base, asset_type=category, subdiv_levels=0
            )
            obj.data.materials.clear()
            obj.data.materials.append(material(path.parent / fields(path)["material"], category))
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
    # Preserve every fitted macro and accessory before loading facial deltas.
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and obj.data.shape_keys:
            TargetService.bake_targets(obj)
    for name in targets:
        if name in FACE_SHAPES:
            TargetService.load_target(base, str(TargetService.target_full_path(name)), name=name)
            continue
        folder = "visemes02/targets/visemes" if name in VISEMES else "faceunits/targets/faceunits"
        TargetService.load_target(base, str(SOURCE / folder / f"{name}.target"), name=name)
    # Resolve the cached assets explicitly. The headless build does not install
    # them into MPFB's user library, where its default interpolator searches.
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or obj == base:
            continue
        fragment = GeneralObjectProperties.get_value("asset_source", entity_reference=obj)
        if not fragment:
            continue
        path = ASSETS / ObjectService.get_object_type(obj).lower() / fragment
        if not path.is_file():
            raise ValueError(f"Cannot resolve facial accessory: {path}")
        mapping = Mhclo()
        mapping.load(str(path))
        for name in targets:
            source = base.data.shape_keys.key_blocks[name]
            offsets = []
            for index, vertex in mapping.verts.items():
                delta = sum(
                    (
                        (source.data[v].co - base.data.vertices[v].co) * w
                        for v, w in zip(vertex["verts"], vertex["weights"])
                    ),
                    Vector(),
                )
                if delta.length > 1e-7:
                    offsets.append((index, delta))
            if not offsets:
                continue
            if not obj.data.shape_keys:
                obj.shape_key_add(name="Basis", from_mix=False)
            target = obj.shape_key_add(name=name, from_mix=False)
            for index, delta in offsets:
                target.data[index].co += delta
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            continue
        modifiers = [m.name for m in obj.modifiers if m.type in {"MASK", "SUBSURF"}]
        ExportService._apply_modifiers_keep_shapekeys(obj, modifiers)


def main():
    speech = "--speech" in sys.argv
    faces = "--faces" in sys.argv
    archive = SOURCE / "faceunits01.zip"
    if (
        hashlib.sha256(archive.read_bytes()).hexdigest()
        != "d113107bd7eb59f3af4df6fc0ec29bfcc593f496d0b336aec14f086a80ce7146"
    ):
        raise ValueError("Run the character asset fetcher to verify Faceunits 01")
    with zipfile.ZipFile(archive) as pack:
        for name in TARGETS:
            fragment = f"targets/faceunits/{name}.target"
            if (SOURCE / "faceunits" / fragment).read_bytes() != pack.read(fragment):
                raise ValueError(f"Extracted target differs from the verified archive: {name}")
    if speech:
        archive = SOURCE / "visemes02.zip"
        if (
            hashlib.sha256(archive.read_bytes()).hexdigest()
            != "a69ab6fb95ddd5f56f70acc7e859f5f9c6ae613c527d577ea1571eff2183d29e"
        ):
            raise ValueError("Run the character asset fetcher to verify Visemes 02")
        with zipfile.ZipFile(archive) as pack:
            for name in VISEMES:
                fragment = f"targets/visemes/{name}.target"
                if (SOURCE / "visemes02" / fragment).read_bytes() != pack.read(fragment):
                    raise ValueError(f"Extracted target differs from the verified archive: {name}")
    profile = sys.argv[-1]
    if profile not in [p[0] for p in PROFILES] + ["jevica"]:
        raise ValueError("Pass one character profile, including jevica")
    output = SOURCE / ("speech-candidates" if speech else "face-variety-candidates" if faces else "face-candidates")
    output.mkdir(exist_ok=True)

    def prepare(base):
        return prepare_export(base, speech=speech, faces=faces)

    if profile == "jevica":
        from build_jevica import main as build_jevica

        build_jevica(output_dir=output, prepare_export=prepare)
    else:
        bpy.context.preferences.extensions.repos.new(
            name="Facial candidate build",
            module="river_oaks",
            custom_directory=str(SOURCE / "mpfb-src/mpfb2-2.0.17/src"),
        )
        bpy.ops.preferences.addon_enable(module="bl_ext.river_oaks.mpfb")
        from bl_ext.river_oaks.mpfb.services.humanservice import HumanService
        from bl_ext.river_oaks.mpfb.services.targetservice import TargetService

        receipt = build(
            next(p for p in PROFILES if p[0] == profile),
            HumanService,
            TargetService,
            output_dir=output,
            prepare_export=prepare,
        )
        (output / f"{profile}.sources.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print("FACIAL_CANDIDATE", profile, str(output / f"{profile}.glb"))


if __name__ == "__main__":
    main()
    if not bpy.app.binary_path:
        sys.stdout.flush()
        os._exit(0)
