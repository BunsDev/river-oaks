"""Build Jevica's dedicated CC0 mesh with the locally cached MPFB system assets.

Run with Blender's Python (or bpy 4.5.3). Uses the resident proportions and rig,
adds subdivision, high detail eyes, lashes and long hair; never rewrites residents.
"""

import hashlib
import json
import os
import sys
from pathlib import Path

import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_characters import ASSETS, OUTPUT, SOURCE, fields, material


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.context.preferences.extensions.repos.new(
        name="Jevica asset build",
        module="river_oaks",
        custom_directory=str(SOURCE / "mpfb-src/mpfb2-2.0.17/src"),
    )
    bpy.ops.preferences.addon_enable(module="bl_ext.river_oaks.mpfb")
    from bl_ext.river_oaks.mpfb.services.humanservice import HumanService
    from bl_ext.river_oaks.mpfb.services.targetservice import TargetService

    macro = TargetService.get_default_macro_info_dict()
    macro.update(gender=0, age=0.45, muscle=0.4, weight=0.46, height=0.5)
    base = HumanService.create_human(macro_detail_dict=macro)
    base.name = "Jevica"
    skin = material(ASSETS / "skins/young_asian_female/young_asian_female.mhmat", "skin")
    base.data.materials.clear()
    base.data.materials.append(skin)
    HumanService.add_builtin_rig(base, "game_engine")

    # A fitted shell follows the body's existing weights, including the waist.
    # Masked helper geometry is removed before extracting the garment surface.
    bodice = base.copy()
    bodice.data = base.data.copy()
    bodice.name = "Jevica fitted bodice"
    bpy.context.collection.objects.link(bodice)
    bpy.context.view_layer.objects.active = bodice
    if bodice.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for modifier in list(bodice.modifiers):
        if modifier.type == "MASK":
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    bm = bmesh.new()
    bm.from_mesh(bodice.data)
    remove = []
    for face in bm.faces:
        center = face.calc_center_median()
        neckline = 1.235 - 0.055 * max(0, 1 - abs(center.x) / 0.13)
        if center.z < 0.78 or center.z > neckline or abs(center.x) > 0.195:
            remove.append(face)
    bmesh.ops.delete(bm, geom=remove, context="FACES")
    boundary = [vertex for vertex in bm.verts if vertex.is_boundary]
    for _ in range(6):
        bmesh.ops.smooth_vert(
            bm, verts=boundary, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True
        )
    for _ in range(3):
        bmesh.ops.smooth_vert(
            bm, verts=list(bm.verts), factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True
        )
    bm.normal_update()
    for vertex in bm.verts:
        vertex.co += vertex.normal * 0.008
    bm.to_mesh(bodice.data)
    bm.free()
    silk = bpy.data.materials.new("jevica_silk")
    silk.use_nodes = True
    shader = silk.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.65, 0.27, 0.38, 1)
    shader.inputs["Roughness"].default_value = 0.43
    bodice.data.materials.clear()
    bodice.data.materials.append(silk)
    for obj in [base, bodice]:
        modifier = obj.modifiers.new("Portrait surface", "SUBSURF")
        modifier.levels = modifier.render_levels = 1

    for category, asset, kind in [
        ("eyes", "high-poly", "eyes"),
        ("hair", "long01", "hair"),
        ("eyelashes", "eyelashes01", "hair"),
        ("eyebrows", "eyebrow001", "hair"),
        ("clothes", "shoes01", "cloth"),
    ]:
        path = ASSETS / category / asset / f"{asset}.mhclo"
        obj = HumanService.add_mhclo_asset(str(path), base, asset_type=category, subdiv_levels=0)
        obj.data.materials.clear()
        surface = material(path.parent / fields(path)["material"], kind)
        obj.data.materials.append(surface)
        if category == "eyebrows":
            surface.name = "jevica_brows"
        if category == "eyes":
            surface.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value = 0.18
            # High-poly eyes include a corneal shell masked by the source alpha.
            shader = surface.node_tree.nodes.get("Principled BSDF")
            texture = next(node for node in surface.node_tree.nodes if node.type == "TEX_IMAGE")
            surface.node_tree.links.new(texture.outputs["Alpha"], shader.inputs["Alpha"])
            surface.surface_render_method = "DITHERED"
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
    path = OUTPUT / "jevica.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_apply=True,
        export_animations=False,
        export_skins=True,
        export_morph=False,
        export_image_format="WEBP",
        export_image_quality=92,
    )
    if path.stat().st_size > 12 * 1024 * 1024:
        raise ValueError("Jevica exceeds her 12 MiB asset budget")
    manifest = {
        "id": "jevica",
        "path": "/assets/characters/jevica.glb",
        "generator": "MPFB 2.0.17 / Blender " + bpy.app.version_string,
        "source": "MakeHuman system assets; see sources.json and LICENSE-CC0.md",
        "license": "CC0-1.0",
        "fictional_generic_appearance": True,
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "skin": "young_asian_female",
        "hair": "long01",
        "eyes": "high-poly",
        "eyelashes": "eyelashes01",
        "eyebrows": "eyebrow001",
        "body_subdivision": 1,
        "costume": "Original fitted shell; runtime draped skirt, tiara and wand",
    }
    (OUTPUT / "jevica.sources.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("JEVICA_BUILD", json.dumps(manifest))


if __name__ == "__main__":
    main()
    # The standalone bpy wheel can crash during extension teardown on macOS.
    # Only bypass interpreter teardown after export, budget and receipt succeed.
    if not bpy.app.binary_path:
        sys.stdout.flush()
        os._exit(0)
