"""Metric world generation. Source geometry and invented architecture remain distinct."""

import hashlib
import json
import math
import random

from pyproj import CRS, Transformer
from shapely.affinity import rotate, translate
from shapely.geometry import box, shape
from shapely.ops import transform


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


class LocalFrame:
    def __init__(self, origin, crs):
        system = CRS(crs)
        if not system.is_projected or any(a.unit_name != "metre" for a in system.axis_info):
            raise ValueError("World CRS must be projected in meters")
        self.forward = Transformer.from_crs(4326, system, always_xy=True)
        self.inverse = Transformer.from_crs(system, 4326, always_xy=True)
        self.east, self.north = self.forward.transform(*origin)

    def to_local(self, lon, lat, z=None):
        x, y = self.forward.transform(lon, lat)
        return x - self.east, y - self.north

    def to_wgs84(self, x, y):
        return self.inverse.transform(x + self.east, y + self.north)

    def geometry(self, geometry):
        return transform(self.to_local, geometry)


def parts(geometry, kind):
    if geometry.is_empty:
        return []
    if geometry.geom_type == kind:
        return [geometry]
    return [p for g in getattr(geometry, "geoms", []) for p in parts(g, kind)]


def source_features(collection, frame, clip, kind):
    seen = set()
    for item in collection["features"]:
        fid = str(item.get("id", item.get("properties", {}).get("OBJECTID", "")))
        if not fid or fid in seen:
            raise ValueError("Source features need unique stable IDs")
        seen.add(fid)
        original = shape(item["geometry"])
        if not original.is_valid:
            raise ValueError(f"Invalid source geometry: {fid}")
        geometry = frame.geometry(original).intersection(clip)
        for index, part in enumerate(parts(geometry, kind)):
            yield f"{fid}:{index}", part, item.get("properties", {})


def building_for(parcel_id, polygon, setback, seed):
    interior = polygon.buffer(-setback)
    if interior.is_empty:
        return None
    if interior.geom_type == "MultiPolygon":
        interior = max(interior.geoms, key=lambda p: p.area)
    if interior.area < 80:
        return None
    rng = random.Random(f"{seed}:{parcel_id}")
    center = interior.representative_point()
    coords = list(interior.minimum_rotated_rectangle.exterior.coords)
    dx, dy = coords[1][0] - coords[0][0], coords[1][1] - coords[0][1]
    yaw = math.degrees(math.atan2(dy, dx))
    width = min(28, math.sqrt(interior.area) * rng.uniform(0.42, 0.56))
    depth = width * rng.uniform(0.75, 1.15)
    # Shrink to fit the actual inset polygon, including holes and concavities.
    for _ in range(30):
        footprint = translate(
            rotate(box(-width / 2, -depth / 2, width / 2, depth / 2), yaw), center.x, center.y
        )
        if interior.covers(footprint):
            break
        width *= 0.9
        depth *= 0.9
    else:
        return None
    if min(width, depth) < 5:
        return None
    return {
        "id": f"house-{parcel_id}",
        "parcel_id": parcel_id,
        "center": [center.x, center.y, 0],
        "size": [width, depth, rng.uniform(7, 11)],
        "yaw_deg": yaw,
        "style": rng.choice(
            ["tudor_revival", "georgian_colonial", "french_eclectic", "modern_estate"]
        ),
        "review_status": "pending_manual_review",
        "generation": "synthetic_massing",
    }


def build_world(config, roads, parcels, trees=None):
    frame = LocalFrame(config["origin"], config["crs"])
    west, south, east, north = config["bbox"]
    if not (-180 < west < east < 180 and -90 < south < north < 90):
        raise ValueError("Invalid WGS84 bounding box")
    clip = frame.geometry(box(west, south, east, north))
    output = {
        "schema_version": 1,
        "origin": config["origin"],
        "crs": config["crs"],
        "bounds_m": list(clip.bounds),
        "roads": [],
        "parcels": [],
        "buildings": [],
        "trees": [],
        "provenance": {"roads_sha256": digest(roads), "parcels_sha256": digest(parcels)},
        "limitations": [
            "Flat terrain: elevation not acquired",
            "Road widths provisional; lane counts, medians and signals unverified",
            "Synthetic building massing; styles not surveyed or photo-matched",
            "Privacy similarity review pending; no reference facade corpus",
            config.get("boundary_status", "Provisional bounding box"),
        ],
    }
    for fid, line, props in source_features(roads, frame, clip, "LineString"):
        name = (
            props.get("ST_NAME")
            or " ".join(str(props.get(k) or "") for k in ("NAME", "ST_TYPE")).strip()
        )
        output["roads"].append(
            {
                "id": fid,
                "name": name,
                "points": [[x, y, 0] for x, y in line.coords],
                "width_m": 8.0,
                "lanes": None,
                "width_source": "provisional_blockout",
            }
        )
    for fid, polygon, props in source_features(parcels, frame, clip, "Polygon"):
        output["parcels"].append(
            {
                "id": fid,
                "ring": list(map(list, polygon.exterior.coords)),
                "holes": [list(map(list, r.coords)) for r in polygon.interiors],
            }
        )
        # HCAD A1 = single-family residential. Unknown land uses remain vacant blockout.
        if props.get("state_class") == "A1":
            building = building_for(fid, polygon, config["setback_m"], config["seed"])
            if building:
                output["buildings"].append(building)
    if not output["roads"] or not output["parcels"]:
        raise ValueError("No road or parcel geometry within configured bounds")
    if trees:
        source_id = trees.get("source_id")
        if not source_id:
            raise ValueError("Observed trees require source_id provenance")
        output["provenance"]["trees_sha256"] = digest(trees)
        for fid, point, props in source_features(trees, frame, clip, "Point"):
            radius, height = float(props["crown_radius_m"]), float(props["height_m"])
            if not all(math.isfinite(n) and n > 0 for n in (radius, height)):
                raise ValueError("Invalid observed crown radius or height")
            output["trees"].append(
                {
                    "id": fid,
                    "position": [point.x, point.y, 0],
                    "crown_radius_m": radius,
                    "height_m": height,
                    "species": props.get("species", "unknown"),
                    "source": source_id,
                }
            )
    else:
        output["limitations"].append("No observed canopy supplied; no trees fabricated")
    return output
