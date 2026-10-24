"""Evaluation only: build the River Oaks District block in Blender Geometry Nodes and export glTF.

Run headless (Blender is not a project dependency; see README.md):

  Blender -b --factory-startup --python blender_block.py -- \
      --district preview/public/data/district.json --variant joined \
      --out .runtime/procedural-tools/joined.glb --receipt .runtime/procedural-tools/joined.json

Inputs are the bundled ODbL District footprints and road centrelines in local
east/north/up metres. Facade bays, floor heights and modules are generic
evaluation choices, not the photographed River Oaks facades. Every node is
created here, so the graph is reviewable source rather than an opaque .blend.
"""

import argparse
import hashlib
import json
import math
import sys
import time
from pathlib import Path

import bpy

GROUND_FLOOR = 4.25  # matches preview/src/district.js retail storey
FLOOR = 3.3  # matches upperWindowLevels() spacing
BAY = 3.0


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--district", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--receipt", required=True)
    parser.add_argument("--variant", choices=["realized", "joined", "instanced"], required=True)
    parser.add_argument("--meshopt", action="store_true")
    parser.add_argument("--repeat", type=int, default=1, help="tile the block N x N to test scale")
    return parser.parse_args(argv)


def material(name, color, metallic=0.0, roughness=0.6, alpha=1.0):
    mat = bpy.data.materials.new(name)
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
    return mat


class Graph:
    """Small helper so the node graph reads as data flow."""

    def __init__(self, name):
        self.tree = bpy.data.node_groups.new(name, "GeometryNodeTree")
        self.nodes, self.links = self.tree.nodes, self.tree.links
        self.input = self.nodes.new("NodeGroupInput")
        self.output = self.nodes.new("NodeGroupOutput")

    def socket(self, name, kind, direction="INPUT", default=None):
        item = self.tree.interface.new_socket(name, in_out=direction, socket_type=kind)
        if default is not None:
            item.default_value = default
        return item

    def node(self, idname, **settings):
        node = self.nodes.new(idname)
        for key, value in settings.items():
            if key in node.inputs and not node.inputs[key].is_linked:
                node.inputs[key].default_value = value
            else:
                setattr(node, key, value)
        return node

    def link(self, out, into):
        self.links.new(out, into)


def facade_group(mats, realize):
    g = Graph("UrbanBlock")
    g.socket("Geometry", "NodeSocketGeometry")
    g.socket("Height", "NodeSocketFloat", default=12.0)
    g.socket("Floors", "NodeSocketInt", default=2)
    g.socket("Bay", "NodeSocketFloat", default=BAY)
    g.socket("Geometry", "NodeSocketGeometry", "OUTPUT")
    gi = g.input

    # Mass: extrude the footprint n-gon; stone sides, roof top.
    extrude = g.node("GeometryNodeExtrudeMesh", mode="FACES")
    g.link(gi.outputs["Geometry"], extrude.inputs["Mesh"])
    g.link(gi.outputs["Height"], extrude.inputs["Offset Scale"])
    stone = g.node("GeometryNodeSetMaterial", Material=mats["stone"])
    g.link(extrude.outputs["Mesh"], stone.inputs["Geometry"])
    roof = g.node("GeometryNodeSetMaterial", Material=mats["roof"])
    g.link(stone.outputs["Geometry"], roof.inputs["Geometry"])
    g.link(extrude.outputs["Top"], roof.inputs["Selection"])

    # Bay points along the footprint outline, X axis aligned to the wall.
    outline = g.node("GeometryNodeMeshToCurve")
    g.link(gi.outputs["Geometry"], outline.inputs["Mesh"])
    points = g.node("GeometryNodeCurveToPoints", mode="LENGTH")
    g.link(outline.outputs["Curve"], points.inputs["Curve"])
    g.link(gi.outputs["Bay"], points.inputs["Length"])
    align = g.node("FunctionNodeAlignRotationToVector", axis="X", pivot_axis="Z")
    g.link(points.outputs["Tangent"], align.inputs["Vector"])

    def module(width, height, z, frame_mat, glass_mat):
        frame = g.node("GeometryNodeMeshCube", Size=(width, 0.42, height))
        frame_m = g.node("GeometryNodeSetMaterial", Material=frame_mat)
        g.link(frame.outputs["Mesh"], frame_m.inputs["Geometry"])
        pane = g.node("GeometryNodeMeshCube", Size=(width * 0.82, 0.46, height * 0.8))
        pane_m = g.node("GeometryNodeSetMaterial", Material=glass_mat)
        g.link(pane.outputs["Mesh"], pane_m.inputs["Geometry"])
        join = g.node("GeometryNodeJoinGeometry")
        g.link(pane_m.outputs["Geometry"], join.inputs["Geometry"])
        g.link(frame_m.outputs["Geometry"], join.inputs["Geometry"])
        lift = g.node("GeometryNodeTransform", Translation=(0.0, 0.0, z + height / 2))
        g.link(join.outputs["Geometry"], lift.inputs["Geometry"])
        return lift.outputs["Geometry"]

    # Ground-floor storefront bays.
    shop = g.node("GeometryNodeInstanceOnPoints")
    g.link(points.outputs["Points"], shop.inputs["Points"])
    g.link(module(BAY * 0.86, 3.4, 0.3, mats["frame"], mats["glass"]), shop.inputs["Instance"])
    g.link(align.outputs["Rotation"], shop.inputs["Rotation"])

    # Upper windows: one instance per bay, duplicated per storey.
    window = g.node("GeometryNodeInstanceOnPoints")
    g.link(points.outputs["Points"], window.inputs["Points"])
    g.link(module(BAY * 0.62, 2.0, 0.0, mats["frame"], mats["glass"]), window.inputs["Instance"])
    g.link(align.outputs["Rotation"], window.inputs["Rotation"])
    storeys = g.node("GeometryNodeDuplicateElements", domain="INSTANCE")
    g.link(window.outputs["Instances"], storeys.inputs["Geometry"])
    g.link(gi.outputs["Floors"], storeys.inputs["Amount"])
    # z = GROUND_FLOOR + 0.9 + index * FLOOR
    times = g.node("ShaderNodeMath", operation="MULTIPLY_ADD")
    g.link(storeys.outputs["Duplicate Index"], times.inputs[0])
    times.inputs[1].default_value = FLOOR
    times.inputs[2].default_value = GROUND_FLOOR + 0.9
    up = g.node("ShaderNodeCombineXYZ")
    g.link(times.outputs["Value"], up.inputs["Z"])
    raise_ = g.node("GeometryNodeTranslateInstances")
    g.link(storeys.outputs["Geometry"], raise_.inputs["Instances"])
    g.link(up.outputs["Vector"], raise_.inputs["Translation"])

    join = g.node("GeometryNodeJoinGeometry")
    parts = (roof.outputs["Geometry"], shop.outputs["Instances"], raise_.outputs["Instances"])
    for geometry in parts:
        g.link(geometry, join.inputs["Geometry"])
    result = join.outputs["Geometry"]
    if realize:
        # Mesh conversion and the realized exports ignore instances otherwise.
        real = g.node("GeometryNodeRealizeInstances")
        g.link(result, real.inputs["Geometry"])
        result = real.outputs["Geometry"]
    g.link(result, g.output.inputs["Geometry"])
    return g.tree


def road_group(mats):
    g = Graph("RoadRibbon")
    g.socket("Geometry", "NodeSocketGeometry")
    g.socket("Width", "NodeSocketFloat", default=8.4)
    g.socket("Geometry", "NodeSocketGeometry", "OUTPUT")
    curve = g.node("GeometryNodeMeshToCurve")
    g.link(g.input.outputs["Geometry"], curve.inputs["Mesh"])
    normal = g.node("GeometryNodeSetCurveNormal", Mode="Z Up")
    g.link(curve.outputs["Curve"], normal.inputs["Curve"])
    half = g.node("ShaderNodeMath", operation="MULTIPLY")
    g.link(g.input.outputs["Width"], half.inputs[0])
    half.inputs[1].default_value = 0.5
    left, right = g.node("ShaderNodeCombineXYZ"), g.node("ShaderNodeCombineXYZ")
    neg = g.node("ShaderNodeMath", operation="MULTIPLY")
    g.link(half.outputs["Value"], neg.inputs[0])
    neg.inputs[1].default_value = -1.0
    g.link(neg.outputs["Value"], left.inputs["X"])
    g.link(half.outputs["Value"], right.inputs["X"])
    profile = g.node("GeometryNodeCurvePrimitiveLine")
    g.link(left.outputs["Vector"], profile.inputs["Start"])
    g.link(right.outputs["Vector"], profile.inputs["End"])
    ribbon = g.node("GeometryNodeCurveToMesh")
    g.link(normal.outputs["Curve"], ribbon.inputs["Curve"])
    g.link(profile.outputs["Curve"], ribbon.inputs["Profile Curve"])
    asphalt = g.node("GeometryNodeSetMaterial", Material=mats["asphalt"])
    g.link(ribbon.outputs["Mesh"], asphalt.inputs["Geometry"])
    g.link(asphalt.outputs["Geometry"], g.output.inputs["Geometry"])
    return g.tree


def ccw(ring):
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:]))
    return ring if area > 0 else list(reversed(ring))


def input_ids(tree):
    return {
        item.name: item.identifier for item in tree.interface.items_tree if item.in_out == "INPUT"
    }


def set_input(mod, identifier, value):
    # Blender 5.x moved modifier inputs from ID properties (mod["Socket_1"])
    # to mod.properties.inputs.<identifier>.value; 4.x scripts break here.
    getattr(mod.properties.inputs, identifier).value = value


def footprint_object(building, offset, tree):
    ring = ccw([(x + offset[0], y + offset[1]) for x, y in building["ring"]])[:-1]
    base = building["center"][2]
    mesh = bpy.data.meshes.new(building["id"])
    mesh.from_pydata([(x, y, base) for x, y in ring], [], [list(range(len(ring)))])
    obj = bpy.data.objects.new(building["id"], mesh)
    bpy.context.collection.objects.link(obj)
    height = building["size"][2]
    floors = max(0, math.floor((height - GROUND_FLOOR - 0.9 - 2.0) / FLOOR) + 1)
    mod = obj.modifiers.new("UrbanBlock", "NODES")
    mod.node_group = tree
    ids = input_ids(tree)
    set_input(mod, ids["Height"], float(height))
    set_input(mod, ids["Floors"], int(floors))
    return obj


def road_object(road, offset, base, tree):
    pts = [(p[0] + offset[0], p[1] + offset[1], base + 0.02) for p in road["points"]]
    mesh = bpy.data.meshes.new(road["id"])
    mesh.from_pydata(pts, [(i, i + 1) for i in range(len(pts) - 1)], [])
    obj = bpy.data.objects.new(road["id"], mesh)
    bpy.context.collection.objects.link(obj)
    mod = obj.modifiers.new("RoadRibbon", "NODES")
    mod.node_group = tree
    ids = input_ids(tree)
    set_input(mod, ids["Width"], float(road["width_m"]))
    return obj


def realize(objects):
    """Apply modifiers (realizing instances) so each object is a plain mesh."""
    deps = bpy.context.evaluated_depsgraph_get()
    out = []
    for obj in objects:
        evaluated = obj.evaluated_get(deps)
        mesh = bpy.data.meshes.new_from_object(evaluated, depsgraph=deps)
        new = bpy.data.objects.new(obj.name + "-mesh", mesh)
        bpy.context.collection.objects.link(new)
        bpy.data.objects.remove(obj)
        out.append(new)
    return out


def triangles():
    """Rendered triangles, counting every instance; also the instance count."""
    deps = bpy.context.evaluated_depsgraph_get()
    total, instances, cache = 0, 0, {}
    for item in deps.object_instances:
        obj = item.object
        if obj.type != "MESH":
            continue
        key = obj.data.name_full if item.is_instance else id(obj)
        if key not in cache:
            mesh = obj.data if item.is_instance else obj.to_mesh()
            mesh.calc_loop_triangles()
            cache[key] = len(mesh.loop_triangles)
            if not item.is_instance:
                obj.to_mesh_clear()
        total += cache[key]
        instances += item.is_instance
    return total, instances


def main():
    args = arguments()
    started = time.perf_counter()
    district = json.loads(Path(args.district).read_text())
    mats = {
        "stone": material("stone", (0.78, 0.74, 0.66), roughness=0.8),
        "roof": material("roof", (0.55, 0.55, 0.52), roughness=0.95),
        "frame": material("frame", (0.12, 0.16, 0.16), metallic=0.6, roughness=0.35),
        "glass": material("glass", (0.2, 0.35, 0.38), metallic=0.3, roughness=0.08),
        "asphalt": material("asphalt", (0.16, 0.16, 0.17), roughness=0.95),
    }
    block, ribbon = facade_group(mats, args.variant != "instanced"), road_group(mats)
    west, south, east, north = district["bounds_m"]
    base = min(b["center"][2] for b in district["buildings"])
    objects = []
    for ix in range(args.repeat):
        for iy in range(args.repeat):
            offset = (ix * (east - west), iy * (north - south))
            objects += [footprint_object(b, offset, block) for b in district["buildings"]]
            objects += [road_object(r, offset, base, ribbon) for r in district["roads"]]
    built = time.perf_counter()
    tris, instance_count = triangles()
    evaluated = time.perf_counter()

    if args.variant in ("realized", "joined"):
        objects = realize(objects)
    if args.variant == "joined":
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects = [bpy.context.view_layer.objects.active]
        objects[0].name = "district-block"
    prepared = time.perf_counter()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_gn_mesh=args.variant == "instanced",
        export_gpu_instances=args.variant == "instanced",
        export_meshopt_compression_enable=args.meshopt,
        export_extras=False,
        export_texcoords=False,
    )
    exported = time.perf_counter()
    data = out.read_bytes()
    receipt = {
        "tool": f"Blender {bpy.app.version_string}",
        "build_hash": bpy.app.build_hash.decode(),
        "variant": args.variant,
        "meshopt": args.meshopt,
        "repeat": args.repeat,
        "input_sha256": hashlib.sha256(Path(args.district).read_bytes()).hexdigest(),
        "buildings": len(district["buildings"]) * args.repeat**2,
        "roads": len(district["roads"]) * args.repeat**2,
        "evaluated_triangles": tris,
        "evaluated_instances": instance_count,
        "output_bytes": len(data),
        "output_sha256": hashlib.sha256(data).hexdigest(),
        "seconds": {
            "graph_and_objects": round(built - started, 4),
            "evaluate": round(evaluated - built, 4),
            "realize_join": round(prepared - evaluated, 4),
            "export": round(exported - prepared, 4),
            "total": round(exported - started, 4),
        },
    }
    Path(args.receipt).write_text(json.dumps(receipt, indent=2) + "\n")
    print("RECEIPT", json.dumps(receipt))


main()
