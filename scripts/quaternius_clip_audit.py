"""Pure GLB checks shared by the Quaternius exporter and offline regressions."""

import bisect
import hashlib
import json
import math
import struct
import uuid
from datetime import datetime, timezone

ROOT_BONE = "root"
REST_TOLERANCE = 1e-4
SAMPLE_DOT = 0.999


def read_glb(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or length != len(data):
        raise ValueError(f"{path.name}: invalid GLB header")
    offset, gltf, binary = 12, None, b""
    while offset < length:
        chunk_length, chunk_type = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunk = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == b"JSON":
            gltf = json.loads(chunk)
        elif chunk_type == b"BIN\x00":
            binary = chunk
    if gltf is None:
        raise ValueError(f"{path.name}: missing JSON chunk")
    return gltf, binary


def accessor_values(gltf, binary, index):
    if not isinstance(index, int) or index < 0:
        raise ValueError("invalid animation accessor index")
    accessor = gltf["accessors"][index]
    if (
        accessor.get("componentType") != 5126
        or accessor.get("sparse")
        or accessor.get("normalized")
        or "bufferView" not in accessor
    ):
        raise ValueError("animation accessor must be dense float data")
    size = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[accessor["type"]]
    view = gltf["bufferViews"][accessor["bufferView"]]
    count = accessor["count"]
    stride = view.get("byteStride", 4 * size)
    offset = accessor.get("byteOffset", 0)
    view_offset = view.get("byteOffset", 0)
    if (
        view.get("buffer") != 0
        or not isinstance(count, int)
        or not 0 < count <= 1000000
        or not all(isinstance(n, int) and n >= 0 for n in [stride, offset, view_offset])
        or stride < 4 * size
        or offset + (count - 1) * stride + 4 * size > view["byteLength"]
        or view_offset + view["byteLength"] > len(binary)
    ):
        raise ValueError("animation accessor outside embedded buffer")
    base = view_offset + offset
    return [struct.unpack_from(f"<{size}f", binary, base + i * stride) for i in range(count)]


def validate_tracks(gltf, binary, source):
    buffers = gltf.get("buffers", [])
    if len(buffers) != 1 or "uri" in buffers[0] or buffers[0].get("byteLength") != len(binary):
        raise ValueError("one embedded animation buffer required")
    if any(gltf.get(key) for key in ["meshes", "images", "textures", "materials", "cameras"]):
        raise ValueError("non-animation payload present")
    nodes = gltf.get("nodes", [])
    names = [node.get("name") for node in nodes]
    if any(not isinstance(name, str) or not name for name in names) or len(set(names)) != len(
        names
    ):
        raise ValueError("joint names must be unique nonempty strings")
    parents = {}
    for index, node in enumerate(nodes):
        if any(key in node for key in ["mesh", "camera", "extensions"]):
            raise ValueError("non-animation node present")
        for child in node.get("children", []):
            if not isinstance(child, int) or not 0 <= child < len(nodes) or child in parents:
                raise ValueError("invalid skeleton hierarchy")
            parents[child] = index
        for key, size in [("translation", 3), ("rotation", 4), ("scale", 3), ("matrix", 16)]:
            if key in node and (
                len(node[key]) != size or not all(math.isfinite(v) for v in node[key])
            ):
                raise ValueError("invalid joint transform")
        if "matrix" in node:
            raise ValueError("matrix joint transforms are unsupported")
        q = node.get("rotation", [0, 0, 0, 1])
        if abs(sum(v * v for v in q) - 1) > 0.001:
            raise ValueError("non-unit rest rotation")
        if any(v <= 0 for v in node.get("scale", [1, 1, 1])):
            raise ValueError("invalid joint scale")
    for index, node in enumerate(nodes):
        seen = set()
        current = index
        while current in parents:
            if current in seen:
                raise ValueError("cyclic skeleton hierarchy")
            seen.add(current)
            current = parents[current]
        name = node["name"]
        if name not in source["nodes"]:
            raise ValueError(f"unexpected skeleton node: {name}")
        if name in source["nodes"]:
            expected = source.get("parents", {}).get(name)
            actual = names[parents[index]] if index in parents else None
            if "parents" in source and actual != expected:
                raise ValueError(f"joint parent differs: {name}")
            a = source["nodes"][name].get("scale", [1, 1, 1])
            if any(abs(x - y) > REST_TOLERANCE for x, y in zip(a, node.get("scale", [1, 1, 1]))):
                raise ValueError(f"joint scale differs: {name}")
    if set(names) != set(source["nodes"]):
        raise ValueError("skeleton nodes differ from source joints and ancestors")
    scene_index = gltf.get("scene")
    if not isinstance(scene_index, int) or not 0 <= scene_index < len(gltf.get("scenes", [])):
        raise ValueError("missing active skeleton scene")
    roots = gltf["scenes"][scene_index].get("nodes", [])
    if any(not isinstance(i, int) or not 0 <= i < len(nodes) for i in roots):
        raise ValueError("invalid scene root")
    if len(set(roots)) != len(roots) or set(roots) != set(range(len(nodes))) - set(parents):
        raise ValueError("scene roots do not contain the complete skeleton")
    if {names[i] for i in roots} != set(source["scene_roots"]):
        raise ValueError("scene roots differ from source")
    for animation in gltf.get("animations", []):
        if not animation.get("channels"):
            raise ValueError("empty animation")
        seen = set()
        for channel in animation["channels"]:
            target = channel["target"]
            index, path = target.get("node"), target.get("path")
            if not isinstance(index, int) or not 0 <= index < len(nodes):
                raise ValueError("invalid channel node")
            if path not in ["rotation", "translation", "scale"] or (index, path) in seen:
                raise ValueError("invalid or duplicate channel")
            seen.add((index, path))
            sampler_index = channel["sampler"]
            if not isinstance(sampler_index, int) or sampler_index < 0:
                raise ValueError("invalid channel sampler index")
            sampler = animation["samplers"][sampler_index]
            interpolation = sampler.get("interpolation", "LINEAR")
            if interpolation not in ["LINEAR", "STEP", "CUBICSPLINE"]:
                raise ValueError("invalid interpolation")
            times = accessor_values(gltf, binary, sampler["input"])
            values = accessor_values(gltf, binary, sampler["output"])
            if any(len(t) != 1 or not math.isfinite(t[0]) or t[0] < 0 for t in times):
                raise ValueError("invalid animation time")
            if any(a[0] >= b[0] for a, b in zip(times, times[1:])):
                raise ValueError("animation times must increase")
            cubic = interpolation == "CUBICSPLINE"
            if len(values) != len(times) * (3 if cubic else 1):
                raise ValueError("animation time/value count mismatch")
            size = 4 if path == "rotation" else 3
            if any(len(v) != size or not all(math.isfinite(x) for x in v) for v in values):
                raise ValueError("invalid animation sample")
            rotations = values[1::3] if cubic else values
            if path == "rotation" and any(
                abs(sum(x * x for x in v) - 1) > 0.001 for v in rotations
            ):
                raise ValueError("non-unit animation rotation")


def nodes_by_name(gltf):
    return {node.get("name"): node for node in gltf.get("nodes", [])}


def first_rotations(gltf, binary, animation):
    result = {}
    for channel in animation["channels"]:
        target = channel["target"]
        if target.get("path") != "rotation" or "node" not in target:
            continue
        sampler = animation["samplers"][channel["sampler"]]
        values = accessor_values(gltf, binary, sampler["output"])
        if values:
            result[gltf["nodes"][target["node"]].get("name")] = values[0]
    return result


def quat_dot(a, b):
    return abs(sum(x * y for x, y in zip(a, b)))


def audit_group(group, clips, out_path, source):
    data = out_path.read_bytes()
    failure = {
        "group": group,
        "clips": [],
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }
    try:
        gltf, binary = read_glb(out_path)
        validate_tracks(gltf, binary, source)
    except (ValueError, KeyError, IndexError, TypeError, struct.error) as error:
        return {**failure, "problems": [f"invalid clip data: {error}"]}
    problems = []
    if gltf.get("meshes"):
        problems.append(f"{len(gltf['meshes'])} meshes present")
    if gltf.get("images"):
        problems.append(f"{len(gltf['images'])} images present")
    names = [a.get("name") for a in gltf.get("animations", [])]
    if sorted(names) != sorted(clips):
        problems.append(
            f"clip set mismatch: missing {sorted(set(clips) - set(names))}, "
            f"extra {sorted(set(names) - set(clips))}"
        )
    out_nodes = nodes_by_name(gltf)
    joints, source_nodes = source["joints"], source["nodes"]
    missing_joints = [j for j in joints if j not in out_nodes]
    if missing_joints:
        problems.append(f"missing joints: {missing_joints}")
    worst_rest = 0.0
    for joint in source_nodes:
        if joint not in out_nodes:
            continue
        a, b = source_nodes[joint], out_nodes[joint]
        ra, rb = a.get("rotation", [0, 0, 0, 1]), b.get("rotation", [0, 0, 0, 1])
        ta, tb = a.get("translation", [0, 0, 0]), b.get("translation", [0, 0, 0])
        worst_rest = max(worst_rest, 1 - quat_dot(ra, rb), *(abs(x - y) for x, y in zip(ta, tb)))
    if worst_rest > REST_TOLERANCE:
        problems.append(f"joint rest transforms differ from source (worst {worst_rest:.6f})")
    motion = []
    worst_sample, sampled = 1.0, 0
    for animation in gltf.get("animations", []):
        name = animation.get("name")
        if name in source.get("durations", {}):
            duration = max(
                accessor_values(gltf, binary, sampler["input"])[-1][0]
                for sampler in [animation["samplers"][c["sampler"]] for c in animation["channels"]]
            )
            if abs(duration - source["durations"][name]) > 0.00001:
                problems.append(f"{name}: clip duration differs from source")
        for channel in animation["channels"]:
            target = channel["target"]
            node_name = gltf["nodes"][target["node"]].get("name") if "node" in target else None
            if node_name not in joints:
                problems.append(f"{name}: channel targets non-joint node {node_name}")
            if node_name == ROOT_BONE and target.get("path") == "translation":
                problems.append(f"{name}: root translation channel present")
        try:
            motion.append(
                compare_motion(animation_tracks(gltf, binary, animation), source["tracks"][name])
            )
        except (ValueError, KeyError) as error:
            problems.append(f"{name}: {error}")
        reference = source["first_rotations"].get(name)
        if reference:
            for node_name, value in first_rotations(gltf, binary, animation).items():
                if node_name in reference:
                    worst_sample = min(worst_sample, quat_dot(value, reference[node_name]))
                    sampled += 1
    if sampled == 0:
        problems.append("no first-sample rotations compared")
    elif worst_sample < SAMPLE_DOT:
        problems.append(f"first-sample rotations differ from source (worst dot {worst_sample:.5f})")
    data = out_path.read_bytes()
    return {
        "group": group,
        "clips": names,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "worstRestDelta": worst_rest,
        "worstFirstSampleDot": worst_sample,
        "sampledChannels": sampled,
        "motion": motion,
        "problems": problems,
    }


def strip_static_root_translation(path):
    """Remove only rest-valued channels recreated by Blender's forced sampling.

    Refuse motion rather than hiding it. All checks precede the single write;
    animation samples and the binary chunk remain byte-identical.
    """
    gltf, binary = read_glb(path)
    removed = 0
    for animation in gltf.get("animations", []):
        retained = []
        for channel in animation["channels"]:
            target = channel["target"]
            node = gltf["nodes"][target["node"]]
            if node.get("name") != ROOT_BONE or target.get("path") != "translation":
                retained.append(channel)
                continue
            sampler = animation["samplers"][channel["sampler"]]
            values = accessor_values(gltf, binary, sampler["output"])
            rest = tuple(node.get("translation", [0, 0, 0]))
            if sampler.get("interpolation", "LINEAR") not in ["LINEAR", "STEP"] or any(
                value != rest for value in values
            ):
                raise ValueError(f"{animation['name']}: non-static root translation")
            removed += 1
        animation["channels"] = retained
    if removed:
        encoded = json.dumps(gltf, separators=(",", ":"), allow_nan=False).encode()
        encoded += b" " * (-len(encoded) % 4)
        chunks = struct.pack("<I4s", len(encoded), b"JSON") + encoded
        chunks += struct.pack("<I4s", len(binary), b"BIN\x00") + binary
        path.write_bytes(struct.pack("<4sII", b"glTF", 2, len(chunks) + 12) + chunks)
    return removed


def integer_frame_bounds(frame_range):
    """Keep near-integer imported frames from being truncated by NLA export."""
    start, end = frame_range
    if not all(math.isfinite(v) and abs(v - round(v)) < 0.0001 for v in [start, end]):
        raise ValueError("animation frames do not match the pinned 30 fps time base")
    if round(end) <= round(start):
        raise ValueError("empty animation frame range")
    return round(start), round(end)


def animation_tracks(gltf, binary, animation):
    """Decode the full intended track set, except intentionally removed root position."""
    result = {}
    for channel in animation["channels"]:
        target = channel["target"]
        key = (gltf["nodes"][target["node"]]["name"], target["path"])
        if key == (ROOT_BONE, "translation"):
            continue
        if key in result:
            raise ValueError("duplicate source channel")
        sampler = animation["samplers"][channel["sampler"]]
        result[key] = (
            [t[0] for t in accessor_values(gltf, binary, sampler["input"])],
            accessor_values(gltf, binary, sampler["output"]),
            sampler.get("interpolation", "LINEAR"),
        )
    return result


def sample_track(track, time, path):
    times, values, mode = track
    if mode not in ("LINEAR", "STEP"):
        raise ValueError("source-motion comparison requires LINEAR or STEP interpolation")
    if time <= times[0]:
        return values[0]
    index = bisect.bisect_right(times, time) - 1
    if index == len(times) - 1 or mode == "STEP":
        return values[index]
    fraction = (time - times[index]) / (times[index + 1] - times[index])
    a, b = values[index], values[index + 1]
    if path == "rotation":
        dot = sum(x * y for x, y in zip(a, b))
        if dot < 0:
            b, dot = tuple(-x for x in b), -dot
        if dot < 0.9995:
            theta = math.acos(max(-1, min(1, dot)))
            return tuple(
                (math.sin((1 - fraction) * theta) * x + math.sin(fraction * theta) * y)
                / math.sin(theta)
                for x, y in zip(a, b)
            )
        value = tuple((1 - fraction) * x + fraction * y for x, y in zip(a, b))
        norm = math.sqrt(sum(x * x for x in value))
        return tuple(x / norm for x in value)
    return tuple((1 - fraction) * x + fraction * y for x, y in zip(a, b))


def compare_motion(actual, expected):
    if actual.keys() != expected.keys():
        raise ValueError("animation channel coverage differs from source")
    worst_dot, worst_delta, samples = 1.0, 0.0, 0
    for key, reference in expected.items():
        observed = actual[key]
        # Key times plus interval midpoints cover optimized LINEAR/STEP exports.
        times = sorted(set(reference[0] + observed[0]))
        times += [(a + b) / 2 for a, b in zip(times, times[1:])]
        for time in times:
            a, b = sample_track(reference, time, key[1]), sample_track(observed, time, key[1])
            if key[1] == "rotation":
                dot = quat_dot(a, b)
                worst_dot = min(worst_dot, dot)
                if dot < SAMPLE_DOT:
                    raise ValueError(f"rotation motion differs from source: {key} at {time}")
            else:
                delta = max(abs(x - y) for x, y in zip(a, b))
                worst_delta = max(worst_delta, delta)
                if delta > REST_TOLERANCE:
                    raise ValueError(f"vector motion differs from source: {key} at {time}")
            samples += 1
    return {
        "tracks": len(actual),
        "samples": samples,
        "worstRotationDot": worst_dot,
        "worstVectorDelta": worst_delta,
    }


def run_reported_attempt(runtime, operation):
    """Invalidate current success before starting, retaining previous report bytes."""
    runtime.mkdir(parents=True, exist_ok=True)
    report_path = runtime / "report.json"
    attempt = uuid.uuid4().hex
    if report_path.exists():
        history = runtime / "history"
        history.mkdir(exist_ok=True)
        (history / f"{attempt}-previous.json").write_bytes(report_path.read_bytes())

    def write(report):
        temporary = runtime / "report.json.tmp"
        temporary.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
        temporary.replace(report_path)

    state = {
        "attempt": attempt,
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "ok": False,
        "status": "running",
    }
    write(state)
    try:
        report = operation()
        if not report.get("ok"):
            raise ValueError("attempt did not pass all audits")
    except BaseException as error:
        current = json.loads(report_path.read_text())
        write(
            {
                **current,
                **state,
                "status": "failed",
                "error": f"{type(error).__name__}: {error}",
                "outputState": "unverified",
                "finishedAt": datetime.now(timezone.utc).isoformat(),
            }
        )
        raise
    write(
        {
            **state,
            **report,
            "status": "passed",
            "finishedAt": datetime.now(timezone.utc).isoformat(),
        }
    )
    return report
