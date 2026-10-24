"""Bounded, additive EPT acquisition; incomplete hierarchies fail closed."""

import hashlib
import json
import math
import re

import httpx
import numpy as np
from shapely import contains_xy
from shapely.geometry import Polygon


def extract_vegetation(points, bounds, *, voxel_size=0.65, ground_radius=12):
    """Class 4/5 returns normalized to nearby class-2 ground from the same survey.

    Output voxels are centroids of observed returns, not invented tree stems.
    Z is height above the nearest supported ground-cell mean, not an asserted datum.
    """
    points = np.asarray(points, dtype=float)
    if points.ndim != 2 or points.shape[1] != 5 or not np.isfinite(points).all():
        raise ValueError("LiDAR points must be finite [east, north, z, class, excluded] rows")
    if not 0.25 <= voxel_size <= 2 or not 1 <= ground_radius <= 20:
        raise ValueError("Invalid vegetation sampling budget")
    ground = points[(points[:, 3] == 2) & (points[:, 4] == 0), :3]
    if not len(ground):
        raise ValueError("Observed class-2 ground is required")
    vegetation = points[
        np.isin(points[:, 3], [4, 5])
        & (points[:, 4] == 0)
        & (points[:, 0] >= bounds[0])
        & (points[:, 0] <= bounds[2])
        & (points[:, 1] >= bounds[1])
        & (points[:, 1] <= bounds[3]),
        :3,
    ]
    # Mean ground in 2 m cells reduces pulse noise. No distant extrapolation.
    origin = np.floor(points[:, :2].min(axis=0) / 2)
    ground_cells = np.floor(ground[:, :2] / 2).astype(int) - origin.astype(int)
    unique, inverse = np.unique(ground_cells, axis=0, return_inverse=True)
    counts = np.bincount(inverse)
    centers = np.column_stack(
        [np.bincount(inverse, weights=ground[:, i]) / counts for i in range(3)]
    )
    dimensions = (np.floor(points[:, :2].max(axis=0) / 2) - origin + 1).astype(int)
    if np.prod(dimensions) > 1_000_000:
        raise ValueError("Ground lookup exceeds district grid budget")
    lookup = np.full((dimensions[1], dimensions[0]), -1, dtype=int)
    lookup[unique[:, 1], unique[:, 0]] = np.arange(len(unique))
    cells = np.floor(vegetation[:, :2] / 2).astype(int) - origin.astype(int)
    distance = np.full(len(vegetation), ground_radius**2, dtype=float)
    ground_z = np.full(len(vegetation), np.nan)
    reach = math.ceil(ground_radius / 2) + 1
    for dx in range(-reach, reach + 1):
        for dy in range(-reach, reach + 1):
            x, y = cells[:, 0] + dx, cells[:, 1] + dy
            valid = (x >= 0) & (y >= 0) & (x < dimensions[0]) & (y < dimensions[1])
            indices = np.flatnonzero(valid)
            references = lookup[y[valid], x[valid]]
            indices, references = indices[references >= 0], references[references >= 0]
            distances = np.sum((vegetation[indices, :2] - centers[references, :2]) ** 2, axis=1)
            closer = distances < distance[indices]
            distance[indices[closer]] = distances[closer]
            ground_z[indices[closer]] = centers[references[closer], 2]
    heights = vegetation[:, 2] - ground_z
    supported = np.isfinite(ground_z)
    retained = supported & (heights >= 2.5) & (heights <= 45)
    values = np.column_stack([vegetation[retained, :2], heights[retained]])
    if len(values):
        _, voxel_ids = np.unique(
            np.floor(values / voxel_size).astype(int), axis=0, return_inverse=True
        )
        density = np.bincount(voxel_ids)
        voxels = np.column_stack(
            [np.bincount(voxel_ids, weights=values[:, i]) / density for i in range(3)] + [density]
        )
        footprint = np.unique(np.floor(values[:, :2]).astype(int), axis=0).tolist()
    else:
        voxels, footprint = np.empty((0, 4)), []
    return {
        "voxels": np.round(voxels, 3).tolist(),
        "voxel_size_m": voxel_size,
        "voxel_fields": ["east_m", "north_m", "height_above_ground_m", "source_return_count"],
        "footprint_cells_m": footprint,
        "retained_classes": [4, 5],
        "classified_returns": len(vegetation),
        "supported_returns": int(retained.sum()),
        "unsupported_ground_returns": int((~supported).sum()),
        "height_rejected_returns": int((supported & ~retained).sum()),
        "max_ground_support_distance_m": float(np.sqrt(distance[retained].max()))
        if retained.any()
        else None,
        "ground_method": "Nearest mean of observed class-2 returns in a 2 m cell, within 12 m",
        "source_ground_z_range_m": [
            float(ground_z[retained].min()),
            float(ground_z[retained].max()),
        ]
        if retained.any()
        else None,
    }


def measure_building_heights(
    points, buildings, *, inset=1.5, ground_band=(2, 12), percentile=95, min_returns=20
):
    """Roof height above same-survey ground for each footprint ring.

    Roof: class-6 returns inside the footprint shrunk by `inset` m, so wall and eave
    returns along the outline are excluded. Ground: median class-2 returns in a band
    outside the footprint. A high percentile, not the maximum, so a stray return
    cannot set the roof. Z is relative to that ground, not an asserted datum.
    """
    points = np.asarray(points, dtype=float)
    if points.ndim != 2 or points.shape[1] != 5 or not np.isfinite(points).all():
        raise ValueError("LiDAR points must be finite [east, north, z, class, excluded] rows")
    kept = points[points[:, 4] == 0]
    roof_points, ground_points = kept[kept[:, 3] == 6], kept[kept[:, 3] == 2]
    rows = []
    for building in buildings:
        ring = building["ring"]
        if len({tuple(point) for point in ring}) < 3:
            raise ValueError(f"Building {building['id']} ring needs three distinct points")
        footprint = Polygon(ring)
        roof = roof_points[
            contains_xy(footprint.buffer(-inset), roof_points[:, 0], roof_points[:, 1])
        ]
        band = footprint.buffer(ground_band[1]).difference(footprint.buffer(ground_band[0]))
        ground = ground_points[contains_xy(band, ground_points[:, 0], ground_points[:, 1])]
        row = {
            "id": building["id"],
            "footprint_m2": round(footprint.area, 1),
            "roof_returns": len(roof),
            "ground_returns": len(ground),
        }
        if len(roof) < min_returns or len(ground) < min_returns:
            kind = "roof" if len(roof) < min_returns else "ground"
            rows.append(
                row
                | {
                    "height_m": None,
                    "unmeasured_reason": f"fewer than {min_returns} {kind} returns",
                }
            )
            continue
        ground_z = float(np.median(ground[:, 2]))
        heights = roof[:, 2] - ground_z
        rows.append(
            row
            | {
                "ground_z_m": round(ground_z, 2),
                "height_m": round(float(np.percentile(heights, percentile)), 2),
                "median_m": round(float(np.median(heights)), 2),
                "returns_per_m2": round(len(roof) / footprint.area, 2),
            }
        )
    return rows


def audit_heights(buildings, measured, *, tolerance_m=3.0):
    """Compare authored heights with measured ones without changing either.

    A height whose source starts with "authored" is a documented design override:
    reported, never failed. Any other gap above the tolerance fails; a building that
    could not be measured blocks the audit rather than passing it.
    """
    by_id = {row["id"]: row for row in measured}
    rows = []
    for building in buildings:
        if building["id"] not in by_id:
            raise ValueError(f"Measurement missing for building {building['id']}")
        height, source = by_id[building["id"]]["height_m"], building.get("height_source") or ""
        authored = building["size"][2]
        row = {
            "id": building["id"],
            "authored_m": authored,
            "measured_m": height,
            "height_source": source,
        }
        if height is None:
            rows.append(row | {"status": "unmeasured"})
            continue
        gap = round(authored - height, 2)
        status = (
            "authored-override"
            if source.startswith("authored")
            else "within-tolerance"
            if abs(gap) <= tolerance_m
            else "exceeds-tolerance"
        )
        rows.append(row | {"authored_minus_measured_m": gap, "status": status})
    statuses = {row["status"] for row in rows}
    return {
        "status": "failed"
        if "exceeds-tolerance" in statuses
        else "blocked"
        if "unmeasured" in statuses
        else "passed",
        "tolerance_m": tolerance_m,
        "buildings": rows,
    }


def node_bounds(bounds, key):
    if not re.fullmatch(r"\d+-\d+-\d+-\d+", key):
        raise ValueError("Invalid EPT node key")
    depth, *indices = map(int, key.split("-"))
    if depth > 24 or any(index >= 2**depth for index in indices):
        raise ValueError("Invalid EPT node index")
    sizes = [(bounds[i + 3] - bounds[i]) / 2**depth for i in range(3)]
    low = [bounds[i] + indices[i] * sizes[i] for i in range(3)]
    return low + [low[i] + sizes[i] for i in range(3)]


def intersects(left, right):
    return all(left[i] <= right[i + 3] and left[i + 3] >= right[i] for i in range(3))


class EPTSubset:
    def __init__(self, url, directory, *, client=None):
        self.url, self.directory = url.rstrip("/"), directory
        self.client = client or httpx.Client(timeout=45)
        self.receipts = {}
        self.total_bytes = 0
        self.meta = json.loads(self.fetch("ept.json"))
        if self.meta.get("dataType") != "laszip" or self.meta.get("hierarchyType") != "json":
            raise ValueError("Expected laszip data with JSON EPT hierarchy")
        bounds = self.meta.get("bounds", [])
        if (
            len(bounds) != 6
            or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in bounds)
            or any(bounds[i] >= bounds[i + 3] for i in range(3))
        ):
            raise ValueError("Invalid EPT bounds")
        if self.meta.get("srs", {}).get("horizontal") != "3857":
            raise ValueError("This acquisition requires the published EPSG:3857 EPT")

    def fetch(self, relative):
        if not re.fullmatch(
            r"ept\.json|ept-(?:data|hierarchy)/\d+-\d+-\d+-\d+\.(?:laz|json)", relative
        ):
            raise ValueError("Invalid EPT resource path")
        path = self.directory / relative
        limit = 8 * 1024 * 1024
        if path.exists():
            if path.stat().st_size > limit:
                raise ValueError("EPT file exceeds byte budget")
            content = path.read_bytes()
        else:
            data = bytearray()
            with self.client.stream("GET", f"{self.url}/{relative}") as reply:
                reply.raise_for_status()
                for chunk in reply.iter_bytes():
                    data.extend(chunk)
                    if len(data) > limit or self.total_bytes + len(data) > 128 * 1024 * 1024:
                        raise ValueError("EPT download exceeds byte budget")
            content = bytes(data)
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(path.suffix + ".part")
            temporary.write_bytes(content)
            temporary.replace(path)
        if relative not in self.receipts:
            self.total_bytes += len(content)
            if self.total_bytes > 128 * 1024 * 1024:
                raise ValueError("EPT subset exceeds byte budget")
            self.receipts[relative] = {
                "url": f"{self.url}/{relative}",
                "bytes": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
            }
        return content

    def select(self, aoi):
        if (
            len(aoi) != 6
            or not all(math.isfinite(value) for value in aoi)
            or any(aoi[i] >= aoi[i + 3] for i in range(3))
            or not intersects(aoi, self.meta["bounds"])
        ):
            raise ValueError("Invalid or non-overlapping LiDAR extent")
        pending, visited, selected = ["0-0-0-0"], set(), {}
        while pending:
            key = pending.pop()
            if key in visited:
                raise ValueError("Cyclic or repeated EPT hierarchy")
            visited.add(key)
            if len(visited) > 64:
                raise ValueError("EPT hierarchy budget exceeded")
            hierarchy = json.loads(self.fetch(f"ept-hierarchy/{key}.json"))
            if (
                not isinstance(hierarchy, dict)
                or type(hierarchy.get(key)) is not int
                or hierarchy[key] < 1
            ):
                raise ValueError("Incomplete EPT subtree root")
            for name, count in hierarchy.items():
                bounds = node_bounds(self.meta["bounds"], name)
                if type(count) is not int or count == 0 or count < -1:
                    raise ValueError("Invalid EPT point count")
                if not intersects(bounds, aoi):
                    continue
                if count == -1:
                    pending.append(name)
                elif name in selected:
                    raise ValueError("Repeated EPT data node")
                else:
                    selected[name] = count
                if len(selected) > 256 or sum(selected.values()) > 5_000_000:
                    raise ValueError("EPT tile or point budget exceeded")
        return dict(sorted(selected.items(), key=lambda item: tuple(map(int, item[0].split("-")))))
