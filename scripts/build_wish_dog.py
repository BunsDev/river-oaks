"""Export NewDLC's CC0 canine as a browser-ready, metre-scale PBR dog.

Run with bpy 4.5.3. Extract the source ZIP into data/raw/wish-dog first.
External blend scripts are disabled. This builds a mesh, not a simulated fur groom.
"""
import hashlib
import json
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/raw/wish-dog"
OUTPUT = ROOT / "preview/public/assets/dog/dog.glb"
bpy.ops.wm.open_mainfile(filepath=str(SOURCE / "dog2.blend"), load_ui=False, use_scripts=False)
body, arm = bpy.data.objects["dog2"], bpy.data.objects["Armature"]
mat = body.data.materials[0]
mat.name = "Canine sable coat"
mat.use_nodes = True
nodes, links = mat.node_tree.nodes, mat.node_tree.links
nodes.clear()
out, bsdf = nodes.new("ShaderNodeOutputMaterial"), nodes.new("ShaderNodeBsdfPrincipled")
links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
for filename, socket in [("dog2Color.png", "Base Color"), ("dog2Roughness.png", "Roughness")]:
    tex = nodes.new("ShaderNodeTexImage")
    path = OUTPUT.parent / "sable-coat.png" if socket == "Base Color" else SOURCE / filename
    tex.image = bpy.data.images.load(str(path), check_existing=True)
    tex.image.colorspace_settings.name = "sRGB" if socket == "Base Color" else "Non-Color"
    links.new(tex.outputs["Color"], bsdf.inputs[socket])
normal = nodes.new("ShaderNodeTexImage")
normal.image = bpy.data.images.load(str(SOURCE / "dog2Normal.png"), check_existing=True)
normal.image.colorspace_settings.name = "Non-Color"
mapping = nodes.new("ShaderNodeNormalMap")
mapping.inputs["Strength"].default_value = .4
links.new(normal.outputs["Color"], mapping.inputs["Color"])
links.new(mapping.outputs["Normal"], bsdf.inputs["Normal"])
eye = bpy.data.materials.new("Canine wet brown eyes")
eye.use_nodes = True
eye_bsdf = eye.node_tree.nodes.get("Principled BSDF")
eye_bsdf.inputs["Base Color"].default_value = (.026, .014, .007, 1)
eye_bsdf.inputs["Roughness"].default_value = .15
eye_bsdf.inputs["Coat Weight"].default_value = 1
body.data.materials.append(eye)
eye_groups = {g.index for g in body.vertex_groups if "Eye" in g.name}
eye_vertices = {v.index for v in body.data.vertices if sum(g.weight for g in v.groups if g.group in eye_groups) > .5}
for poly in body.data.polygons:
    poly.use_smooth = True
    if all(v in eye_vertices for v in poly.vertices):
        poly.material_index = 1
# One subdivision smooths joints and muzzle; skin weights are interpolated by Blender.
bpy.context.view_layer.objects.active = body
sub = body.modifiers.new("Smooth canine silhouette", "SUBSURF")
sub.levels = 1
bpy.ops.object.modifier_move_up(modifier=sub.name)
bpy.ops.object.modifier_apply(modifier=sub.name)
budget = body.modifiers.new("Browser triangle budget", "DECIMATE")
budget.ratio = .78
bpy.ops.object.modifier_move_up(modifier=budget.name)
bpy.ops.object.modifier_apply(modifier=budget.name)
bpy.ops.object.select_all(action="DESELECT")
for obj in [arm, body]:
    obj.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
points = [body.matrix_world @ v.co for v in body.data.vertices]
floor, top = min(p.z for p in points), max(p.z for p in points)
scale = .96 / (top - floor)
root = bpy.data.objects.new("Canine metre scale", None)
bpy.context.collection.objects.link(root)
for obj in [arm, body]:
    obj.parent = root
root.scale = (scale,) * 3
root.location.z = -floor * scale
root.select_set(True)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB", use_selection=True,
                          export_animations=False, export_yup=True, export_texcoords=True,
                          export_normals=True, export_skins=True)
metadata = {
    "author": "NewDLC", "license": "CC0-1.0",
    "source": "https://opengameart.org/content/3d-wolf",
    "download": "https://opengameart.org/sites/default/files/3dwolf_blend.zip",
    "source_sha256": hashlib.sha256((SOURCE / "dog2.blend").read_bytes()).hexdigest(),
    "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
    "coat": {"path": "sable-coat.png", "source": "AI-generated UV-aligned adaptation of NewDLC's CC0 color atlas", "sha256": hashlib.sha256((OUTPUT.parent / "sable-coat.png").read_bytes()).hexdigest()},
    "adaptation": "Sable canine: PBR color, normal and roughness maps; glossy brown eyes; silhouette subdivision with decimation below 30000 triangles; grounded metre scale; independent skeletal idle at runtime.",
    "build": "bpy 4.5.3: python scripts/build_wish_dog.py",
}
(OUTPUT.parent / "sources.json").write_text(json.dumps(metadata, indent=2) + "\n")
