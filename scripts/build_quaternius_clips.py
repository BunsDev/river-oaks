"""Run inside Blender to export grouped, in-place Quaternius UAL clips as clips-only GLBs.

Sources are the CC0 Universal Animation Library packs under ignored
data/raw/characters/quaternius (UAL1.glb, UAL2.glb; the in-place files, not _RM).
No user Blender preferences are saved.

  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python-exit-code 1 --python scripts/build_quaternius_clips.py -- [--write] \
    [--bone-heuristic BLENDER|TEMPERANCE|FORTUNE]

Every group is exported to .runtime/quaternius-clips/staging and audited against the
source GLBs (no meshes, exact clip set, joint rest transforms, first-sample rotations,
no root translation). Only with --write, and only when every audit passes, are the
files copied to preview/public/assets/animations. The report is written to
.runtime/quaternius-clips/report.json either way.
"""

import hashlib
import json
import re
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from quaternius_clip_audit import (  # noqa: E402
    accessor_values,
    animation_tracks,
    audit_group,
    first_rotations,
    integer_frame_bounds,
    nodes_by_name,
    read_glb,
    run_reported_attempt,
    strip_static_root_translation,
)
from quaternius_clip_publish import publish_bundle  # noqa: E402

SOURCE = ROOT / "data/raw/characters/quaternius"
RUNTIME = ROOT / ".runtime/quaternius-clips"
STAGING = RUNTIME / "staging"
OUTPUT = ROOT / "preview/public/assets/animations"
PACKS = ("UAL1.glb", "UAL2.glb")
FPS = 30
ROOT_BONE = "root"
REST_TOLERANCE = 1e-4
SAMPLE_DOT = 0.999

GROUPS = {
    "ambient-idle": [
        "Idle_Loop",
        "Idle_Talking_Loop",
        "Idle_LookAround_Loop",
        "Idle_FoldArms_Loop",
        "Idle_TalkingPhone_Loop",
        "Idle_Tired_Loop",
        "Yes",
        "Idle_No_Loop",
    ],
    "seated": [
        "Sitting_Enter",
        "Sitting_Idle_Loop",
        "Sitting_Idle02_Loop",
        "Sitting_Idle03_Loop",
        "Sitting_Talking_Loop",
        "Sitting_Nodding_Loop",
        "Sitting_Exit",
        "GroundSit_Enter",
        "GroundSit_Idle_Loop",
        "GroundSit_Exit",
    ],
    "service": [
        "Counter_Enter",
        "Counter_Idle_Loop",
        "Counter_Show",
        "Counter_Give",
        "Counter_Angry",
        "Counter_Exit",
    ],
    "garden": [
        "Farm_Harvest",
        "Farm_PlantSeed",
        "Farm_Watering",
        "Farm_ScatteringSeeds",
        "Farm_PickingTree",
        "Fish_Cast",
        "Fish_Cast_Idle_Loop",
        "Fish_Reel",
        "Fish_Reel_Failed",
    ],
    "interact": ["Interact", "PickUp_Kneeling", "PickUp_Table", "Chest_Open", "Drink", "Consume"],
}


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    options = {"write": False, "bone_heuristic": "BLENDER"}
    it = iter(argv)
    for arg in it:
        if arg == "--write":
            options["write"] = True
        elif arg == "--bone-heuristic":
            options["bone_heuristic"] = next(it)
        else:
            raise SystemExit(f"unknown argument: {arg}")
    return options


# --- Blender scene work ------------------------------------------------------------


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.render.fps_base = 1.0


def import_pack(name, heuristic):
    objects_before, actions_before = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE / name), bone_heuristic=heuristic)
    objects = [o for o in bpy.data.objects if o not in objects_before]
    actions = [a for a in bpy.data.actions if a not in actions_before]
    armatures = [o for o in objects if o.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"{name}: expected one armature, found {len(armatures)}")
    for action in actions:
        action.use_fake_user = True
    return armatures[0], objects, actions


def match_actions(pack, objects, actions, wanted):
    """Map clip name -> action. The importer may suffix an object name or .NNN."""
    suffixes = {""} | {"_" + o.name for o in objects}
    found = {}
    for clip in wanted:
        hits = []
        for action in actions:
            base = re.sub(r"\.\d{3}$", "", action.name)
            if any(base == clip + suffix for suffix in suffixes):
                hits.append(action)
        if len(hits) > 1:
            raise RuntimeError(f"{pack}: clip {clip} matched {[a.name for a in hits]}")
        if hits:
            found[clip] = hits[0]
    return found


def fcurve_collections(action):
    slots = getattr(action, "slots", None)
    if slots is not None and len(slots):
        from bpy_extras import anim_utils

        for slot in slots:
            channelbag = anim_utils.action_get_channelbag_for_slot(action, slot)
            if channelbag is not None:
                yield channelbag.fcurves
    elif hasattr(action, "fcurves"):
        yield action.fcurves


def strip_root_translation(action):
    path, removed = f'pose.bones["{ROOT_BONE}"].location', 0
    for fcurves in fcurve_collections(action):
        for fcurve in [f for f in fcurves if f.data_path == path]:
            fcurves.remove(fcurve)
            removed += 1
    return removed


def export_options(out_path):
    available = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    required = {
        "filepath": str(out_path),
        "export_format": "GLB",
        "use_selection": True,
        "export_animations": True,
        "export_animation_mode": "NLA_TRACKS",
    }
    missing = [key for key in required if key not in available]
    if missing:
        raise RuntimeError(f"glTF exporter lacks required options: {missing}")
    optional = {
        "export_materials": "NONE",
        "export_morph": False,
        "export_skins": True,
        "export_force_sampling": True,
        "export_optimize_animation_size": True,
        "export_anim_slide_to_zero": True,
        "export_def_bones": False,
        "export_yup": True,
        "export_cameras": False,
        "export_lights": False,
        "export_extras": False,
        "export_frame_range": False,
    }
    return {**required, **{k: v for k, v in optional.items() if k in available}}


def export_group(armature, clips, actions, out_path):
    animation_data = armature.animation_data or armature.animation_data_create()
    animation_data.action = None
    for track in list(animation_data.nla_tracks):
        animation_data.nla_tracks.remove(track)
    for clip in clips:
        action = actions[clip]
        track = animation_data.nla_tracks.new()
        track.name = clip
        start, end = integer_frame_bounds(action.frame_range)
        strip = track.strips.new(clip, start, action)
        strip.action_frame_start = start
        strip.action_frame_end = end
        strip.frame_start = start
        strip.frame_end = end
        slots = getattr(action, "slots", None)
        if slots is not None and len(slots) and hasattr(strip, "action_slot"):
            strip.action_slot = slots[0]
    # Removing imported mesh/armature objects leaves stale evaluated entries until update.
    bpy.context.view_layer.update()
    for obj in bpy.context.view_layer.objects:
        obj.select_set(obj == armature)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.gltf(**export_options(out_path))


# --- audit -------------------------------------------------------------------------


def load_source():
    joints, nodes, first, parents = None, None, {}, None
    durations, tracks = {}, {}
    wanted = {clip for clips in GROUPS.values() for clip in clips}
    for pack in PACKS:
        gltf, binary = read_glb(SOURCE / pack)
        pack_nodes = nodes_by_name(gltf)
        pack_joints = [gltf["nodes"][i].get("name") for i in gltf["skins"][0]["joints"]]
        if joints is None:
            joints, nodes = pack_joints, pack_nodes
            parents = {
                child: i
                for i, node in enumerate(gltf["nodes"])
                for child in node.get("children", [])
            }
            parents = {
                node["name"]: gltf["nodes"][parents[i]]["name"] if i in parents else None
                for i, node in enumerate(gltf["nodes"])
            }
        elif pack_joints != joints:
            raise RuntimeError(f"{pack}: skeleton differs from {PACKS[0]}")
        for animation in gltf.get("animations", []):
            if animation["name"] not in wanted:
                continue
            tracks.setdefault(animation["name"], animation_tracks(gltf, binary, animation))
            first.setdefault(animation.get("name"), first_rotations(gltf, binary, animation))
            durations.setdefault(
                animation["name"],
                max(
                    accessor_values(gltf, binary, sampler["input"])[-1][0]
                    for sampler in animation["samplers"]
                ),
            )
    required = set(joints)
    for joint in joints:
        parent = parents[joint]
        while parent is not None:
            required.add(parent)
            parent = parents[parent]
    return {
        "joints": joints,
        "tracks": tracks,
        "scene_roots": [name for name in required if parents[name] is None],
        "nodes": {name: nodes[name] for name in required},
        "first_rotations": first,
        "parents": parents,
        "durations": durations,
    }


def main():
    options = args()
    wanted = sorted({clip for clips in GROUPS.values() for clip in clips})
    source = load_source()
    reset_scene()
    target, ual1_objects, ual1_actions = import_pack(PACKS[0], options["bone_heuristic"])
    actions = match_actions(PACKS[0], ual1_objects, ual1_actions, wanted)
    _, ual2_objects, ual2_actions = import_pack(PACKS[1], options["bone_heuristic"])
    for clip, action in match_actions(PACKS[1], ual2_objects, ual2_actions, wanted).items():
        if clip in actions:
            raise RuntimeError(f"clip {clip} exists in both packs")
        actions[clip] = action
    missing = [clip for clip in wanted if clip not in actions]
    if missing:
        names = sorted(a.name for a in bpy.data.actions)
        raise RuntimeError(f"clips not found: {missing}\nimported actions: {names}")
    for obj in list(bpy.data.objects):
        if obj != target:
            bpy.data.objects.remove(obj, do_unlink=True)
    stripped = {clip: strip_root_translation(actions[clip]) for clip in wanted}

    STAGING.mkdir(parents=True, exist_ok=True)
    results = []
    for group, clips in GROUPS.items():
        out_path = STAGING / f"{group}.glb"
        export_group(target, clips, actions, out_path)
        removed = strip_static_root_translation(out_path)
        result = audit_group(group, clips, out_path, source)
        result["staticRootChannelsRemoved"] = removed
        results.append(result)

    ok = all(not r["problems"] for r in results)
    written = []
    report = {
        "schemaVersion": 1,
        "generator": f"Blender {bpy.app.version_string}",
        "boneHeuristic": options["bone_heuristic"],
        "fps": FPS,
        "sources": {p: hashlib.sha256((SOURCE / p).read_bytes()).hexdigest() for p in PACKS},
        "rootTranslationCurvesRemoved": stripped,
        "groups": results,
        "ok": ok,
        "written": written,
    }
    if options["write"] and ok:
        written = publish_bundle(ROOT, report, GROUPS, source["joints"])
        report["written"] = written
    RUNTIME.mkdir(parents=True, exist_ok=True)
    (RUNTIME / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    for r in results:
        status = "ok" if not r["problems"] else "FAIL: " + "; ".join(r["problems"])
        print(f"{r['group']:>13}  {len(r['clips']):>2} clips  {r['bytes']:>9} bytes  {status}")
    print(f"report: {RUNTIME / 'report.json'}")
    if not ok:
        raise SystemExit("audit failed; nothing written")
    if options["write"]:
        print("written:", ", ".join(written))
    return report


run_reported_attempt(RUNTIME, main)
