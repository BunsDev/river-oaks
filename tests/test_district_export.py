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
