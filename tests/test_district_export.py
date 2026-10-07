import json
from pathlib import Path

import pytest

from river_oaks.district import district_manifest

SOURCE = Path(__file__).parents[1] / "preview/public/data/district.json"


def test_native_scene_is_only_the_shopping_district():
    source = json.loads(SOURCE.read_text())
    result = district_manifest(source)
    assert result["scene"] == "district"
    assert len(result["buildings"]) == 9
    assert len(result["roads"]) == 39
    assert result["bounds_m"] == source["bounds_m"]
    assert result["bounds_m"][2] - result["bounds_m"][0] < 300
    assert result["bounds_m"][3] - result["bounds_m"][1] < 300
    assert result["walkSpawn"][:2] == source["walkSpawn"][:2]
    assert result["walkSpawn"][2] == 0
    assert all(b["center"][2] == 0 for b in result["buildings"])
    assert all(p[2] == 0 for r in result["roads"] for p in r["points"])
    assert source["walkSpawn"][2] > 0  # Export must not rewrite browser terrain data.
    assert "provenance" in result


def test_export_rejects_neighborhood_and_oversized_scenes():
    source = json.loads(SOURCE.read_text())
    with pytest.raises(ValueError, match="district"):
        district_manifest({**source, "scene": "neighborhood"})
    with pytest.raises(ValueError, match="district"):
        district_manifest({**source, "bounds_m": [0, 0, 4000, 4000]})


def test_native_courtyard_crown_correction_preserves_every_other_tree_field():
    source = json.loads(SOURCE.read_text())
    original = json.loads(json.dumps(source))
    exported = district_manifest(source)
    for tree, native in zip(source["trees"], exported["trees"], strict=True):
        expected = {**tree, "position": [*tree["position"][:2], 0]}
        if tree["id"] == "osm-node-5904555939":
            expected["crown_radius_m"] = 3.29
        assert native == expected
    assert source == original
    assert district_manifest(exported) == exported


def test_native_courtyard_correction_never_enlarges_a_smaller_crown():
    source = json.loads(SOURCE.read_text())
    tree = next(t for t in source["trees"] if t["id"] == "osm-node-5904555939")
    tree["crown_radius_m"] = 3.0
    result = district_manifest(source)
    assert next(t for t in result["trees"] if t["id"] == tree["id"])["crown_radius_m"] == 3.0
