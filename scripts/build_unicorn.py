"""Export Lyndon Daniels / ChadM's CC0 horse for the browser unicorn team.

Requires bpy 4.5.3. Source: https://opengameart.org/content/rigged-horse
Place riggedHorse.blend in data/raw/unicorns. No source scripts are executed.
"""

import hashlib
import json
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/raw/unicorns/riggedHorse.blend"
OUTPUT = ROOT / "preview/public/assets/unicorns/horse.glb"
bpy.ops.wm.open_mainfile(filepath=str(SOURCE), load_ui=False, use_scripts=False)
arm = bpy.data.objects["Armature"]
body = bpy.data.objects["Plane"]
# The original mesh is ten source units tall. Normalize to a 2.17 metre horse.
points = [body.matrix_world @ v.co for v in body.data.vertices]
floor = min(p.z for p in points)
scale = 2.17 / (max(p.z for p in points) - floor)
# Center fore and hind hoof contacts rather than the nose-to-tail bounding box.
center_y = arm.location.y + (-5.00445 - 1.17286) / 2
names = {
    "Bone": "Body",
    "Bone.001": "Neck",
    "Bone.002": "Head",
    "Bone.001_L": "EarL",
    "Bone.001_R": "EarR",
    "Bone.003": "TailBase",
    "Bone.004": "Tail",
    "Bone_L": "FrontShoulderL",
    "Bone_L.001": "FrontUpperL",
    "Bone_L.002": "FrontLowerL",
    "Bone_R": "FrontShoulderR",
    "Bone_R.001": "FrontUpperR",
    "Bone_R.002": "FrontLowerR",
    "Bone_L.003": "HindHipL",
    "Bone_L.004": "HindUpperL",
    "Bone_L.005": "HindLowerL",
    "Bone_R.003": "HindHipR",
    "Bone_R.004": "HindUpperR",
    "Bone_R.005": "HindLowerR",
}
for old, new in names.items():
    arm.data.bones[old].name = new
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
# Missing weights in the original source: attach eyes, distribute mane and tail.
for obj in meshes:
    if obj == body:
        continue
    obj.vertex_groups.clear()
    for name in ["Head", "Neck", "Body", "TailBase", "Tail"]:
        obj.vertex_groups.new(name=name)
    for v in obj.data.vertices:
        p = obj.matrix_world @ v.co
        if obj.name.startswith("Sphere"):
            weights = {"Head": 1.0}
        elif obj.name == "BezierCurve":
            t = max(0, min(1, (2.2 - p.z) / 1.3))
            weights = {"TailBase": 1 - t, "Tail": t}
        else:
            t = max(0, min(1, (-p.y - 4.6) / 2))
            weights = {"Neck": 1 - t, "Head": t}
        for name, weight in weights.items():
            if weight:
                obj.vertex_groups[name].add([v.index], weight, "REPLACE")
    modifier = obj.modifiers.new("Unicorn skin", "ARMATURE")
    modifier.object = arm
# Explicit endpoint bones make runtime IK independent of mesh dimensions.
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
for prefix in ["Front", "Hind"]:
    for side in ["L", "R"]:
        lower = arm.data.edit_bones[prefix + "Lower" + side]
        foot = arm.data.edit_bones.new(prefix + "Hoof" + side)
        foot.head = lower.tail
        foot.tail = lower.tail + Vector((0, -0.15, 0))
        foot.parent = lower
        foot.use_connect = True
bpy.ops.object.mode_set(mode="OBJECT")
# Convert legacy Blender Internal texture slots to portable glTF PBR materials.
for mat in bpy.data.materials:
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    mat.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    image = (
        "HorseMain4k00.png"
        if mat.name == "Material"
        else "eye_texture.bmp.001"
        if mat.name == "Eye_brown"
        else "Hair12Main2k.png"
    )
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images[image]
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.62 if mat.name != "Eye_brown" else 0.12
    if mat.name != "Eye_brown":
        normal = nodes.new("ShaderNodeTexImage")
        normal.image = bpy.data.images[
            "HorseMain4k00Norm00.p" if mat.name == "Material" else "Hair12Main2kNorm.png"
        ]
        normal.image.colorspace_settings.name = "Non-Color"
        mapping = nodes.new("ShaderNodeNormalMap")
        mapping.inputs["Strength"].default_value = 0.65
        mat.node_tree.links.new(normal.outputs["Color"], mapping.inputs["Color"])
        mat.node_tree.links.new(mapping.outputs["Normal"], bsdf.inputs["Normal"])
for obj in meshes:
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if obj == body:
        # Apply subdivision before skinning, preserving interpolated bone weights.
        bpy.context.view_layer.objects.active = obj
        sub = obj.modifiers.new("Anatomical silhouette", "SUBSURF")
        sub.levels = 1
        bpy.ops.object.modifier_move_up(modifier=sub.name)
        bpy.ops.object.modifier_apply(modifier=sub.name)
# Bake source transforms into the geometry and rig, retaining the skin bind.
bpy.ops.object.select_all(action="DESELECT")
for obj in [arm, *meshes]:
    obj.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# A shared export root leaves bone-space measurements internally consistent.
root = bpy.data.objects.new("Unicorn scale", None)
bpy.context.collection.objects.link(root)
root.scale = (scale,) * 3
root.location = (0, -center_y * scale, -floor * scale)
for obj in [arm, *meshes]:
    if obj.parent is None:
        obj.parent = root
root.select_set(True)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT),
    export_format="GLB",
    use_selection=True,
    export_animations=False,
    export_apply=False,
    export_extras=True,
)
(OUTPUT.parent / "sources.json").write_text(
    json.dumps(
        {
            "author": "Lyndon Daniels; rig by ChadM",
            "license": "CC0-1.0",
            "source": "https://opengameart.org/content/rigged-horse",
            "download": "https://opengameart.org/sites/default/files/riggedHorse.blend",
            "source_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
            "adaptation": (
                "PBR conversion, normalized anatomy, one silhouette subdivision, weighted mane, "
                "tail and eyes, hoof endpoints. Runtime pearl coat, gold horn, "
                "harness and contact gait."
            ),
            "build": "bpy 4.5.3: python scripts/build_unicorn.py",
        },
        indent=2,
    )
    + "\n"
)
print("EXPORTED", OUTPUT.stat().st_size, "scale", scale, "floor", floor, "center_y", center_y)
