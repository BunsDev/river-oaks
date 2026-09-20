import copy

import numpy as np
import pytest
import rasterio
from rasterio.transform import Affine

from river_oaks.geo import LocalFrame
from river_oaks.terrain import TerrainRaster, apply_terrain, verify_terrain


@pytest.fixture
def slope_raster(tmp_path):
    frame = LocalFrame([-95.425, 29.755], "EPSG:32615")
    path = tmp_path / "slope.tif"
    # Known plane: ground z = 20 + 0.1*x + 0.2*y in local meter coordinates.
    x = np.arange(-45, 55, 10)
    y = np.arange(45, -55, -10)
    heights = 20 + x[None, :] * 0.1 + y[:, None] * 0.2
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=10,
        width=10,
        count=1,
        dtype="float32",
        crs="EPSG:32615",
        nodata=-9999,
        transform=Affine(10, 0, frame.east - 50, 0, -10, frame.north + 50),
    ) as dest:
        dest.write(heights.astype("float32"), 1)
    return path, frame


def world_fixture():
    return {
        "origin": [-95.425, 29.755],
        "crs": "EPSG:32615",
        "bounds_m": [-30, -30, 30, 30],
        "roads": [{"id": "r1", "points": [[-20, 0, 0], [20, 0, 0]]}],
        "parcels": [],
        "buildings": [{"id": "b1", "center": [10, 10, 0]}],
        "trees": [{"id": "t1", "position": [-10, 10, 0]}],
        "provenance": {},
        "limitations": ["Flat terrain: elevation not acquired"],
    }


def test_observed_elevation_preserves_axis_direction_and_slopes(slope_raster):
    path, frame = slope_raster
    raster = TerrainRaster(path)
    assert raster.sample(frame.east + 10, frame.north + 20) == pytest.approx(25)
    world = world_fixture()
    apply_terrain(world, raster, {"source_id": "test-dem", "vertical_datum": "NAVD88"}, grid_size=7)
    assert world["roads"][0]["points"][0][2] == pytest.approx(18)
    assert world["buildings"][0]["center"][2] == pytest.approx(23)
    assert world["trees"][0]["position"][2] == pytest.approx(21)
    grid = world["terrain"]
    assert grid["heights_m"][0] == pytest.approx(11)  # southwest
    assert grid["heights_m"][-1] == pytest.approx(29)  # northeast
    assert grid["spacing_m"] == [10, 10]


def test_nodata_and_outside_requests_are_rejected(slope_raster):
    path, frame = slope_raster
    with rasterio.open(path, "r+") as dest:
        values = dest.read(1)
        values[5, 5] = -9999
        dest.write(values, 1)
    raster = TerrainRaster(path)
    with pytest.raises(ValueError, match="nodata"):
        raster.sample(frame.east + 5, frame.north - 5)
    with pytest.raises(ValueError, match="outside"):
        raster.sample(frame.east + 100, frame.north)


def test_height_verification_catches_mutation_in_grid_or_features(slope_raster):
    path, _ = slope_raster
    raster = TerrainRaster(path)
    world = world_fixture()
    apply_terrain(world, raster, {"source_id": "test-dem", "vertical_datum": "NAVD88"}, grid_size=7)
    assert verify_terrain(world, raster)["status"] == "pass"
    bad_grid = copy.deepcopy(world)
    bad_grid["terrain"]["heights_m"][6] += 5
    assert verify_terrain(bad_grid, raster)["status"] == "fail"
    world["roads"][0]["points"][1][2] += 5
    assert verify_terrain(world, raster)["status"] == "fail"


def test_geographic_or_multiband_raster_is_not_treated_as_metric_height(tmp_path):
    path = tmp_path / "bad.tif"
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=2,
        height=2,
        count=1,
        crs="EPSG:4326",
        dtype="float32",
        transform=Affine(0.1, 0, -95, 0, -0.1, 30),
    ) as dst:
        dst.write(np.zeros((2, 2), dtype="float32"), 1)
    with pytest.raises(ValueError, match="EPSG:32615"):
        TerrainRaster(path)
