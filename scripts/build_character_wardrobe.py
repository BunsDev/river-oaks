"""Run inside Blender to build each Studio body's wardrobe as one bounded GLB.

Every CC0 MakeHuman suit of the body's frame is fitted to the same human that
build_characters.py ships, then split into a top and a bottom by its skinning
weights, so any top can be worn with any bottom. Every shoe pair is fitted too.
Under the garments sits the body's own skin with nothing deleted (the shipped
rig deletes the skin under its own suit): each skin vertex records, as a bit
mask, which garments delete it, so the client hides exactly the skin the worn
garments cover. Head vertices are left out; the shipped head (with its face
targets) stays in use. Textures are written once per material, shared by every
body, and the GLBs carry none.

  Blender -b --factory-startup --python scripts/build_character_wardrobe.py [-- <body> ...]
"""

import hashlib
import json
import os
import struct
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector, kdtree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_characters import ASSETS, OUTPUT, PROFILES, SOURCE, fields

WARDROBE = OUTPUT / "wardrobe"
TEXTURES = WARDROBE / "textures"
SUITS = {
    0: [
        "female_casualsuit01",
        "female_casualsuit02",
        "female_elegantsuit01",
        "female_sportsuit01",
    ],
    1: [
        "male_casualsuit01",
        "male_casualsuit02",
        "male_casualsuit03",
        "male_casualsuit04",
        "male_casualsuit05",
        "male_casualsuit06",
        "male_elegantsuit01",
        "male_worksuit01",
    ],
}
SHOES = ["shoes01", "shoes02", "shoes03", "shoes04", "shoes05", "shoes06"]
LOWER = {"pelvis", "thigh_l", "calf_l", "foot_l", "ball_l", "thigh_r", "calf_r", "foot_r", "ball_r"}
HEAD = {"head"}
# A piece whose lower-body share falls between these spans both halves.
MIXED = (0.2, 0.8)
# A float32 attribute holds integers exactly up to 2**24.
MAX_SLOTS = 24


def dominant(obj, vertex, bones):
    """The bone carrying most of a vertex's weight, or None. MPFB's own groups
    (body, helpers, joints) are not bones."""
    best, name = 0.0, None
    for element in vertex.groups:
        group = obj.vertex_groups[element.group].name
        if group in bones and element.weight > best:
            best, name = element.weight, group
    return name


def lower_share(obj, vertex, bones):
    total = lower = 0.0
    for element in vertex.groups:
        group = obj.vertex_groups[element.group].name
        if group not in bones:
            continue
        total += element.weight
        if group in LOWER:
            lower += element.weight
    return lower / total if total else 0.0


def conservative(base, delverts):
    """MPFB's conservative mask: keep every vertex of a face the garment does not
    wholly delete, so only fully covered faces go (ClothesService._conservative_mask)."""
    listed = set(delverts)
    kept = set()
    for polygon in base.data.polygons:
        if not all(v in listed for v in polygon.vertices):
            kept.update(v for v in polygon.vertices if v in listed)
    return sorted(listed - kept)


def split_suit(suit, base, delverts, bones):
    """Split a fitted suit into top and bottom objects. Each connected piece (a
    jacket, a shirt, trousers) goes whole to the half most of its weight is on,
    so a jacket's tails stay on the jacket. Skin the suit deletes goes with the
    piece nearest to it."""
    mesh = bmesh.new()
    mesh.from_mesh(suit.data)
    mesh.verts.ensure_lookup_table()
    piece, pieces = [-1] * len(mesh.verts), []
    for start in mesh.verts:
        if piece[start.index] >= 0:
            continue
        stack, members = [start], []
        piece[start.index] = len(pieces)
        while stack:
            vertex = stack.pop()
            members.append(vertex.index)
            for edge in vertex.link_edges:
                other = edge.other_vert(vertex)
                if piece[other.index] < 0:
                    piece[other.index] = len(pieces)
                    stack.append(other)
        share = sum(lower_share(suit, suit.data.vertices[i], bones) for i in members) / len(members)
        pieces.append(share)
        print("PIECE", suit.name, len(members), round(share, 2))
    mesh.free()
    # A piece clearly on one half goes whole; one that spans both (overalls, or a
    # shirt sewn to its jeans) is cut where its weight changes over.
    lower = [
        pieces[p] > 0.5
        if not MIXED[0] < pieces[p] < MIXED[1]
        else lower_share(suit, suit.data.vertices[i], bones) > 0.5
        for i, p in enumerate(piece)
    ]
    parts = {}
    for part, keep_lower in (("top", False), ("bottom", True)):
        obj = suit.copy()
        obj.data = suit.data.copy()
        obj.name = f"{suit.name}-{part}"
        bpy.context.scene.collection.objects.link(obj)
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        doomed = [
            f
            for f in mesh.faces
            if (sum(lower[v.index] for v in f.verts) * 2 > len(f.verts)) != keep_lower
        ]
        bmesh.ops.delete(mesh, geom=doomed, context="FACES")
        bmesh.ops.delete(mesh, geom=[v for v in mesh.verts if not v.link_faces], context="VERTS")
        mesh.to_mesh(obj.data)
        mesh.free()
        parts[part] = obj
    # Both meshes are fitted to the same rest body, so nearest is meaningful.
    tree = kdtree.KDTree(len(suit.data.vertices))
    for vertex in suit.data.vertices:
        tree.insert(vertex.co, vertex.index)
    tree.balance()
    deletes = {"top": [], "bottom": []}
    for index in delverts:
        _, nearest, _ = tree.find(base.data.vertices[index].co)
        deletes["bottom" if lower[nearest] else "top"].append(index)
    bpy.data.objects.remove(suit)
    return parts, deletes


def save_textures(path, written):
    """Write a material's diffuse (and normal) map once, at the shipped size limit, as WebP."""
    values, result = fields(path), {}
    for field, key in (("diffuseTexture", "map"), ("normalmapTexture", "normalMap")):
        if field not in values:
            continue
        name = f"{path.stem}-{key}.webp"
        result[key] = f"textures/{name}"
        if name in written:
            continue
        image = bpy.data.images.load(str(path.parent / values[field]))
        if max(image.size) > 1024:
            ratio = 1024 / max(image.size)
            image.scale(round(image.size[0] * ratio), round(image.size[1] * ratio))
        settings = bpy.context.scene.render.image_settings
        settings.file_format, settings.quality, settings.color_mode = "WEBP", 82, "RGBA"
        if key == "normalMap":
            image.colorspace_settings.name = "Non-Color"
        image.save_render(str(TEXTURES / name), scene=bpy.context.scene)
        pixels = list(image.pixels) if key == "map" else []
        if pixels:
            # Mean sRGB colour over opaque texels, for tinting by gain.
            count, total = 0, [0.0, 0.0, 0.0]
            for i in range(0, len(pixels), 4):
                if pixels[i + 3] > 0.5:
                    count += 1
                    for k in range(3):
                        total[k] += pixels[i + k]
            written[name] = [round(255 * t / max(count, 1)) for t in total]
        else:
            written[name] = None
        bpy.data.images.remove(image)
    if "map" in result:
        result["mean"] = written[result["map"].split("/")[1]]
    return result


def keep_only_slots(path):
    """Drop every glTF extra but the cover slot (MPFB tags objects with UUIDs and authors)."""
    data = path.read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20 : 20 + length])
    for kind in ("nodes", "meshes", "materials", "scenes", "skins"):
        for item in document.get(kind, []):
            slot = item.get("extras", {}).get("wardrobeSlot")
            item.pop("extras", None)
            if slot is not None:
                item["extras"] = {"wardrobeSlot": slot}
    chunk = json.dumps(document, separators=(",", ":")).encode()
    chunk += b" " * (-len(chunk) % 4)
    rest = data[20 + length :]
    path.write_bytes(
        struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(chunk) + len(rest))
        + struct.pack("<II", len(chunk), 0x4E4F534A)
        + chunk
        + rest
    )


def build(profile, human_service, target_service, written):
    name, skin_name, outfit, hair, shoes, gender, age = profile
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    macro = target_service.get_default_macro_info_dict()
    macro.update(gender=gender, age=age, muscle=0.4, weight=0.46, height=0.5)
    base = human_service.create_human(macro_detail_dict=macro)
    base.name = "skin"
    base.data.materials.clear()
    skin = bpy.data.materials.new(skin_name)
    base.data.materials.append(skin)
    rig = human_service.add_builtin_rig(base, "game_engine")
    bones = {bone.name for bone in rig.data.bones}
    from bl_ext.river_oaks.mpfb.entities.clothes.mhclo import Mhclo

    garments, covers = [], []
    for asset, kind in [(s, "suit") for s in SUITS[gender]] + [(s, "shoes") for s in SHOES]:
        path = ASSETS / "clothes" / asset / f"{asset}.mhclo"
        mhclo = Mhclo()
        mhclo.load(str(path))
        delverts = (
            sorted(int(v) for v in (mhclo.delverts or []) if int(v) < len(base.data.vertices))
            if mhclo.delete
            else []
        )
        delverts = conservative(base, delverts)
        obj = human_service.add_mhclo_asset(str(path), base, asset_type="clothes", subdiv_levels=0)
        obj.name = asset
        obj.data.materials.clear()
        mat = bpy.data.materials.new(asset)
        obj.data.materials.append(mat)
        textures = save_textures(path.parent / fields(path)["material"], written)
        if kind == "suit":
            parts, deletes = split_suit(obj, base, delverts, bones)
            for part, part_obj in parts.items():
                garments.append({"id": f"{asset}-{part}", "kind": part, "suit": asset, **textures})
                covers.append((part_obj, deletes[part]))
        else:
            garments.append({"id": asset, "kind": "shoes", **textures})
            covers.append((obj, delverts))
    if len(covers) > MAX_SLOTS:
        raise ValueError("Too many garments for one cover mask")
    # MPFB deletes the skin under every garment; keep it, and record the cover instead.
    for modifier in list(base.modifiers):
        if modifier.type == "MASK" and modifier.vertex_group != "body":
            base.modifiers.remove(modifier)
    cover = base.data.attributes.new("_cover", "FLOAT", "POINT")
    masks = [0] * len(base.data.vertices)
    for slot, ((_, delverts), garment) in enumerate(zip(covers, garments)):
        garment["slot"] = slot
        for index in delverts:
            masks[index] |= 1 << slot
    cover.data.foreach_set("value", [float(m) for m in masks])
    for (obj, _), garment in zip(covers, garments):
        obj["wardrobeSlot"] = garment["slot"]
    # The shipped head keeps its face targets; leave the head out of the skin.
    mesh = bmesh.new()
    mesh.from_mesh(base.data)
    mesh.verts.ensure_lookup_table()
    head = [v for v in mesh.verts if dominant(base, base.data.vertices[v.index], bones) in HEAD]
    bmesh.ops.delete(mesh, geom=head, context="VERTS")
    mesh.to_mesh(base.data)
    mesh.free()
    # The same relaxed standing pose as the shipped rig.
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
    path = WARDROBE / f"{name}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_apply=True,
        export_animations=False,
        export_skins=True,
        export_morph=False,
        export_current_frame=True,
        export_rest_position_armature=False,
        export_reset_pose_bones=False,
        export_image_format="NONE",
        export_attributes=True,
        export_extras=True,
    )
    keep_only_slots(path)
    if not path.is_file() or path.stat().st_size > 8 * 1024 * 1024:
        raise ValueError(f"Wardrobe output missing or above its 8 MiB budget: {name}")
    return {
        "body": name,
        "path": f"/assets/characters/wardrobe/{name}.glb",
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "garments": garments,
    }


def main():
    TEXTURES.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.extensions.repos.new(
        name="River Oaks wardrobe build",
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
    written = {}
    bodies = [build(profile, HumanService, TargetService, written) for profile in profiles]
    textures = {
        name: hashlib.sha256((TEXTURES / name).read_bytes()).hexdigest() for name in sorted(written)
    }
    receipt = {
        "generator": "MPFB 2.0.17 / Blender " + bpy.app.version_string,
        "blenderBinarySha256": hashlib.sha256(Path(bpy.app.binary_path).read_bytes()).hexdigest(),
        "license": "CC0-1.0",
        "bodies": bodies,
        "textures": textures,
    }
    (WARDROBE / "wardrobe.sources.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print("WARDROBE", ", ".join(b["body"] for b in bodies))


if __name__ == "__main__":
    main()
    sys.stdout.flush()
    os._exit(0)
