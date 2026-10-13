"""Import the tested game GLB into an editable, packed Blender project.

Run: blender --background --python scripts/export-ipic-blender.py
The JS scene remains the reproducible source; export a new GLB after editing it.
"""

import json
from pathlib import Path

import bpy
from mathutils import Vector

root = Path(__file__).resolve().parents[1]
source = root / "preview/public/assets/ipic/ipic-interior.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1
scene["provenance"] = (
    "44 user photos in assets/ipic/references; dimensions and auditorium layout inferred."
)
scene["generator"] = "preview/src/ipic-interior.js and ipic-plan.js"
scene["coordinate_basis"] = "Blender Z up; +Y into venue. Game GLB uses Y up and -Z into venue."
scene.world = bpy.data.worlds.new("Warm interior review")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.18, 0.16, 0.13, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.4
for name, eye, target in [
    ("Reception", (0, 1, 1.65), (2, 5.7, 1.5)),
    ("Mural", (-1.4, 11.7, 4.6), (3, 13.65, 4.65)),
    ("Lounge", (-1.6, 20.4, 7.65), (-2.1, 24, 7.1)),
    ("Auditorium", (-4.7, 27.3, 7.65), (0.5, 33.7, 8.2)),
]:
    camera = bpy.data.objects.new(name + " reference camera", bpy.data.cameras.new(name))
    scene.collection.objects.link(camera)
    camera.location = eye
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 27
    if name == "Lounge":
        scene.camera = camera
for x, y, z in [(0, 3, 3.4), (0, 13, 6.3), (-2, 23, 9.6), (4, 23, 9.6), (0, 30, 9.8)]:
    lamp = bpy.data.lights.new("Warm ceiling fill", "AREA")
    lamp.energy = 180
    lamp.color = (1, 0.8, 0.58)
    lamp.shape = "DISK"
    lamp.size = 3
    obj = bpy.data.objects.new(lamp.name, lamp)
    scene.collection.objects.link(obj)
    obj.location = (x, y, z)
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.render.resolution_x = 1440
scene.render.resolution_y = 1000
bpy.ops.file.pack_all()
output = root / "assets/ipic/ipic-interior.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(output), compress=True)
meshes = [o for o in scene.objects if o.type == "MESH"]
summary = {
    "blender": bpy.app.version_string,
    "meshes": len(meshes),
    "triangles": sum(len(o.data.loop_triangles) for o in meshes),
    "packed_images": sum(bool(i.packed_file) for i in bpy.data.images),
    "bytes": output.stat().st_size,
}
(root / "output/playwright/ipic/blender.json").write_text(json.dumps(summary, indent=2) + "\n")
print("IPIC_BLEND_VALIDATED", json.dumps(summary))
