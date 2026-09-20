"""Import the six prepared GLBs, build explicit materials, and configure the district.

Run scripts/prepare_native_characters.py first. Uses only its verified output and
refuses to overwrite existing content unless a matching import receipt exists.
"""

import hashlib
import json
import re
import struct
from pathlib import Path

import unreal

ROOT = Path(unreal.Paths.project_dir()).parent
SOURCE = ROOT / "data/generated/native-characters"
DESTINATION = "/Game/Generated/Residents"
MAP = "/Game/Maps/RiverOaksDistrict"
RECEIPT = SOURCE / "unreal-import.json"
IMPORT_VERSION = 2


def glb_document(path):
    data = path.read_bytes()
    size = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20 : 20 + size])


def asset_name(name):
    return re.sub(r"[^A-Za-z0-9_-]", "_", name)


def make_material(info, document, textures, folder):
    library = unreal.MaterialEditingLibrary
    material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        "M_" + asset_name(info["name"]), folder, unreal.Material, unreal.MaterialFactoryNew()
    )
    if not material:
        raise RuntimeError("Could not create material " + info["name"])
    library.set_material_usage(material, unreal.MaterialUsage.MATUSAGE_SKELETAL_MESH)
    pbr = info.get("pbrMetallicRoughness", {})

    def sample(reference, normal=False):
        image = document["images"][document["textures"][reference["index"]]["source"]]
        texture = textures[asset_name(image["name"])]
        if normal:
            texture.set_editor_property("srgb", False)
            texture.set_editor_property(
                "compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP
            )
            unreal.EditorAssetLibrary.save_loaded_asset(texture)
        node = library.create_material_expression(material, unreal.MaterialExpressionTextureSample)
        node.set_editor_property("texture", texture)
        if normal:
            node.set_editor_property("sampler_type", unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
        return node

    base = sample(pbr["baseColorTexture"])
    library.connect_material_property(base, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)
    if info.get("alphaMode", "OPAQUE") != "OPAQUE":
        material.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
        material.set_editor_property("two_sided", True)
        material.set_editor_property("opacity_mask_clip_value", 0.4)
        library.connect_material_property(base, "A", unreal.MaterialProperty.MP_OPACITY_MASK)
    if "normalTexture" in info:
        normal = sample(info["normalTexture"], True)
        library.connect_material_property(normal, "RGB", unreal.MaterialProperty.MP_NORMAL)
    roughness = library.create_material_expression(material, unreal.MaterialExpressionConstant)
    roughness.set_editor_property("r", pbr.get("roughnessFactor", 0.85))
    library.connect_material_property(roughness, "", unreal.MaterialProperty.MP_ROUGHNESS)
    library.recompile_material(material)
    if not unreal.EditorAssetLibrary.save_loaded_asset(material):
        raise RuntimeError("Material save failed")
    return material


def import_profile(entry):
    source = SOURCE / entry["filename"]
    folder = DESTINATION + "/" + entry["id"].replace("-", "_")
    if hashlib.sha256(source.read_bytes()).hexdigest() != entry["sha256"]:
        raise ValueError("Prepared source hash mismatch: " + entry["id"])
    if unreal.EditorAssetLibrary.does_directory_exist(folder):
        raise RuntimeError("Refusing to overwrite unreceipted content: " + folder)
    pipeline = unreal.InterchangeGenericAssetsPipeline()
    # Python's native MakeRotator uses roll/pitch/yaw order. Name yaw explicitly:
    # glTF +Z forward becomes Unreal +Y, then yaw -90 maps it to +X.
    pipeline.set_editor_property("import_offset_rotation", unreal.Rotator(yaw=-90))
    pipeline.mesh_pipeline.set_editor_property("import_static_meshes", False)
    pipeline.mesh_pipeline.set_editor_property("import_skeletal_meshes", True)
    pipeline.mesh_pipeline.set_editor_property("create_physics_asset", False)
    pipeline.material_pipeline.set_editor_property("import_materials", False)
    stack = unreal.InterchangePipelineStackOverride()
    stack.add_pipeline(pipeline)
    task = unreal.AssetImportTask()
    task.filename = str(source)
    task.destination_path = folder
    task.automated = True
    task.save = True
    task.options = stack
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    objects = task.get_objects()
    meshes = [asset for asset in objects if isinstance(asset, unreal.SkeletalMesh)]
    if len(meshes) != 1:
        raise RuntimeError(
            f"Expected one combined skeletal mesh for {entry['id']}, got {len(meshes)}"
        )
    mesh = meshes[0]
    textures = {asset.get_name(): asset for asset in objects if isinstance(asset, unreal.Texture2D)}
    document = glb_document(source)
    materials = {
        asset_name(item["name"]): make_material(item, document, textures, folder)
        for item in document["materials"]
    }
    slots = list(mesh.get_editor_property("materials"))
    for slot in slots:
        name = str(slot.get_editor_property("imported_material_slot_name"))
        if name not in materials:
            raise RuntimeError("Unmapped material slot: " + name)
        slot.set_editor_property("material_interface", materials[name])
    mesh.set_editor_property("materials", slots)
    if not unreal.EditorAssetLibrary.save_loaded_asset(mesh):
        raise RuntimeError("Skeletal mesh save failed")
    return {
        "sha256": entry["sha256"],
        "import_version": IMPORT_VERSION,
        "mesh": mesh.get_path_name(),
        "materials": len(slots),
    }


def main():
    manifest = json.loads((SOURCE / "manifest.json").read_text())
    catalogue = json.loads((ROOT / "preview/public/assets/characters/sources.json").read_text())
    if {item["id"] for item in manifest["files"]} != {item["id"] for item in catalogue["files"]}:
        raise ValueError("Prepared characters must cover the full catalogue")
    receipt = json.loads(RECEIPT.read_text()) if RECEIPT.exists() else {}
    for entry in manifest["files"]:
        previous = receipt.get(entry["id"])
        if previous:
            if (
                previous.get("import_version") != IMPORT_VERSION
                or previous["sha256"] != entry["sha256"]
                or not unreal.load_asset(previous["mesh"])
            ):
                raise RuntimeError("Existing import receipt is stale: " + entry["id"])
        else:
            receipt[entry["id"]] = import_profile(entry)
            RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n")
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if not levels.load_level(MAP):
        raise RuntimeError("Bootstrap the district map first")
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
    worlds = [actor for actor in actors if actor.get_class().get_name() == "RiverOaksWorld"]
    if len(worlds) != 1:
        raise RuntimeError("Expected one RiverOaksWorld actor")
    anim_class = unreal.load_class(None, "/Script/RiverOaks.RiverProceduralAnimInstance")
    if not anim_class:
        raise RuntimeError("Build RiverOaksEditor with procedural locomotion first")
    appearances = {}
    for key, item in receipt.items():
        appearance = unreal.RiverSkeletalAppearance()
        appearance.set_editor_property("mesh", unreal.load_asset(item["mesh"]))
        appearance.set_editor_property("anim_class", anim_class)
        appearances[key] = appearance
    worlds[0].set_editor_property("resident_appearances", appearances)
    if not levels.save_current_level():
        raise RuntimeError("Configured district map save failed")
    unreal.log(f"RIVER_RESIDENTS_READY profiles={len(appearances)} map={MAP}")


if __name__ == "__main__":
    main()
