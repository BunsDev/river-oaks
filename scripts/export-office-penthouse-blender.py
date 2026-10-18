"""Import the penthouse package's placed GLB into an editable, packed Blender project (#362).

Run after `node scripts/export-office-penthouse.mjs export`:
  blender --background --python scripts/export-office-penthouse-blender.py [-- --render]

The JS master (preview/src/office-penthouse-furnishings.js) stays the reproducible source; the
.blend is its editable derivative. Collections follow the runtime's visibility groups, collision
proxies (COL_*) are wire-only and never render, and the review cameras are the asset preview's
O1-O4. `--render` writes Cycles stills, labelled Blender preview (not runtime), for each camera.
"""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

root = Path(__file__).resolve().parents[1]
source = root / "assets/office-penthouse/office-penthouse.glb"
output = root / "assets/office-penthouse/office-penthouse.blend"
renders = root / "docs/design/office-ipic/captures/penthouse/blender-preview"
render = "--render" in sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else False

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1
scene["provenance"] = (
    "Original procedural art (#362); no kit art or kit bytes. "
    "Desk footprints from the kit's measured colliders, as numbers (R19)."
)
scene["generator"] = "preview/src/office-penthouse-furnishings.js and office-penthouse-graybox.js"
scene["coordinate_basis"] = (
    "Blender Z up, +Y = d (into the office), X across. Game GLB: Y up, -Z = d."
)


# Collections by role: shell, the three visibility groups, collision and anchors.
def collection(name):
    made = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if made.name not in scene.collection.children:
        scene.collection.children.link(made)
    return made


groups = {
    name: collection(name)
    for name in ["Shell", "Main floor", "Terrace", "Mezzanine", "Collision", "Anchors", "Lamps"]
}
owner = {
    "shell": "Shell",
    "furnishings:main-floor": "Main floor",
    "furnishings:terrace": "Terrace",
    "furnishings:mezzanine": "Mezzanine",
    "collision": "Collision",
}


def top_group(obj):
    node = obj
    while node.parent is not None:
        if node.parent.name.split(".")[0] in owner:
            return owner[node.parent.name.split(".")[0]]
        node = node.parent
    return None


for obj in list(scene.objects):
    target = None
    if obj.name.startswith("COL_"):
        target = "Collision"
        obj.display_type = "WIRE"
        obj.hide_render = True
    elif obj.type == "EMPTY" and (obj.name.startswith("SEAT") or obj.name.startswith("SCREEN")):
        target = "Anchors"
    elif obj.type == "LIGHT":
        target = "Lamps"
    else:
        target = top_group(obj)
    if target:
        for previous in list(obj.users_collection):
            previous.objects.unlink(obj)
        groups[target].objects.link(obj)

# The office lamps come in as punctual lights; give them interior wattage and a warm white.
for obj in groups["Lamps"].objects:
    obj.data.energy = 220
    obj.data.color = (1.0, 0.92, 0.82)
    obj.data.shadow_soft_size = 0.35

sun_data = bpy.data.lights.new("Noon sun", "SUN")
sun_data.energy = 3.2
sun_data.angle = math.radians(0.6)
sun = bpy.data.objects.new("Noon sun", sun_data)
groups["Lamps"].objects.link(sun)
sun.rotation_euler = (math.radians(38), 0, math.radians(200))

scene.world = bpy.data.worlds.new("Penthouse sky")
scene.world.use_nodes = True
background = scene.world.node_tree.nodes["Background"]
background.inputs[0].default_value = (0.78, 0.8, 0.86, 1)
background.inputs[1].default_value = 0.7

# Review cameras: [x, height, d] in the office frame (preview/e2e/fixtures/office-penthouse.js).
VIEWS = {
    "O1 Arrival": ([0, 1.68, 1.5], [-3, 1.25, 11]),
    "O2 Hosting and work": ([-13.4, 1.68, 2.2], [-2.5, 1.0, 11.5]),
    "O3 Workstation seated": ([3.65, 1.2, 5.6], [3.65, 0.95, 9.5]),
    "O4 Mezzanine library": ([11.8, 5.48, 15.2], [0, 5.0, 15.6]),
    "O4 Terrace retreat": ([-15.6, 1.68, 1.2], [-21, 0.8, 12]),
}
cameras = []
for name, (eye, target) in VIEWS.items():
    data = bpy.data.cameras.new(name)
    data.sensor_fit = "VERTICAL"
    data.angle_y = math.radians(62)
    camera = bpy.data.objects.new(name, data)
    scene.collection.objects.link(camera)
    camera.location = (eye[0], eye[2], eye[1])
    camera.rotation_euler = (
        (Vector((target[0], target[2], target[1])) - camera.location)
        .to_track_quat("-Z", "Y")
        .to_euler()
    )
    cameras.append(camera)
scene.camera = cameras[0]

scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = 1440
scene.render.resolution_y = 900
scene.render.image_settings.file_format = "JPEG"
scene.render.image_settings.quality = 88
scene.view_settings.view_transform = "AgX"
try:
    preferences = bpy.context.preferences.addons["cycles"].preferences
    preferences.compute_device_type = "METAL"
    preferences.get_devices()
    for device in preferences.devices:
        device.use = True
    scene.cycles.device = "GPU"
except Exception:  # CPU rendering still works, only slower
    pass

bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(output), compress=True)
backup = output.with_suffix(".blend1")
if backup.exists():
    backup.unlink()

stills = []
if render:
    renders.mkdir(parents=True, exist_ok=True)
    for camera in cameras:
        scene.camera = camera
        path = (
            renders
            / f"{camera.name.split(' ')[0]}-{'-'.join(camera.name.lower().split(' ')[1:])}.jpg"
        )
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        stills.append(str(path.relative_to(root)))

meshes = [o for o in scene.objects if o.type == "MESH" and not o.name.startswith("COL_")]
for o in meshes:
    o.data.calc_loop_triangles()
summary = {
    "blender": bpy.app.version_string,
    "source": str(source.relative_to(root)),
    "meshes": len(meshes),
    "collision_proxies": len(groups["Collision"].objects),
    "anchors": len(groups["Anchors"].objects),
    "triangles": sum(len(o.data.loop_triangles) for o in meshes),
    "materials": sorted(
        {slot.material.name for o in meshes for slot in o.material_slots if slot.material}
    ),
    "packed_images": sum(bool(i.packed_file) for i in bpy.data.images),
    "collections": {name: len(c.all_objects) for name, c in groups.items()},
    "bytes": output.stat().st_size,
    "renders": stills,
    "samples": scene.cycles.samples,
}
(root / "assets/office-penthouse/blender.json").write_text(json.dumps(summary, indent=2) + "\n")
print("PENTHOUSE_BLEND_VALIDATED", json.dumps(summary))
