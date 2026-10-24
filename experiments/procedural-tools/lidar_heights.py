"""Evaluation only: measure District building heights from the existing 3DEP LiDAR subset.

Reads `data/raw/lidar-district/points.npz` (written by `scripts/fetch_district_lidar.py`)
and the bundled `district.json`, and compares each footprint's authored height with the
LiDAR roof height above local ground. Nothing here is imported by the project.

    uv run --locked python experiments/procedural-tools/lidar_heights.py --out report.json
"""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BUILDING, GROUND = 6, 2


def inside(ring, xs, ys):
    """Even-odd point-in-polygon test, vectorised over points."""
    result = np.zeros(len(xs), dtype=bool)
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        crosses = (y0 > ys) != (y1 > ys)
        with np.errstate(divide="ignore", invalid="ignore"):
            at = x0 + (ys - y0) * (x1 - x0) / (y1 - y0)
        result ^= crosses & (xs < at)
    return result


def shrink(ring, metres):
    """Pull vertices toward the centroid so edge points from walls and eaves are excluded."""
    points = np.asarray(ring[:-1] if ring[0] == ring[-1] else ring, dtype=float)
    centre = points.mean(axis=0)
    offset = points - centre
    length = np.linalg.norm(offset, axis=1, keepdims=True)
    return (centre + offset * np.maximum(0.0, 1 - metres / length)).tolist()


def grow(ring, metres):
    return shrink(ring, -metres)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--district", default=ROOT / "preview/public/data/district.json", type=Path)
    parser.add_argument("--points", default=ROOT / "data/raw/lidar-district/points.npz", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    world = json.loads(args.district.read_text())
    cloud = np.load(args.points)["points"]
    keep = cloud[:, 4] == 0  # drop withheld/synthetic points
    xs, ys, zs, cls = cloud[keep, 0], cloud[keep, 1], cloud[keep, 2], cloud[keep, 3].astype(int)
    rows = []
    for building in world["buildings"]:
        ring = [list(p) for p in building["ring"]]
        roof = inside(shrink(ring, 1.5), xs, ys) & (cls == BUILDING)
        band = inside(grow(ring, 12), xs, ys) & ~inside(grow(ring, 2), xs, ys) & (cls == GROUND)
        area = abs(
            sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1])) / 2
        )
        row = {
            "id": building["id"],
            "authored_height_m": building["size"][2],
            "height_source": building.get("height_source"),
            "footprint_m2": round(area, 1),
            "roof_points": int(roof.sum()),
            "ground_points": int(band.sum()),
        }
        if roof.sum() >= 20 and band.sum() >= 20:
            ground = float(np.median(zs[band]))
            heights = zs[roof] - ground
            p95 = float(np.percentile(heights, 95))
            row.update(
                ground_m=round(ground, 2),
                roof_p50_m=round(float(np.percentile(heights, 50)), 2),
                roof_p95_m=round(p95, 2),
                roof_max_m=round(float(heights.max()), 2),
                points_per_m2=round(float(roof.sum()) / area, 2),
                p95_minus_authored_m=round(p95 - building["size"][2], 2),
            )
        rows.append(row)
    report = {
        "generatedBy": "experiments/procedural-tools/lidar_heights.py",
        "district_sha256": hashlib.sha256(args.district.read_bytes()).hexdigest(),
        "points_sha256": hashlib.sha256(args.points.read_bytes()).hexdigest(),
        "method": "class 6 points inside the footprint shrunk 1.5 m; "
        "ground = median class 2 in a 2-12 m outside band",
        "buildings": rows,
    }
    text = json.dumps(report, indent=2) + "\n"
    if args.out:
        args.out.write_text(text)
    print(text)


if __name__ == "__main__":
    main()
