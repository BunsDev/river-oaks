"""Malformed animation data must never become an approved public clip pack."""

import copy
import json
import runpy
import struct
from pathlib import Path

import pytest

audit_group = runpy.run_path(
    str(Path(__file__).resolve().parents[1] / "scripts/quaternius_clip_audit.py")
)["audit_group"]


def clip_fixture(tmp_path, change=None, prepare=None):
    values = [0, 1, 0, 0, 0, 1, 0, 0, 0.6, 0.8]
    binary = struct.pack("<10f", *values)
    gltf = {
        "asset": {"version": "2.0"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "root", "children": [1]}, {"name": "hand"}],
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": 8},
            {"buffer": 0, "byteOffset": 8, "byteLength": 32},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "type": "SCALAR", "count": 2},
            {"bufferView": 1, "componentType": 5126, "type": "VEC4", "count": 2},
        ],
        "animations": [
            {
                "name": "Wave",
                "samplers": [{"input": 0, "output": 1}],
                "channels": [{"sampler": 0, "target": {"node": 1, "path": "rotation"}}],
            }
        ],
    }
    if prepare:
        prepare(gltf)
    source = {
        "joints": ["root", "hand"],
        "nodes": {n["name"]: copy.deepcopy(n) for n in gltf["nodes"]},
        "first_rotations": {"Wave": {"hand": [0, 0, 0, 1]}},
        "parents": {
            n["name"]: next(
                (parent["name"] for parent in gltf["nodes"] if i in parent.get("children", [])),
                None,
            )
            for i, n in enumerate(gltf["nodes"])
        },
        "scene_roots": [gltf["nodes"][i]["name"] for i in gltf["scenes"][0]["nodes"]],
        "tracks": {
            "Wave": {
                (gltf["nodes"][c["target"]["node"]]["name"], "rotation"): (
                    [0, 1],
                    [(0, 0, 0, 1), (0, 0, 0.6, 0.8)],
                    "LINEAR",
                )
                for c in gltf["animations"][0]["channels"]
            }
        },
        "durations": {"Wave": 1.0},
    }
    if change:
        gltf, binary = change(gltf, binary)
    encoded = json.dumps(gltf, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    payload = struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
    payload += struct.pack("<II", len(binary), 0x004E4942) + binary
    path = tmp_path / "wave.glb"
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, len(payload) + 12) + payload)
    return audit_group("test", ["Wave"], path, source)


def edit_gltf(edit):
    def change(gltf, binary):
        edit(gltf)
        return gltf, binary

    return change


def test_valid_clip_passes(tmp_path):
    assert clip_fixture(tmp_path)["problems"] == []


@pytest.mark.parametrize(
    "edit",
    [
        lambda g: g.update(meshes=[{}]),
        lambda g: g["animations"][0].update(name="Wrong"),
        lambda g: g["animations"][0]["channels"][0]["target"].update(node=0, path="translation"),
        lambda g: g["nodes"][1].update(translation=[1, 0, 0]),
    ],
)
def test_existing_contract_rejects_wrong_assets(tmp_path, edit):
    assert clip_fixture(tmp_path, edit_gltf(edit))["problems"]


@pytest.mark.parametrize(
    "index,value", [(1, -1), (1, float("nan")), (8, float("nan")), (8, float("inf")), (9, 5)]
)
def test_rejects_invalid_time_or_later_rotation_sample(tmp_path, index, value):
    def corrupt(gltf, binary):
        values = list(struct.unpack("<10f", binary))
        values[index] = value
        return gltf, struct.pack("<10f", *values)

    assert clip_fixture(tmp_path, corrupt)["problems"]


@pytest.mark.parametrize(
    "edit",
    [
        lambda g: g["nodes"][1].update(scale=[2, 1, 1]),
        lambda g: g["nodes"][0].update(children=[]),
        lambda g: g["nodes"][1].update(name="root"),
        lambda g: g["animations"][0]["channels"].append(
            copy.deepcopy(g["animations"][0]["channels"][0])
        ),
        lambda g: g["accessors"][1].update(count=1),
        lambda g: g["animations"][0]["samplers"][0].update(interpolation="NOT_REAL"),
        lambda g: g["accessors"][1].update(byteOffset=4096),
    ],
)
def test_rejects_incompatible_skeleton_or_invalid_tracks(tmp_path, edit):
    assert clip_fixture(tmp_path, edit_gltf(edit))["problems"]


@pytest.mark.parametrize(
    "edit",
    [
        lambda g: g["buffers"][0].update(uri="elsewhere.bin"),
        lambda g: g["accessors"][1].update(normalized=True),
        lambda g: g["animations"][0]["channels"][0].update(sampler=-1),
        lambda g: g["animations"][0]["samplers"][0].update(output=-1),
        lambda g: g.update(cameras=[{}]),
        lambda g: g["nodes"][1].update(mesh=0),
    ],
)
def test_rejects_external_buffers_invalid_indices_and_non_animation_payloads(tmp_path, edit):
    assert clip_fixture(tmp_path, edit_gltf(edit))["problems"]


def with_root_channel(moving=False):
    def change(gltf, binary):
        gltf["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": 24})
        gltf["accessors"].append(
            {"bufferView": 2, "componentType": 5126, "type": "VEC3", "count": 2}
        )
        gltf["animations"][0]["samplers"].append({"input": 0, "output": 2})
        gltf["animations"][0]["channels"].append(
            {"sampler": 1, "target": {"node": 0, "path": "translation"}}
        )
        binary += struct.pack("<6f", 0, 0, 0, 1 if moving else 0, 0, 0)
        gltf["buffers"][0]["byteLength"] = len(binary)
        return gltf, binary

    return change


def test_removes_only_exporter_added_static_root_channels(tmp_path):
    module = runpy.run_path(
        str(Path(__file__).resolve().parents[1] / "scripts/quaternius_clip_audit.py")
    )
    normalize = module.get("strip_static_root_translation")
    assert callable(normalize), "static root channel normalization must exist"
    assert clip_fixture(tmp_path, with_root_channel())["problems"]
    path = tmp_path / "wave.glb"
    before, binary = module["read_glb"](path)
    assert normalize(path) == 1
    after, after_binary = module["read_glb"](path)
    assert after_binary == binary
    assert after["animations"][0]["channels"] == before["animations"][0]["channels"][:1]
    assert normalize(path) == 0


def test_normalizer_refuses_motion_and_preserves_failed_bytes(tmp_path):
    module = runpy.run_path(
        str(Path(__file__).resolve().parents[1] / "scripts/quaternius_clip_audit.py")
    )
    normalize = module.get("strip_static_root_translation")
    assert callable(normalize), "static root channel normalization must exist"
    clip_fixture(tmp_path, with_root_channel(moving=True))
    path = tmp_path / "wave.glb"
    before = path.read_bytes()
    with pytest.raises(ValueError, match="root translation"):
        normalize(path)
    assert path.read_bytes() == before


def test_rejects_one_frame_truncation_even_when_tracks_are_valid(tmp_path):
    def truncated(gltf, binary):
        values = list(struct.unpack("<10f", binary))
        values[1] = 29 / 30
        return gltf, struct.pack("<10f", *values)

    assert clip_fixture(tmp_path, truncated)["problems"]


def test_integer_frame_bounds_preserve_last_frame_after_float_import():
    module = runpy.run_path(
        str(Path(__file__).resolve().parents[1] / "scripts/quaternius_clip_audit.py")
    )
    bounds = module.get("integer_frame_bounds")
    assert callable(bounds), "frame-range normalization must exist"
    assert bounds([0, 124.999995]) == (0, 125)
    assert bounds([0, 125.000003]) == (0, 125)
    with pytest.raises(ValueError):
        bounds([0, 124.5])


def test_rejects_dropped_channel_with_unused_sampler_retained(tmp_path):
    def prepare(g):
        g["animations"][0]["samplers"].append({"input": 0, "output": 1})
        g["animations"][0]["channels"].append(
            {"sampler": 1, "target": {"node": 0, "path": "rotation"}}
        )

    def drop(g):
        g["animations"][0]["channels"].pop()

    assert clip_fixture(tmp_path, edit_gltf(drop), prepare)["problems"]


def test_rejects_changed_later_unit_rotation(tmp_path):
    def change(g, b):
        values = list(struct.unpack("<10f", b))
        values[8:10] = [0.8, 0.6]
        return g, struct.pack("<10f", *values)

    assert clip_fixture(tmp_path, change)["problems"]


def with_ancestor(g):
    g["nodes"].append({"name": "Armature", "children": [0]})
    g["scenes"][0]["nodes"] = [2]


@pytest.mark.parametrize(
    "edit",
    [
        lambda g: g["nodes"][2].update(scale=[100, 100, 100]),
        lambda g: g["nodes"][2].update(translation=[1, 0, 0]),
        lambda g: g["nodes"][2].update(rotation=[0, 0, 0.6, 0.8]),
        lambda g: g["scenes"][0].update(nodes=[0]),
        lambda g: g["scenes"][0].update(nodes=[]),
    ],
)
def test_rejects_changed_ancestor_or_scene_membership(tmp_path, edit):
    assert clip_fixture(tmp_path, edit_gltf(edit), with_ancestor)["problems"]


def test_valid_ancestor_passes(tmp_path):
    assert clip_fixture(tmp_path, prepare=with_ancestor)["problems"] == []


def test_failed_attempt_invalidates_success_and_preserves_history(tmp_path):
    module = runpy.run_path(
        str(Path(__file__).resolve().parents[1] / "scripts/quaternius_clip_audit.py")
    )
    attempt = module.get("run_reported_attempt")
    assert callable(attempt), "rebuild must invalidate stale success before work starts"
    report = tmp_path / "report.json"
    original = '{"ok": true, "old": true}\n'
    report.write_text(original)

    def fail():
        current = json.loads(report.read_text())
        assert current["ok"] is False and current["status"] == "running"
        raise RuntimeError("export failed")

    with pytest.raises(RuntimeError, match="export failed"):
        attempt(tmp_path, fail)
    current = json.loads(report.read_text())
    assert current["ok"] is False and current["status"] == "failed"
    assert "export failed" in current["error"]
    assert any(p.read_text() == original for p in (tmp_path / "history").glob("*.json"))


def test_unreferenced_sampler_cannot_mask_shortened_clip(tmp_path):
    def shorten(g, b):
        g["bufferViews"].append({"buffer": 0, "byteOffset": len(b), "byteLength": 8})
        g["accessors"].append(
            {"bufferView": 2, "componentType": 5126, "type": "SCALAR", "count": 2}
        )
        g["animations"][0]["samplers"].append({"input": 2, "output": 1})
        g["animations"][0]["channels"][0]["sampler"] = 1
        b += struct.pack("<2f", 0, 29 / 30)
        g["buffers"][0]["byteLength"] = len(b)
        return g, b

    problems = clip_fixture(tmp_path, shorten)["problems"]
    assert any("clip duration differs" in problem for problem in problems)


def test_successful_attempt_identifies_current_report(tmp_path):
    module = runpy.run_path(
        str(Path(__file__).resolve().parents[1] / "scripts/quaternius_clip_audit.py")
    )
    result = module["run_reported_attempt"](tmp_path, lambda: {"ok": True, "groups": ["fixture"]})
    report = json.loads((tmp_path / "report.json").read_text())
    assert result["ok"] is True
    assert report["status"] == "passed" and report["ok"] is True
    assert report["groups"] == ["fixture"]
    assert report["attempt"] and report["startedAt"] and report["finishedAt"]
