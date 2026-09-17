"""Run in UE5.6 Editor Python AFTER compiling the RiverOaks module.

Creates a fresh blockout map. Refuses to overwrite an existing map. This script
is a setup step, not a render/performance verification.
"""

import json
from pathlib import Path

import unreal

MAP = "/Game/Maps/RiverOaks"
MATERIAL = "/Game/Generated/M_Blockout"


def main():
    assets = unreal.EditorAssetLibrary
    if assets.does_asset_exist(MAP):
        raise RuntimeError(f"{MAP} already exists; open it or choose a new MAP path.")
    manifest_path = Path(unreal.Paths.project_content_dir()) / "Data" / "world.json"
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("schema_version") != 1 or not manifest.get("roads"):
        raise RuntimeError("Generate a schema-v1 manifest with roads before bootstrapping.")
    actor_class = unreal.load_class(None, "/Script/RiverOaks.RiverOaksWorld")
    if actor_class is None:
        raise RuntimeError("Compile RiverOaksEditor first; runtime class is missing.")
    if assets.does_asset_exist(MATERIAL):
        material = assets.load_asset(MATERIAL)
    else:
        assets.make_directory("/Game/Generated")
        material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
            "M_Blockout", "/Game/Generated", unreal.Material, unreal.MaterialFactoryNew()
        )
        color = unreal.MaterialEditingLibrary.create_material_expression(
            material, unreal.MaterialExpressionVectorParameter, -400, 0
        )
        color.set_editor_property("parameter_name", "Color")
        color.set_editor_property("default_value", unreal.LinearColor(0.4, 0.4, 0.4, 1))
        unreal.MaterialEditingLibrary.connect_material_property(
            color, "", unreal.MaterialProperty.MP_BASE_COLOR
        )
        roughness = unreal.MaterialEditingLibrary.create_material_expression(
            material, unreal.MaterialExpressionConstant, -400, 200
        )
        roughness.set_editor_property("r", 0.85)
        unreal.MaterialEditingLibrary.connect_material_property(
            roughness, "", unreal.MaterialProperty.MP_ROUGHNESS
        )
        unreal.MaterialEditingLibrary.recompile_material(material)
        assets.save_loaded_asset(material)
    assets.make_directory("/Game/Maps")
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    if not levels.new_level(MAP):
        raise RuntimeError("Could not create map; save your current level before retrying.")
    world = actors.spawn_actor_from_class(actor_class, unreal.Vector(0, 0, 0))
    world.set_actor_label("River Oaks GIS BLOCKOUT - not production art")
    world.set_editor_property("blockout_material", material)
    world.set_editor_property("agent_population", 300)
    sun = actors.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 1000))
    light = sun.get_component_by_class(unreal.DirectionalLightComponent)
    light.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    light.set_editor_property("atmosphere_sun_light", True)
    sun.set_actor_rotation(unreal.Rotator(-45, 35, 0), False)
    actors.spawn_actor_from_class(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0))
    sky = actors.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 0))
    sky_light = sky.get_component_by_class(unreal.SkyLightComponent)
    sky_light.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    sky_light.set_editor_property("real_time_capture", True)
    fog = actors.spawn_actor_from_class(unreal.ExponentialHeightFog, unreal.Vector(0, 0, 0))
    world.set_editor_property("sun", sun)
    world.set_editor_property("fog", fog)
    x, y, z = manifest["roads"][0]["points"][0]
    start = actors.spawn_actor_from_class(
        unreal.PlayerStart,
        unreal.Vector(x * 100, -y * 100, z * 100 + 1500),
        unreal.Rotator(-15, 0, 0),
    )
    start.set_actor_label("Fly camera start - WASD, mouse, E/Q vertical")
    if not levels.save_current_level():
        raise RuntimeError("Map save failed.")
    unreal.log("Saved River Oaks blockout map. Play to load geometry and agents from world.json.")


if __name__ == "__main__":
    main()
