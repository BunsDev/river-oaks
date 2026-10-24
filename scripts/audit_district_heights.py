"""Audit District building heights against the 3DEP LiDAR subset; changes no world data.

Run `scripts/fetch_district_lidar.py` first. Exit 0 passed, 1 failed (an undocumented
height gap above tolerance), 2 blocked (no LiDAR subset, or a building unmeasured).
"""

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from river_oaks.lidar import audit_heights, measure_building_heights

ROOT = Path(__file__).resolve().parents[1]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--district", type=Path, default=ROOT / "preview/public/data/district.json")
    parser.add_argument("--lidar", type=Path, default=ROOT / "data/raw/lidar-district")
    parser.add_argument("--tolerance", type=float, default=3.0)
    parser.add_argument("--out", type=Path, default=ROOT / "data/reports/district-heights.json")
    args = parser.parse_args()
    points_path, receipt_path = args.lidar / "points.npz", args.lidar / "receipt.json"
    if not points_path.exists() or not receipt_path.exists():
        print(f"blocked: no LiDAR subset at {args.lidar}; run scripts/fetch_district_lidar.py")
        return 2
    world = json.loads(args.district.read_text())
    receipt = json.loads(receipt_path.read_text())
    if receipt["points_sha256"] != sha256(points_path):
        print("blocked: points.npz does not match its acquisition receipt")
        return 2
    if receipt["crs"] != world["crs"] or receipt["origin"] != world["origin"]:
        print("blocked: LiDAR subset and district use different frames")
        return 2
    measured = measure_building_heights(np.load(points_path)["points"], world["buildings"])
    audit = audit_heights(world["buildings"], measured, tolerance_m=args.tolerance)
    report = {
        "generated_by": "scripts/audit_district_heights.py",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "Roof height above same-survey ground; does not change district.json. "
        "The 2018 flight predates any later construction.",
        "district_sha256": sha256(args.district),
        "lidar_source_id": receipt["source_id"],
        "lidar_acquisition_window": receipt["acquisition_window"],
        "lidar_points_sha256": receipt["points_sha256"],
        "method": "95th percentile of class-6 returns inside the footprint inset 1.5 m, "
        "above the median class-2 return 2-12 m outside it",
        **audit,
        "measurements": measured,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    for row in audit["buildings"]:
        print(f"{row['id']}: {row['status']} {row['authored_m']} m vs {row['measured_m']} m")
    print(f"{audit['status']}: {args.out}")
    return {"passed": 0, "failed": 1, "blocked": 2}[audit["status"]]


if __name__ == "__main__":
    sys.exit(main())
