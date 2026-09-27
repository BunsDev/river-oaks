"""Run inside Blender to export clothed CC0 MakeHuman residents as bounded GLB assets.

Source tools/asset packs live under ignored data/raw/characters. No user Blender
preferences are saved. Output identities are generic, never public-figure likenesses.
"""

import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/raw/characters"
ASSETS = SOURCE / "assets"
OUTPUT = ROOT / "preview/public/assets/characters"
PROFILES = [
    ("woman-casual", "young_african_female", "female_casualsuit01", "bob01", "shoes02", 0, 0.35),
    ("man-casual", "young_caucasian_male", "male_casualsuit02", "short01", "shoes01", 1, 0.4),
    (
        "woman-tailored",
        "middleage_caucasian_female",
        "female_elegantsuit01",
        "bob02",
        "shoes02",
        0,
        0.65,
    ),
    ("man-tailored", "middleage_african_male", "male_elegantsuit01", "short04", "shoes03", 1, 0.6),
    (
        "woman-daywear",
        "young_asian_female",
        "female_casualsuit02",
        "ponytail01",
        "shoes01",
        0,
        0.45,
    ),
    ("man-workwear", "middleage_asian_male", "male_worksuit01", "short02", "shoes04", 1, 0.55),
]


def fields(path):
    result = {}
    for line in path.read_text().splitlines():
        if line and not line.startswith("#") and " " in line:
            key, value = line.split(" ", 1)
            result[key] = value.strip()
    return result


def material(path, kind):
    """Use simple glTF-native PBR nodes, keeping licensed photographic diffuse maps."""
    values = fields(path)
    mat = bpy.data.materials.new(path.stem)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = 0.62 if kind == "skin" else 0.88
    shader.inputs["Specular IOR Level"].default_value = 0.26
    if kind == "skin":
        shader.inputs["Subsurface Weight"].default_value = 0.035
    for field, socket in [("diffuseTexture", "Base Color"), ("normalmapTexture", "Normal")]:
        if field not in values:
            continue
        image = bpy.data.images.load(str(path.parent / values[field]), check_existing=True)
        limit = 2048 if kind == "skin" else 512 if kind == "eyes" else 1024
        if max(image.size) > limit:
            ratio = limit / max(image.size)
            image.scale(round(image.size[0] * ratio), round(image.size[1] * ratio))
        image.pack()
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = image
        if socket == "Normal":
            image.colorspace_settings.name = "Non-Color"
            normal = nodes.new("ShaderNodeNormalMap")
            normal.inputs["Strength"].default_value = 0.55
            links.new(texture.outputs["Color"], normal.inputs["Color"])
            links.new(normal.outputs["Normal"], shader.inputs[socket])
        else:
            links.new(texture.outputs["Color"], shader.inputs[socket])
            if kind == "hair":
                links.new(texture.outputs["Alpha"], shader.inputs["Alpha"])
                mat.surface_render_method = "DITHERED"
    return mat


def build(profile, human_service, target_service, *, output_dir=OUTPUT, prepare_export=None):
    name, skin_name, outfit, hair, shoes, gender, age = profile
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    macro = target_service.get_default_macro_info_dict()
    macro.update(gender=gender, age=age, muscle=0.4, weight=0.46, height=0.5)
    base = human_service.create_human(macro_detail_dict=macro)
    base.name = name
    base.data.materials.clear()
    base.data.materials.append(
        material(ASSETS / "skins" / skin_name / f"{skin_name}.mhmat", "skin")
    )
    rig = human_service.add_builtin_rig(base, "game_engine")
    for category, asset, kind in [
        ("eyes", "low-poly", "eyes"),
        ("clothes", outfit, "cloth"),
        ("clothes", shoes, "cloth"),
        ("hair", hair, "hair"),
    ]:
        path = ASSETS / category / asset / f"{asset}.mhclo"
        obj = human_service.add_mhclo_asset(str(path), base, asset_type=category, subdiv_levels=0)
        obj.data.materials.clear()
        obj.data.materials.append(material(path.parent / fields(path)["material"], kind))
    # Bring the upper arms from the modeling pose to a relaxed standing pose.
    for side, sign in [("l", 1), ("r", -1)]:
        bone = rig.pose.bones[f"upperarm_{side}"]
        original = (bone.bone.tail_local - bone.bone.head_local).normalized()
        target = Vector((sign * 0.17, -0.02, -1)).normalized()
        rotation = original.rotation_difference(target)
        rest = bone.bone.matrix_local.to_quaternion()
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = rest.inverted() @ rotation @ rest
    bpy.context.view_layer.update()
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
    if prepare_export:
        prepare_export(base)
    path = output_dir / f"{name}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_apply=prepare_export is None,
        export_animations=False,
        export_skins=True,
        export_morph=prepare_export is not None,
        export_current_frame=True,
        export_rest_position_armature=False,
        export_reset_pose_bones=False,
        export_image_format="WEBP",
        export_image_quality=82,
        export_extras=False,
    )
    if not path.is_file() or path.stat().st_size > 12 * 1024 * 1024:
        raise ValueError(f"Character output missing or above its 12 MiB budget: {name}")
    return {
        "id": name,
        "path": f"/assets/characters/{name}.glb",
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "skin": skin_name,
        "outfit": outfit,
        "hair": hair,
        "shoes": shoes,
        "license": "CC0-1.0",
    }


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.extensions.repos.new(
        name="River Oaks asset build",
        module="river_oaks",
        custom_directory=str(SOURCE / "mpfb-src/mpfb2-2.0.17/src"),
    )
    bpy.ops.preferences.addon_enable(module="bl_ext.river_oaks.mpfb")
    from bl_ext.river_oaks.mpfb.services.humanservice import HumanService
    from bl_ext.river_oaks.mpfb.services.targetservice import TargetService

    requested = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    profiles = [p for p in PROFILES if not requested or p[0] in requested]
    if not profiles:
        raise ValueError("Unknown character profile")
    files = [build(profile, HumanService, TargetService) for profile in profiles]
    manifest = {
        "generator": "MPFB 2.0.17 / Blender " + bpy.app.version_string,
        "source": "https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html",
        "license": "CC0-1.0",
        "fictional_generic_appearance": True,
        "files": files,
    }
    (OUTPUT / "sources.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(
        "CHARACTER_BUILD",
        json.dumps({"files": len(files), "bytes": sum(f["bytes"] for f in files)}),
    )


if __name__ == "__main__":
    main()
