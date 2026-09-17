"""Observed DEM ingestion with explicit meter units, datum, nodata, and sampling evidence."""

import hashlib
import math
from pathlib import Path

import numpy as np
import rasterio

from .geo import LocalFrame


class TerrainRaster:
    def __init__(self, path):
        self.sha256 = hashlib.sha256(Path(path).read_bytes()).hexdigest()
        with rasterio.open(path) as dataset:
            if dataset.crs != rasterio.crs.CRS.from_epsg(32615):
                raise ValueError("Terrain must use EPSG:32615 projected meters")
            if dataset.count != 1 or dataset.dtypes[0] not in {"float32", "float64"}:
                raise ValueError("Terrain requires a single floating-point height band")
            if dataset.width < 2 or dataset.height < 2:
                raise ValueError("Terrain requires at least two rows and columns")
            self.values = dataset.read(1, masked=True).filled(np.nan).astype(np.float64)
            self.inverse = ~dataset.transform
            self.resolution_m = list(dataset.res)

    def sample(self, east, north):
        """Bilinear sample at pixel centers; never extrapolate or fill missing ground."""
        east, north = np.asarray(east), np.asarray(north)
        col = self.inverse.a * east + self.inverse.b * north + self.inverse.c
        row = self.inverse.d * east + self.inverse.e * north + self.inverse.f
        col, row = col - 0.5, row - 0.5
        height, width = self.values.shape
        if not (np.isfinite(col).all() and np.isfinite(row).all()) or np.any(
            (col < 0) | (row < 0) | (col > width - 1) | (row > height - 1)
        ):
            raise ValueError("Terrain sample outside observed raster coverage")
        x0 = np.minimum(np.floor(col).astype(int), width - 2)
        y0 = np.minimum(np.floor(row).astype(int), height - 2)
        fx, fy = col - x0, row - y0
        v00, v10 = self.values[y0, x0], self.values[y0, x0 + 1]
        v01, v11 = self.values[y0 + 1, x0], self.values[y0 + 1, x0 + 1]
        if not all(np.isfinite(v).all() for v in (v00, v10, v01, v11)):
            raise ValueError("Terrain sample touches nodata; missing ground cannot be invented")
        result = (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy
        return float(result) if np.ndim(result) == 0 else result


def grid_coordinates(world, width, height):
    frame = LocalFrame(world["origin"], world["crs"])
    x0, y0, x1, y1 = world["bounds_m"]
    xs = np.linspace(x0, x1, width)
    ys = np.linspace(y0, y1, height)
    east, north = np.meshgrid(xs + frame.east, ys + frame.north)
    return frame, east, north, [(x1 - x0) / (width - 1), (y1 - y0) / (height - 1)]


def apply_terrain(world, raster, source, grid_size=257):
    if not isinstance(grid_size, int) or not 2 <= grid_size <= 513:
        raise ValueError("Terrain grid_size must be between 2 and 513")
    if not source.get("source_id") or source.get("vertical_datum") != "NAVD88":
        raise ValueError("Terrain source ID and NAVD88 vertical datum are required")
    if source.get("sha256", raster.sha256) != raster.sha256:
        raise ValueError("Terrain source receipt does not match raster bytes")
    frame, east, north, spacing = grid_coordinates(world, grid_size, grid_size)
    heights = raster.sample(east, north)
    world["terrain"] = {
        "grid_origin_m": world["bounds_m"][:2],
        "spacing_m": spacing,
        "width": grid_size,
        "height": grid_size,
        "heights_m": heights.ravel().tolist(),
        "vertical_datum": "NAVD88",
        "source": {**source, "sha256": raster.sha256},
        "raster_resolution_m": raster.resolution_m,
        "sampling": "bilinear DEM; south-to-north rows, west-to-east columns",
    }
    world["provenance"]["terrain_sha256"] = raster.sha256
    for road in world["roads"]:
        original = road["points"]
        points = []
        for a, b in zip(original[:-1], original[1:]):
            steps = max(1, math.ceil(math.hypot(b[0] - a[0], b[1] - a[1]) / 20))
            points.extend(
                [
                    [a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps, 0]
                    for i in range(steps)
                ]
            )
        points.append(list(original[-1]))
        zs = raster.sample(
            np.array([p[0] for p in points]) + frame.east,
            np.array([p[1] for p in points]) + frame.north,
        )
        for point, z in zip(points, zs):
            point[2] = float(z)
        road["points"] = points
    for field, position in (("buildings", "center"), ("trees", "position")):
        for item in world[field]:
            x, y, _ = item[position]
            item[position][2] = raster.sample(x + frame.east, y + frame.north)
    world["limitations"] = [v for v in world["limitations"] if not v.startswith("Flat terrain:")]
    world["limitations"].append(
        "Observed DEM resampled to grid; source dating and vertical survey accuracy require review"
    )


def verify_terrain(world, raster):
    try:
        terrain = world["terrain"]
        width, height = terrain["width"], terrain["height"]
        if (
            not isinstance(width, int)
            or not isinstance(height, int)
            or not 2 <= width <= 513
            or not 2 <= height <= 513
        ):
            raise ValueError("Invalid terrain grid dimensions")
        frame, east, north, spacing = grid_coordinates(world, width, height)
        actual = np.asarray(terrain["heights_m"], dtype=float)
        if actual.size != width * height or not np.isfinite(actual).all():
            raise ValueError("Incomplete or non-finite terrain heights")
        contract_ok = (
            np.allclose(terrain["grid_origin_m"], world["bounds_m"][:2], atol=0.001, rtol=0)
            and np.allclose(terrain["spacing_m"], spacing, atol=0.001, rtol=0)
            and terrain["vertical_datum"] == "NAVD88"
            and terrain["source"]["sha256"] == raster.sha256
            and world["provenance"].get("terrain_sha256") == raster.sha256
        )
        errors = [float(np.max(np.abs(actual - raster.sample(east, north).ravel())))]
        positions = [p for r in world["roads"] for p in r["points"]]
        positions += [b["center"] for b in world["buildings"]]
        positions += [t["position"] for t in world["trees"]]
        if positions:
            values = np.asarray(positions, dtype=float)
            expected = raster.sample(values[:, 0] + frame.east, values[:, 1] + frame.north)
            errors.append(float(np.max(np.abs(values[:, 2] - expected))))
        maximum = max(errors)
        return {
            "status": "pass"
            if contract_ok and math.isfinite(maximum) and maximum < 0.01
            else "fail",
            "max_height_error_m": maximum,
            "grid_vertices": width * height,
            "feature_samples": len(positions),
            "source_sha256": raster.sha256,
            "vertical_datum": "NAVD88",
            "scope": "Import fidelity against observed DEM; not vertical survey accuracy",
        }
    except (KeyError, TypeError, ValueError) as exc:
        return {"status": "fail", "reason": str(exc)}
