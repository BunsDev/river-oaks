"""Build Prince Jev's dedicated CC0 hero mesh from MPFB and the shipped residents.

Run with Blender's Python (or bpy 4.5.3). Needs only the MPFB source under
data/raw/characters/mpfb-src; the CC0 system asset clothing, hair, eyes and
skin are taken from the already-built GLBs in preview/public/assets/characters.

MPFB bodies share one base-mesh topology, so each donor GLB's clothes are moved
onto the prince with a surface-deform driver whose basis is the donor's body
and whose shape key is the prince's body. The clothes keep their original
MakeHuman skin weights, the donor's skin mask hides skin under the suit, and
the donor's blink morphs are carried over by base-mesh vertex index.
"""

import hashlib
import json
import os
import sys
from pathlib import Path

import bpy
from mathutils.kdtree import KDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_characters import OUTPUT, SOURCE

MACRO = {
    "gender": 1,
    "age": 0.5,
    "muscle": 0.62,
    "weight": 0.44,
    "height": 0.62,
    "proportions": 0.85,
}
# Hero-only art direction: a defined jaw and cheekbones, a straighter nose,
# a steady brow and a broader, athletic upper body.
DETAILS = {
    "chin/chin-prominent-incr": 0.25,
    "chin/chin-width-incr": 0.12,
    "chin/chin-bones-incr": 0.3,
    "cheek/l-cheek-bones-incr": 0.3,
    "cheek/r-cheek-bones-incr": 0.3,
    "cheek/l-cheek-volume-decr": 0.15,
    "cheek/r-cheek-volume-decr": 0.15,
    "head/head-square": 0.22,
    "head/head-fat-decr": 0.25,
    "nose/nose-scale-horiz-decr": 0.12,
    "nose/nose-point-width-decr": 0.18,
    "nose/nose-hump-decr": 0.3,
    "eyebrows/eyebrows-trans-down": 0.1,
    "mouth/mouth-lowerlip-volume-incr": 0.08,
    "neck/measure-neck-circ-incr": 0.2,
    "torso/measure-shoulder-dist-incr": 0.35,
    "torso/torso-muscle-pectoral-incr": 0.2,
    "torso/torso-muscle-dorsi-incr": 0.25,
}
CHARACTERS = Path(__file__).resolve().parents[1] / "preview/public/assets/characters"
TAILORED = {"gender": 1, "age": 0.6, "muscle": 0.4, "weight": 0.46, "height": 0.5}
OWEN = {"gender": 1, "age": 0.55, "muscle": 0.4, "weight": 0.46, "height": 0.5}
JEVICA = json.loads((CHARACTERS / "jevica.sources.json").read_text())


def human(services, macro, details=None):
    human_service, target_service = services
    values = target_service.get_default_macro_info_dict()
    values.update(macro)
    obj = human_service.create_human(macro_detail_dict=values)
    targets = SOURCE / "mpfb-src/mpfb2-2.0.17/src/mpfb/data/targets"
    for target, weight in (details or {}).items():
        target_service.load_target(obj, str(targets / f"{target}.target.gz"), weight=weight)
    return obj


def bake(obj):
    """Freeze MPFB's target shape keys into plain base-mesh coordinates."""
    bpy.context.view_layer.objects.active = obj
    if obj.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for modifier in list(obj.modifiers):
        obj.modifiers.remove(modifier)
    return [obj.matrix_world @ v.co for v in obj.data.vertices]


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [o for o in bpy.data.objects if o not in before]


def adopt_owen_head(prince, reference, prince_rig, reference_rig):
    """Fit Owen's indexed MPFB head onto Jev, blending only the neck seam."""
    head = prince_rig.data.bones["head"]
    donor = reference_rig.data.bones["head"]
    origin = prince_rig.matrix_world @ head.head_local
    donor_origin = reference_rig.matrix_world @ donor.head_local
    scale = head.length / donor.length
    head_group = prince.vertex_groups["head"].index
    inverse = prince.matrix_world.inverted()
    for vertex, source in zip(prince.data.vertices, reference.data.vertices, strict=True):
        weight = sum(group.weight for group in vertex.groups if group.group == head_group)
        if weight:
            point = prince.matrix_world @ vertex.co
            fitted = (reference.matrix_world @ source.co - donor_origin) * scale + origin
            vertex.co = inverse @ point.lerp(fitted, weight)
    return scale


def match(body, base_points):
    """Map each donor-body vertex to its base-mesh index by rest position."""
    tree = KDTree(len(base_points))
    for i, point in enumerate(base_points):
        tree.insert(point, i)
    tree.balance()
    result = []
    for vertex in body.data.vertices:
        _, index, distance = tree.find(body.matrix_world @ vertex.co)
        if distance > 1e-3:
            raise ValueError(f"{body.name} does not match its MPFB base mesh ({distance:.4f} m)")
        result.append(index)
    return result


def transplant(meshes, donor_points, prince_points):
    """Surface-deform donor garments from the donor body onto the prince."""
    driver = bpy.data.objects.new("Transfer driver", bpy.data.meshes.new("Transfer driver"))
    template = bpy.data.objects["Prince Jev"].data
    driver.data = template.copy()
    bpy.context.collection.objects.link(driver)
    for vertex, point in zip(driver.data.vertices, donor_points, strict=True):
        vertex.co = point
    driver.shape_key_add(name="Basis")
    key = driver.shape_key_add(name="Prince")
    for data, point in zip(key.data, prince_points, strict=True):
        data.co = point
    # Bind only to the skin: MPFB's skirt, tights and joint helpers overlap
    # the hands and hips and would otherwise capture the sleeves.
    helpers = {
        group.index
        for group in driver.vertex_groups
        if group.name in {"HelperGeometry", "JointCubes"}
    }
    bpy.context.view_layer.objects.active = driver
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for vertex in driver.data.vertices:
        vertex.select = any(g.group in helpers for g in vertex.groups)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for obj in meshes:
        # Bind in the rest (bind) pose: the donor rigs' nodes carry a relaxed
        # arm pose that the importer would otherwise apply to the sleeves.
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
        for modifier in list(obj.modifiers):
            obj.modifiers.remove(modifier)
        modifier = obj.modifiers.new("Transfer", "SURFACE_DEFORM")
        modifier.target = driver
        with bpy.context.temp_override(object=obj, active_object=obj):
            bpy.ops.object.surfacedeform_bind(modifier=modifier.name)
    key.value = 1
    bpy.context.view_layer.update()
    for obj in meshes:
        for modifier in list(obj.modifiers):
            if modifier.type != "SURFACE_DEFORM":
                obj.modifiers.remove(modifier)
        # Shape keys (Jevica's lash blinks) block applying a modifier, so each
        # key is evaluated through the deformation and rebuilt afterwards.
        keys = obj.data.shape_keys.key_blocks if obj.data.shape_keys else []
        shapes = {}
        for index in range(len(keys)):
            for other, block in enumerate(keys):
                block.value = 1.0 if other == index and index else 0.0
            bpy.context.view_layer.update()
            evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            shapes[keys[index].name] = [v.co.copy() for v in evaluated.data.vertices]
        if keys:
            names = [block.name for block in keys]
            obj.shape_key_clear()
            obj.modifiers.remove(obj.modifiers["Transfer"])
            for vertex, point in zip(obj.data.vertices, shapes[names[0]], strict=True):
                vertex.co = point
            for name in names:
                block = obj.shape_key_add(name=name)
                for data, point in zip(block.data, shapes[name], strict=True):
                    data.co = point
        else:
            with bpy.context.temp_override(object=obj, active_object=obj):
                bpy.ops.object.modifier_apply(modifier="Transfer")
    bpy.data.objects.remove(driver)


def main(*, output_dir=OUTPUT):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.context.preferences.extensions.repos.new(
        name="Prince Jev asset build",
        module="river_oaks",
        custom_directory=str(SOURCE / "mpfb-src/mpfb2-2.0.17/src"),
    )
    bpy.ops.preferences.addon_enable(module="bl_ext.river_oaks.mpfb")
    from bl_ext.river_oaks.mpfb.services.humanservice import HumanService
    from bl_ext.river_oaks.mpfb.services.targetservice import TargetService

    services = (HumanService, TargetService)
    prince = human(services, MACRO, DETAILS)
    prince.name = "Prince Jev"
    bake(prince)
    rig = HumanService.add_builtin_rig(prince, "game_engine")
    owen = human(services, OWEN)
    owen_points = bake(owen)
    owen_rig = HumanService.add_builtin_rig(owen, "game_engine")
    head_scale = adopt_owen_head(prince, owen, rig, owen_rig)
    prince_points = [prince.matrix_world @ vertex.co for vertex in prince.data.vertices]
    tailored = human(services, TAILORED)
    tailored_points = bake(tailored)
    jevica = human(services, JEVICA["macro"], JEVICA["detail_targets"])
    jevica_points = bake(jevica)
    for obj in (tailored, jevica, owen, owen_rig):
        bpy.data.objects.remove(obj)

    # Suit, shoes and masked skin from the tailored resident; Owen's hair;
    # eyes, brows and lashes from Jevica's hero build.
    donor = import_glb(CHARACTERS / "man-tailored.glb")
    donor_body = next(o for o in donor if o.type == "MESH" and o.data.shape_keys)
    visible = match(donor_body, tailored_points)
    garments = [
        o
        for o in donor
        if o.type == "MESH"
        and o.data.name.split(".")[0] in {"male_elegantsuit01", "shoes03"}
    ]
    transplant(garments, tailored_points, prince_points)
    reference = import_glb(CHARACTERS / "man-workwear.glb")
    hair = [o for o in reference if o.type == "MESH" and o.data.name.split(".")[0] == "short02"]
    if len(hair) != 1:
        raise ValueError("Owen's short02 hair was not found")
    transplant(hair, owen_points, prince_points)
    garments.extend(hair)
    hero = import_glb(CHARACTERS / "jevica.glb")
    features = [
        o
        for o in hero
        if o.type == "MESH"
        and o.data.name.split(".")[0] in {"high-poly", "eyebrow001", "eyelashes01"}
    ]
    if len(features) != 3 or len(garments) != 3:
        raise ValueError("Donor garments or Jevica's eyes, brows and lashes were not all found")
    transplant(features, jevica_points, prince_points)
    for feature in features:
        if feature.data.name.startswith("eyebrow001"):
            feature.material_slots[0].material.name = "eyebrow001"

    # Body: skin material and mask from the donor, blinks by base-mesh index.
    prince.data.materials.clear()
    prince.data.materials.append(donor_body.material_slots[0].material)
    prince.shape_key_add(name="Basis")
    for block in donor_body.data.shape_keys.key_blocks[1:]:
        key = prince.shape_key_add(name=block.name)
        for donor_index, base_index in enumerate(visible):
            offset = block.data[donor_index].co - donor_body.data.vertices[donor_index].co
            key.data[base_index].co = (
                prince.data.vertices[base_index].co + donor_body.matrix_world.to_3x3() @ offset
            )
    keep = set(visible)
    bpy.context.view_layer.objects.active = prince
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for vertex in prince.data.vertices:
        vertex.select = vertex.index not in keep
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")

    # Garments keep their MakeHuman weights; bind them to the prince's rig.
    for obj in garments + features:
        obj.parent = rig
        modifier = obj.modifiers.new("Armature", "ARMATURE")
        modifier.object = rig
    for obj in list(bpy.data.objects):
        if obj.name not in {prince.name, rig.name} and obj not in garments + features:
            bpy.data.objects.remove(obj)
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            for polygon in obj.data.polygons:
                polygon.use_smooth = True

    path = output_dir / "prince-jev.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_apply=False,
        export_animations=False,
        export_skins=True,
        export_morph=True,
        export_image_format="WEBP",
        export_image_quality=90,
        export_extras=False,
    )
    if path.stat().st_size > 12 * 1024 * 1024:
        raise ValueError("Prince Jev exceeds his 12 MiB asset budget")
    manifest = {
        "id": "prince-jev",
        "path": "/assets/characters/prince-jev.glb",
        "generator": "MPFB 2.0.17 / Blender " + bpy.app.version_string,
        "source": (
            "MakeHuman CC0 assets via man-tailored.glb, man-workwear.glb and jevica.glb; "
            "see sources.json"
        ),
        "license": "CC0-1.0",
        "fictional_generic_appearance": True,
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "skin": "middleage_african_male (texture), young hero proportions",
        "outfit": "male_elegantsuit01",
        "hair": "short02",
        "shoes": "shoes03",
        "eyes": "high-poly",
        "eyelashes": "eyelashes01",
        "eyebrows": "eyebrow001",
        "macro": MACRO,
        "detail_targets": DETAILS,
        "appearance_reference": {
            "id": "local-11",
            "name": "Owen",
            "profile": "man-workwear",
            "sha256": hashlib.sha256((CHARACTERS / "man-workwear.glb").read_bytes()).hexdigest(),
            "macro": OWEN,
            "head_scale": head_scale,
            "transfer": (
                "Shared MPFB head vertices, uniform sizing about the head joint, "
                "head-weighted neck blend; athletic body retained"
            ),
            "hair": "short02, surface-fitted from Owen's source body",
        },
        "transfer": "Surface deform from donor MPFB bodies; original skin weights kept",
        "costume": "Runtime dress uniform: tunic, coronet, epaulettes, sash, belt, buttons, star",
    }
    (output_dir / "prince-jev.sources.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("PRINCE_BUILD", json.dumps(manifest))


if __name__ == "__main__":
    main()
    # The standalone bpy wheel can hang during extension teardown.
    if not bpy.app.binary_path:
        sys.stdout.flush()
        os._exit(0)
