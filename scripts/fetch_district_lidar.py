"""Download the complete EPT subset intersecting the district and a 20 m margin."""

import hashlib
import io
import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
import laspy
import numpy as np
from pyproj import Transformer

from river_oaks.geo import LocalFrame, digest
from river_oaks.lidar import EPTSubset

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "data/raw/lidar-district"
SOURCE = "https://usgs-lidar-public.s3.amazonaws.com/TX_Coastal_B1_2018"


def main():
    world = json.loads((ROOT / "preview/public/data/district.json").read_text())
    frame = LocalFrame(world["origin"], world["crs"])
    to_ept = Transformer.from_crs(world["crs"], 3857, always_xy=True)
    to_world = Transformer.from_crs(3857, world["crs"], always_xy=True)
    west, south, east, north = world["bounds_m"]
    x0, y0, x1, y1 = to_ept.transform_bounds(
        west + frame.east - 20,
        south + frame.north - 20,
        east + frame.east + 20,
        north + frame.north + 20,
    )
    # Include the entire vertical hierarchy, including sparse outlier nodes.
    with httpx.Client(timeout=45) as client:
        source = EPTSubset(SOURCE, DIRECTORY, client=client)
        aoi = [x0, y0, source.meta["bounds"][2], x1, y1, source.meta["bounds"][5]]
        selected = source.select(aoi)
        points = []
        for index, (key, count) in enumerate(selected.items()):
            data = source.fetch(f"ept-data/{key}.laz")
            cloud = laspy.read(io.BytesIO(data))
            if len(cloud) != count:
                raise ValueError(f"EPT point count mismatch for {key}")
            xs, ys = np.asarray(cloud.x), np.asarray(cloud.y)
            mask = (xs >= x0) & (xs <= x1) & (ys >= y0) & (ys <= y1)
            eastings, northings = to_world.transform(xs[mask], ys[mask])
            points.append(
                np.column_stack(
                    [
                        eastings - frame.east,
                        northings - frame.north,
                        np.asarray(cloud.z)[mask],
                        np.asarray(cloud.classification)[mask],
                        np.asarray(cloud.withheld)[mask] | np.asarray(cloud.synthetic)[mask],
                    ]
                )
            )
            if index % 8 == 0 or index + 1 == len(selected):
                print(
                    f"LiDAR tile {index + 1}/{len(selected)}; {source.total_bytes / 1e6:.1f} MB",
                    flush=True,
                )
        values = np.concatenate(points)
        if not len(values) or not np.isfinite(values).all():
            raise ValueError("Empty or non-finite clipped LiDAR")
        # Exact projected AOI, rather than the transformed Mercator bounding rectangle.
        values = values[
            (values[:, 0] >= west - 20)
            & (values[:, 0] <= east + 20)
            & (values[:, 1] >= south - 20)
            & (values[:, 1] <= north + 20)
        ]
        np.savez_compressed(DIRECTORY / "points.npz", points=values)
        classes, counts = np.unique(values[:, 3].astype(int), return_counts=True)
        receipt = {
            "source_id": "usgs-ept-TX_Coastal_B1_2018",
            "source_url": SOURCE + "/ept.json",
            "source_label_year": 2018,
            "acquisition_window": ["2018-01-12", "2018-03-22"],
            "season": "leaf-off",
            "metadata_url": "https://www.fisheries.noaa.gov/inport/item/58236",
            "license": "USGS 3DEP public-domain point cloud",
            "license_url": "https://data.usgs.gov/datacatalog/data/USGS:b7e353d2-325f-4fc6-8d95-01254705638a",
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "source_srs": source.meta["srs"],
            "crs": world["crs"],
            "origin": world["origin"],
            "bounds_m": [west - 20, south - 20, east + 20, north + 20],
            "aoi_ept": aoi,
            "hierarchy_complete": True,
            "tile_point_counts": selected,
            "tile_points": sum(selected.values()),
            "clipped_points": len(values),
            "classification_counts": {str(k): int(v) for k, v in zip(classes, counts)},
            "files": source.receipts,
            "selection_sha256": digest(selected),
            "points_sha256": hashlib.sha256((DIRECTORY / "points.npz").read_bytes()).hexdigest(),
        }
        (DIRECTORY / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
        print(
            json.dumps(
                {k: receipt[k] for k in ["clipped_points", "classification_counts", "tile_points"]}
            )
        )


if __name__ == "__main__":
    main()
