"""Build observed canopy voxels, interpreted branch supports, and an independent comparison."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from shapely.geometry import LineString, Point, Polygon, box, shape
from shapely.ops import unary_union

from river_oaks.geo import LocalFrame, digest
from river_oaks.lidar import extract_vegetation

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/lidar-district"


def branch_supports(world, voxels):
    """Original branch scaffolds guided by crowns; these are not a stem inventory."""
    values = np.asarray(voxels)
    occupied = unary_union(
        [Polygon(building["ring"]).buffer(0.6) for building in world["buildings"]]
    )
    lanes = unary_union(
        [
            LineString([point[:2] for point in road["points"]]).buffer(
                min(1.4, road["width_m"] / 4)
                if road["kind"] in {"footway", "pedestrian", "path", "steps"}
                else road["width_m"] / 2 + 0.65
            )
            for road in world["roads"]
        ]
    )
    grid, inverse, counts = np.unique(
        np.floor(values[:, :2] / 2), axis=0, return_inverse=True, return_counts=True
    )
    heights = np.bincount(inverse, weights=values[:, 2]) / counts
    candidates = [
        (float(x), float(y), "OSM mapped stem")
        for x, y, _ in [tree["position"] for tree in world["trees"]]
    ]
    candidates += [
        (float(grid[i, 0] * 2 + 1), float(grid[i, 1] * 2 + 1), "interpreted branch support")
        for i in np.argsort(-(counts * heights))
    ]
    supports = []
    west, south, east, north = world["bounds_m"]
    for x, y, basis in candidates:
        if not (west <= x <= east and south <= y <= north):
            continue
        if occupied.covers(Point(x, y)) or lanes.covers(Point(x, y)):
            continue
        if any(
            np.hypot(x - item["position"][0], y - item["position"][1])
            < max(4.5, item["radius_m"] * 1.6)
            for item in supports
        ):
            continue
        distance = np.hypot(values[:, 0] - x, values[:, 1] - y)
        nearby = values[distance < 3.8]
        if len(nearby) < 28 or np.quantile(nearby[:, 2], 0.9) < 4:
            continue
        height = float(np.quantile(nearby[:, 2], 0.9))
        radius = min(4.5, max(2.2, height * 0.3))
        crown = values[distance < radius]
        endpoints = []
        angles = np.arctan2(crown[:, 1] - y, crown[:, 0] - x)
        for sector in range(8):
            part = crown[
                (angles >= -np.pi + sector * np.pi / 4)
                & (angles < -np.pi + (sector + 1) * np.pi / 4)
            ]
            if len(part) > 2:
                endpoints.append(np.round(np.mean(part[:, :3], axis=0), 3).tolist())
        supports.append(
            {
                "position": [x, y],
                "height_m": round(height, 3),
                "radius_m": round(radius, 3),
                "basis": basis,
                "endpoints": endpoints,
            }
        )
        if len(supports) > 256:
            raise ValueError("Interpreted branch budget exceeded")
    return supports


def main():
    world = json.loads((ROOT / "preview/public/data/district.json").read_text())
    receipt = json.loads((RAW / "receipt.json").read_text())
    if (
        not receipt["hierarchy_complete"]
        or receipt["crs"] != world["crs"]
        or receipt["origin"] != world["origin"]
    ):
        raise ValueError("LiDAR acquisition does not match the world frame")
    if hashlib.sha256((RAW / "points.npz").read_bytes()).hexdigest() != receipt["points_sha256"]:
        raise ValueError("Clipped point cache hash mismatch")
    for name, file in receipt["files"].items():
        if hashlib.sha256((RAW / name).read_bytes()).hexdigest() != file["sha256"]:
            raise ValueError("Source LiDAR tile/metadata hash mismatch")
    points = np.load(RAW / "points.npz")["points"]
    extracted = extract_vegetation(points, world["bounds_m"])
    supports = branch_supports(world, extracted["voxels"])
    footprint = unary_union(
        [box(x, y, x + 1, y + 1) for x, y in extracted["footprint_cells_m"]]
    ).intersection(box(*world["bounds_m"]))
    canopy = {
        "schema_version": 1,
        "origin": world["origin"],
        "crs": world["crs"],
        "bounds_m": world["bounds_m"],
        "world_source_sha256": world["provenance"]["source_sha256"],
        "source": {
            k: receipt[k]
            for k in [
                "source_id",
                "source_url",
                "source_label_year",
                "season",
                "acquisition_window",
                "metadata_url",
                "license",
                "license_url",
                "points_sha256",
            ]
        },
        "voxels": extracted["voxels"],
        "voxel_fields": extracted["voxel_fields"],
        "voxel_size_m": extracted["voxel_size_m"],
        "supported_returns": extracted["supported_returns"],
        "footprint_area_m2": footprint.area,
        "branch_supports": supports,
        "limitations": [
            "2018 leaf-off observations, not a present-day inventory.",
            "Voxel centers and relative heights derive from class 4/5 returns; "
            "ground uses nearby class-2 returns.",
            "Leaf shapes, density between returns, branches and unmapped stems "
            "are interpretations. Species unknown.",
            "Render heights are ground-relative and placed on the scene DEM; "
            "EPT vertical datum is not independently asserted.",
            "Historical canopy comparison is recorded separately; "
            "current field accuracy is unverified.",
        ],
    }
    reference = json.loads((ROOT / "data/raw/canopy-reference.json").read_text())
    frame = LocalFrame(world["origin"], world["crs"])
    extent = reference["export_extent"]
    coverage = box(
        extent["xmin"] - frame.east,
        extent["ymin"] - frame.north,
        extent["xmax"] - frame.east,
        extent["ymax"] - frame.north,
    )
    if (
        reference["origin"] != world["origin"]
        or reference["projected_crs"] != world["crs"]
        or not coverage.covers(box(*world["bounds_m"]))
    ):
        raise ValueError("Independent canopy reference does not cover this frame")
    independent = shape(reference["geometry"]).intersection(box(*world["bounds_m"]))
    intersection = footprint.intersection(independent).area
    iou = intersection / footprint.union(independent).area
    coverage_error = abs(footprint.area - independent.area) / box(*world["bounds_m"]).area
    comparison_status = "pass" if iou >= 0.75 and coverage_error <= 0.05 else "fail"
    canopy["independent_comparison"] = {
        "status": comparison_status,
        "iou": iou,
        "coverage_fraction_error": coverage_error,
    }
    output = ROOT / "preview/public/data/district-vegetation.json"
    payload = (json.dumps(canopy, separators=(",", ":")) + "\n").encode()
    if len(payload) > 2 * 1024 * 1024 or len(canopy["voxels"]) > 40_000:
        raise ValueError("Canopy runtime data budget exceeded")
    report = {
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "status": comparison_status,
        "scope": "District canopy source/derivative evidence; not overall project acceptance",
        "runtime_sha256": hashlib.sha256(payload).hexdigest(),
        "runtime_bytes": len(payload),
        "source_integrity": {
            "status": "pass",
            "files": len(receipt["files"]),
            "tile_points": receipt["tile_points"],
            "clipped_points": receipt["clipped_points"],
            "selection_sha256": receipt["selection_sha256"],
            "classification_counts": receipt["classification_counts"],
        },
        "extraction": {
            k: v for k, v in extracted.items() if k not in ["voxels", "footprint_cells_m"]
        },
        "render_data": {
            "voxels": len(canopy["voxels"]),
            "interpreted_branch_supports": len(supports),
            "scope": "Centroids of observed returns; branch supports are not surveyed trees",
        },
        "independent_canopy": {
            "status": comparison_status,
            "iou": iou,
            "coverage_fraction_error": coverage_error,
            "lidar_footprint_m2": footprint.area,
            "reference_footprint_m2": independent.area,
            "intersection_m2": intersection,
            "source_id": reference["source_id"],
            "reference_export_sha256": reference["export_sha256"],
            "reference_pixel_size_m": reference["pixel_size_m"],
            "source_date": "2018 leaf-off",
            "reference_date": reference["date_note"],
            "limitation": "Large disagreement requires reference classification, site-change "
            "and sensor-season review; no accuracy pass inferred.",
        },
        "source_receipt_sha256": digest(receipt),
    }
    # Publish only after source and reference-frame validation are complete.
    output.write_bytes(payload)
    (ROOT / "data/reports/district-canopy.json").write_text(json.dumps(report, indent=2) + "\n")
    print(
        json.dumps(
            {
                "voxels": len(canopy["voxels"]),
                "supports": len(supports),
                "bytes": len(payload),
                "independent_iou": iou,
            }
        )
    )


if __name__ == "__main__":
    main()
