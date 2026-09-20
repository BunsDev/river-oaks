import json

import httpx
import numpy as np
import pytest

from river_oaks.lidar import EPTSubset, extract_vegetation, node_bounds

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
