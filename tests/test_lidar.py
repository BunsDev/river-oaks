import hashlib
import json
import subprocess
import sys
from pathlib import Path

import httpx
import numpy as np
import pytest

from river_oaks.lidar import (
    EPTSubset,
    audit_heights,
    extract_vegetation,
    measure_building_heights,
    node_bounds,
)

META = {
    "bounds": [0, 0, 0, 8, 8, 8],
    "boundsConforming": [0, 0, 0, 8, 8, 8],
    "dataType": "laszip",
    "hierarchyType": "json",
    "srs": {"authority": "EPSG", "horizontal": "3857"},
}


def client_for(files):
    def handle(request):
        value = files.get(request.url.path.removeprefix("/test/"))
        return httpx.Response(404) if value is None else httpx.Response(200, json=value)

    return httpx.Client(transport=httpx.MockTransport(handle))


def test_node_bounds_use_all_three_indices_and_reject_invalid_paths():
    assert node_bounds(META["bounds"], "2-1-2-3") == [2, 4, 6, 4, 6, 8]
    for key in ["../tile", "1-2-0-0", "-1-0-0-0", "25-0-0-0"]:
        with pytest.raises(ValueError):
            node_bounds(META["bounds"], key)


def test_hierarchy_is_additive_and_follows_only_intersecting_subtrees(tmp_path):
    files = {
        "ept.json": META,
        "ept-hierarchy/0-0-0-0.json": {
            "0-0-0-0": 10,
            "1-0-0-0": -1,
            "1-1-1-1": -1,
        },
        "ept-hierarchy/1-0-0-0.json": {"1-0-0-0": 20, "2-0-0-0": 30},
    }
    source = EPTSubset("https://example.test/test", tmp_path, client=client_for(files))
    selected = source.select([0.1, 0.1, 0.1, 1, 1, 1])
    assert selected == {"0-0-0-0": 10, "1-0-0-0": 20, "2-0-0-0": 30}
    assert len(source.receipts) == 3
    assert all(len(item["sha256"]) == 64 for item in source.receipts.values())


@pytest.mark.parametrize("subtree", [None, {"1-0-0-0": -1}, {"1-0-0-0": 0}])
def test_incomplete_or_cyclic_hierarchy_cannot_be_reported_complete(tmp_path, subtree):
    files = {
        "ept.json": META,
        "ept-hierarchy/0-0-0-0.json": {"0-0-0-0": 10, "1-0-0-0": -1},
    }
    if subtree is not None:
        files["ept-hierarchy/1-0-0-0.json"] = subtree
    source = EPTSubset("https://example.test/test", tmp_path, client=client_for(files))
    with pytest.raises((ValueError, httpx.HTTPStatusError)):
        source.select([0.1, 0.1, 0.1, 1, 1, 1])


def test_excessive_point_count_and_invalid_metadata_fail_before_tile_download(tmp_path):
    files = {
        "ept.json": META,
        "ept-hierarchy/0-0-0-0.json": {"0-0-0-0": 5_000_001},
    }
    source = EPTSubset("https://example.test/test", tmp_path, client=client_for(files))
    with pytest.raises(ValueError, match="point budget"):
        source.select([0.1, 0.1, 0.1, 1, 1, 1])
    (tmp_path / "ept.json").write_text(json.dumps({**META, "dataType": "binary"}))
    with pytest.raises(ValueError, match="laszip"):
        EPTSubset("https://example.test/test", tmp_path, client=client_for(files))


def test_canopy_uses_classified_returns_and_same_survey_ground_without_inventing_stems():
    # Ground and crown share an arbitrary vertical offset; height must not depend on it.
    points = np.array(
        [
            [1, 1, 100, 2, 0],
            [1.1, 1, 100, 2, 0],
            [1, 1, 108, 5, 0],
            [1.1, 1.1, 108.2, 5, 0],
            [2, 2, 106, 4, 0],
            [3, 3, 115, 6, 0],
            [4, 4, 110, 1, 0],
            [1, 1, 110, 5, 1],
            [1, 1, 101, 3, 0],
            [80, 80, 115, 5, 0],
        ]
    )
    result = extract_vegetation(points, [0, 0, 100, 100])
    voxels = np.asarray(result["voxels"])
    assert len(voxels) == 2
    assert sorted(voxels[:, 2]) == pytest.approx([6, 8.1])
    assert result["supported_returns"] == 3
    assert result["unsupported_ground_returns"] == 1
    assert result["retained_classes"] == [4, 5]
    shifted = points.copy()
    shifted[:, 2] += 200
    assert np.asarray(extract_vegetation(shifted, [0, 0, 100, 100])["voxels"])[
        :, :3
    ] == pytest.approx(voxels[:, :3])
    assert "trees" not in result


def test_empty_ground_or_nonfinite_points_cannot_generate_a_canopy():
    with pytest.raises(ValueError, match="ground"):
        extract_vegetation(np.array([[1, 1, 8, 5, 0]]), [0, 0, 10, 10])
    with pytest.raises(ValueError, match="finite"):
        extract_vegetation(np.array([[1, 1, np.nan, 2, 0]]), [0, 0, 10, 10])


def block_survey(*, ground=100.0, roof=112.0):
    """A 20 x 10 m flat roof with walls, ground around it and one stray high return."""
    xs, ys = np.meshgrid(np.arange(0.25, 20, 0.5), np.arange(0.25, 10, 0.5))
    roof_returns = np.column_stack([xs.ravel(), ys.ravel(), np.full(xs.size, roof)])
    # Wall and eave returns hug the outline at mid height; the inset must exclude them.
    wall = np.column_stack([np.linspace(0, 20, 41), np.full(41, 0.3), np.full(41, ground + 5)])
    gx, gy = np.meshgrid(np.arange(-12, 32, 1.0), np.arange(-12, 22, 1.0))
    outside = ~((gx > -2) & (gx < 22) & (gy > -2) & (gy < 12))
    ground_returns = np.column_stack([gx[outside], gy[outside], np.full(outside.sum(), ground)])
    rows = [
        np.column_stack([roof_returns, np.full(len(roof_returns), 6), np.zeros(len(roof_returns))])
    ]
    rows.append(np.column_stack([wall, np.full(len(wall), 6), np.zeros(len(wall))]))
    rows.append(
        np.column_stack(
            [ground_returns, np.full(len(ground_returns), 2), np.zeros(len(ground_returns))]
        )
    )
    rows.append(
        [[10, 5, ground + 250, 6, 0], [10, 5, ground + 90, 6, 1], [60, 60, ground - 30, 2, 0]]
    )
    return np.vstack(rows)


BLOCK = {"id": "block", "ring": [[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]]}


def test_building_height_is_the_roof_above_same_survey_ground_not_walls_or_noise():
    points = block_survey()
    [row] = measure_building_heights(points, [BLOCK])
    assert row["height_m"] == pytest.approx(12)
    assert row["median_m"] == pytest.approx(12)
    assert row["ground_z_m"] == pytest.approx(100)
    # Wall returns sit inside the outline but within the inset, and stay out of the roof.
    assert row["roof_returns"] == 34 * 14 + 1
    shifted = points.copy()
    shifted[:, 2] += 200
    assert measure_building_heights(shifted, [BLOCK])[0]["height_m"] == pytest.approx(12)


def test_a_footprint_without_enough_returns_is_unmeasured_rather_than_guessed():
    points = block_survey()
    [row] = measure_building_heights(points[points[:, 3] != 6], [BLOCK])
    assert row["height_m"] is None
    assert row["unmeasured_reason"] == "fewer than 20 roof returns"
    far = {"id": "far", "ring": [[500, 500], [510, 500], [510, 510], [500, 500]]}
    assert measure_building_heights(points, [far])[0]["unmeasured_reason"] == (
        "fewer than 20 roof returns"
    )


def test_invalid_points_or_rings_are_rejected():
    with pytest.raises(ValueError, match="finite"):
        measure_building_heights(np.array([[1, 1, np.nan, 6, 0]]), [BLOCK])
    with pytest.raises(ValueError, match="ring"):
        measure_building_heights(block_survey(), [{"id": "line", "ring": [[0, 0], [1, 1]]}])


def test_height_audit_fails_undocumented_gaps_and_reports_authored_overrides():
    measured = [
        {"id": "a", "height_m": 12.0},
        {"id": "b", "height_m": 12.0},
        {"id": "c", "height_m": 12.0},
    ]
    buildings = [
        {"id": "a", "size": [1, 1, 14.5], "height_source": "street-level photographs, estimated"},
        {"id": "b", "size": [1, 1, 17.0], "height_source": "authored 5 m above the photograph"},
        {"id": "c", "size": [1, 1, 15.5], "height_source": "estimated from default levels"},
    ]
    result = audit_heights(buildings, measured, tolerance_m=3)
    assert [row["status"] for row in result["buildings"]] == [
        "within-tolerance",
        "authored-override",
        "exceeds-tolerance",
    ]
    assert result["buildings"][2]["authored_minus_measured_m"] == pytest.approx(3.5)
    assert result["status"] == "failed"
    buildings[2]["size"][2] = 14.9
    assert audit_heights(buildings, measured, tolerance_m=3)["status"] == "passed"


def test_height_audit_is_blocked_when_a_building_was_not_measured():
    buildings = [{"id": "a", "size": [1, 1, 12], "height_source": "photographs"}]
    result = audit_heights(buildings, [{"id": "a", "height_m": None}], tolerance_m=3)
    assert result["buildings"][0]["status"] == "unmeasured"
    assert result["status"] == "blocked"
    with pytest.raises(ValueError, match="missing"):
        audit_heights(buildings, [], tolerance_m=3)


def run_audit(tmp_path, *, authored=12.5, receipt_hash=None):
    district = tmp_path / "district.json"
    world = {
        "crs": "EPSG:32615",
        "origin": [-95.4, 29.7],
        "buildings": [BLOCK | {"size": [20, 10, authored], "height_source": "photographs"}],
    }
    district.write_text(json.dumps(world))
    lidar = tmp_path / "lidar"
    lidar.mkdir(exist_ok=True)
    np.savez_compressed(lidar / "points.npz", points=block_survey())
    digest = hashlib.sha256((lidar / "points.npz").read_bytes()).hexdigest()
    receipt = {
        "points_sha256": receipt_hash or digest,
        "crs": world["crs"],
        "origin": world["origin"],
        "source_id": "synthetic",
        "acquisition_window": ["2018-01-12", "2018-03-22"],
    }
    (lidar / "receipt.json").write_text(json.dumps(receipt))
    before = district.read_bytes()
    out = tmp_path / "report.json"
    script = Path(__file__).resolve().parents[1] / "scripts/audit_district_heights.py"
    args = ["--district", district, "--lidar", lidar, "--out", out]
    result = subprocess.run([sys.executable, script, *map(str, args)], capture_output=True)
    assert district.read_bytes() == before
    return result.returncode, json.loads(out.read_text()) if out.exists() else None


def test_audit_script_reports_without_changing_the_district(tmp_path):
    code, report = run_audit(tmp_path)
    assert code == 0
    assert report["status"] == "passed"
    assert report["buildings"][0]["measured_m"] == pytest.approx(12)
    code, report = run_audit(tmp_path, authored=16)
    assert (code, report["status"]) == (1, "failed")


def test_audit_script_is_blocked_without_a_matching_lidar_subset(tmp_path):
    code, report = run_audit(tmp_path, receipt_hash="0" * 64)
    assert (code, report) == (2, None)
    script = Path(__file__).resolve().parents[1] / "scripts/audit_district_heights.py"
    missing = subprocess.run(
        [sys.executable, script, "--lidar", str(tmp_path / "none"), "--out", str(tmp_path / "x")],
        capture_output=True,
    )
    assert missing.returncode == 2
    assert not (tmp_path / "x").exists()
