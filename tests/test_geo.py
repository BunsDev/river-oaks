import copy

import pytest
from shapely.geometry import Polygon, box, mapping

from river_oaks.geo import LocalFrame, build_world
from river_oaks.verify import verify_world


def collection(features):
    return {"type": "FeatureCollection", "features": features}


def feature(fid, geometry, **props):
    return {
        "type": "Feature",
        "id": fid,
        "geometry": mapping(geometry),
        "properties": {"OBJECTID": fid, **props},
    }


@pytest.fixture
def inputs():
    from shapely.geometry import LineString

    config = {
        "origin": [-95.425, 29.755],
        "crs": "EPSG:32615",
        "bbox": [-95.427, 29.753, -95.423, 29.757],
        "seed": 42,
        "setback_m": 6,
    }
    roads = collection(
        [feature(1, LineString([(-95.428, 29.755), (-95.422, 29.755)]), ST_NAME="Test Road")]
    )
    parcels = collection([feature(2, box(-95.426, 29.7553, -95.4253, 29.756), state_class="A1")])
    return config, roads, parcels


def test_projection_round_trip_and_metric_units():
    frame = LocalFrame([-95.425, 29.755], "EPSG:32615")
    assert frame.to_local(-95.425, 29.755) == pytest.approx((0, 0), abs=1e-7)
    x, y = frame.to_local(-95.424, 29.755)
    assert 95 < x < 98
    assert frame.to_wgs84(x, y) == pytest.approx((-95.424, 29.755), abs=1e-8)


def test_world_is_deterministic_clipped_and_houses_fit_setbacks(inputs):
    config, roads, parcels = inputs
    world = build_world(config, roads, parcels)
    assert world == build_world(config, roads, parcels)
    assert world["trees"] == []  # No invented canopy observations.
    assert world["roads"][0]["lanes"] is None
    assert world["buildings"]
    bounds = box(*world["bounds_m"]).buffer(0.1)
    assert all(bounds.covers(Polygon(p["ring"])) for p in world["parcels"])
    from shapely.affinity import rotate, translate

    for b in world["buildings"]:
        w, d, _ = b["size"]
        footprint = translate(
            rotate(box(-w / 2, -d / 2, w / 2, d / 2), b["yaw_deg"]), b["center"][0], b["center"][1]
        )
        parcel = next(p for p in world["parcels"] if p["id"] == b["parcel_id"])
        assert Polygon(parcel["ring"]).buffer(-config["setback_m"] + 0.01).covers(footprint)
        assert b["review_status"] == "pending_manual_review"


def test_missing_evidence_never_passes_release(inputs):
    config, roads, parcels = inputs
    report = verify_world(build_world(*inputs), config, roads, parcels)
    assert report["status"] == "blocked"
    assert report["checks"]["road_import"]["status"] == "pass"
    assert report["checks"]["canopy"]["status"] == "blocked"


def test_verifier_detects_shifted_and_missing_roads(inputs):
    config, roads, parcels = inputs
    world = build_world(*inputs)
    shifted = copy.deepcopy(world)
    for point in shifted["roads"][0]["points"]:
        point[1] += 10
    assert (
        verify_world(shifted, config, roads, parcels)["checks"]["road_import"]["status"] == "fail"
    )
    world["roads"] = []
    assert verify_world(world, config, roads, parcels)["checks"]["road_import"]["status"] == "fail"


def test_canopy_requires_independent_reference_and_measures_placement(inputs):
    config, roads, parcels = inputs
    world = build_world(*inputs)
    from shapely.geometry import Point

    world["trees"] = [
        {
            "id": "t1",
            "position": [0, 0, 0],
            "crown_radius_m": 5,
            "height_m": 12,
            "species": "live_oak",
            "source": "lidar-A",
        }
    ]
    reference = {
        "source_id": "satellite-B",
        "crs": "local_m",
        "geometry": mapping(Point(0, 0).buffer(5)),
    }
    check = verify_world(world, config, roads, parcels, reference)["checks"]["canopy"]
    assert check["iou"] > 0.99
    reference["source_id"] = "lidar-A"
    assert (
        verify_world(world, config, roads, parcels, reference)["checks"]["canopy"]["status"]
        == "blocked"
    )


def test_bad_config_and_empty_data_are_rejected(inputs):
    config, roads, parcels = inputs
    with pytest.raises(ValueError):
        build_world(config, collection([]), parcels)
    config["crs"] = "EPSG:4326"
    with pytest.raises(ValueError, match="met"):
        build_world(config, roads, parcels)


def test_verifier_rejects_corrupted_building_and_bounds(inputs):
    config, roads, parcels = inputs
    world = build_world(*inputs)
    world["bounds_m"] = [0, 0, 1, 1]
    world["buildings"][0]["center"] = [100000, 100000, 0]
    report = verify_world(world, config, roads, parcels)
    assert report["status"] == "fail"
    assert report["checks"]["building_containment"]["status"] == "fail"
    assert report["checks"]["world_bounds"]["status"] == "fail"


def test_canopy_same_area_wrong_placement_fails(inputs):
    from shapely.geometry import Point

    config, roads, parcels = inputs
    world = build_world(*inputs)
    world["trees"] = [
        {"id": "t", "position": [40, 0, 0], "crown_radius_m": 5, "height_m": 12, "source": "lidar"}
    ]
    canopy = {
        "source_id": "satellite",
        "crs": "local_m",
        "geometry": mapping(Point(0, 0).buffer(5)),
    }
    result = verify_world(world, config, roads, parcels, canopy)["checks"]["canopy"]
    assert result["coverage_error_fraction"] == pytest.approx(0)
    assert result["status"] == "fail"
