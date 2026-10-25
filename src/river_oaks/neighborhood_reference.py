"""Prepare bounded, immutable geographic references for neighborhood authoring.

Works only on local exported data. No acquisition, publication or live-world writes.
"""

import argparse
import copy
import hashlib
import json
import math
import sys
from pathlib import Path

from shapely.affinity import rotate, translate
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

from .geo import parts

# Match the current shared street contract; changes are checked by Node integration.
SIDEWALK_M = 3.81
CURB_M = 0.1524
MAX_SOURCE_FEATURES = 10000


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def stable_id(prefix, source_id):
    return f"{prefix}-{digest(source_id)[:16]}"


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def pair(value):
    return isinstance(value, list) and len(value) == 2 and all(map(finite, value))


def polygon_record(geometry):
    return {
        "ring": [list(p[:2]) for p in geometry.exterior.coords],
        "holes": [[list(p[:2]) for p in hole.coords] for hole in geometry.interiors],
    }


def polygon(item, label):
    ring, holes = item.get("ring"), item.get("holes", [])
    if not isinstance(ring, list) or not isinstance(holes, list) or len(holes) > 16:
        raise ValueError(f"Invalid {label} polygon")
    if any(
        not isinstance(r, list)
        or not 4 <= len(r) <= 512
        or r[0] != r[-1]
        or not all(pair(p) for p in r)
        for r in [ring, *holes]
    ):
        raise ValueError(f"Invalid {label} polygon coordinates")
    result = Polygon(ring, holes)
    if not result.is_valid or result.is_empty or result.area <= 0:
        raise ValueError(f"Invalid {label} polygon geometry")
    return result


def features(world, name):
    values = world.get(name, [])
    if not isinstance(values, list) or len(values) > MAX_SOURCE_FEATURES:
        raise ValueError(f"Source {name} exceeds feature budget")
    ids = set()
    for value in values:
        if (
            not isinstance(value, dict)
            or not isinstance(value.get("id"), str)
            or not value["id"]
            or value["id"] in ids
        ):
            raise ValueError(f"Source {name} require unique string IDs")
        ids.add(value["id"])
    return sorted(values, key=lambda item: item["id"])


def terrain_grid(world, bounds):
    grid = world.get("terrain")
    if grid is None:
        return {"width": 17, "height": 17, "heights_m": [0] * 289}
    width, height = grid.get("width"), grid.get("height")
    origin, spacing, heights = (
        grid.get("grid_origin_m"),
        grid.get("spacing_m"),
        grid.get("heights_m"),
    )
    if (
        not isinstance(width, int)
        or not isinstance(height, int)
        or not 2 <= width <= 1025
        or not 2 <= height <= 1025
        or not pair(origin)
        or not pair(spacing)
        or min(spacing) <= 0
        or not isinstance(heights, list)
        or len(heights) != width * height
        or not all(finite(x) and -50 <= x <= 500 for x in heights)
    ):
        raise ValueError("Invalid source terrain grid")
    values = []
    for row in range(17):
        for column in range(17):
            x = (bounds[0] + column / 16 * (bounds[2] - bounds[0]) - origin[0]) / spacing[0]
            y = (bounds[1] + row / 16 * (bounds[3] - bounds[1]) - origin[1]) / spacing[1]
            if not (-1e-8 <= x <= width - 1 + 1e-8 and -1e-8 <= y <= height - 1 + 1e-8):
                raise ValueError(
                    "Source terrain lacks requested coverage; no extrapolation allowed"
                )
            x, y = min(width - 1, max(0, x)), min(height - 1, max(0, y))
            ix, iy = min(width - 2, int(x)), min(height - 2, int(y))
            tx, ty = x - ix, y - iy
            low = heights[iy * width + ix] * (1 - tx) + heights[iy * width + ix + 1] * tx
            high = (
                heights[(iy + 1) * width + ix] * (1 - tx) + heights[(iy + 1) * width + ix + 1] * tx
            )
            values.append(low * (1 - ty) + high * ty)
    return {"width": 17, "height": 17, "heights_m": values}


def rectangle_footprint(center, size, yaw):
    return translate(
        rotate(box(-size[0] / 2, -size[1] / 2, size[0] / 2, size[1] / 2), yaw), *center
    )


def fit_options(buildable, parcel, road, templates, coverage):
    if buildable.is_empty:
        return []
    reference_point = buildable.representative_point()
    segments = [LineString([a, b]) for a, b in zip(road.coords, list(road.coords)[1:]) if a != b]
    segment = min(segments, key=lambda line: (line.distance(reference_point), list(line.coords)))
    a, b = segment.coords
    yaw = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
    # A bounded deterministic search. No template deformation, jitter or random retries.
    w, s, e, n = buildable.bounds
    candidates = [reference_point, buildable.centroid]
    candidates.extend(
        Point(w + (e - w) * x / 12, s + (n - s) * y / 12) for x in range(13) for y in range(13)
    )
    options = []
    for template in templates:
        size = template["size"]
        if size[0] * size[1] > parcel.area * coverage:
            continue
        matches = []
        for point in candidates:
            shape = rectangle_footprint([point.x, point.y], size, yaw)
            if buildable.covers(shape):
                matches.append((shape.distance(road), point.x, point.y))
        if matches:
            _, x, y = min(matches)
            options.append(
                {
                    "templateId": template["id"],
                    "center": [x, y],
                    "size": copy.deepcopy(size),
                    "yaw_deg": yaw,
                }
            )
    return options


def compile_reference(world, recipe):
    """Crop metric references and precompute fixed-module choices without editing sources."""
    try:
        canonical(world)
        canonical(recipe)
    except (ValueError, TypeError) as error:
        raise ValueError("Reference and recipe must contain finite JSON values") from error
    if world.get("schema_version") != 1 or world.get("crs") != "EPSG:32615":
        raise ValueError("Reference requires existing world-v1 in EPSG:32615")
    if (
        not pair(world.get("origin"))
        or not -180 <= world["origin"][0] <= 180
        or not -90 <= world["origin"][1] <= 90
    ):
        raise ValueError("Reference requires a finite WGS84 origin")
    bounds = recipe.get("bounds_m")
    if (
        not isinstance(bounds, list)
        or len(bounds) != 4
        or not all(finite(x) and abs(x) <= 10000 for x in bounds)
        or not all(40 <= bounds[i + 2] - bounds[i] <= 512 for i in range(2))
    ):
        raise ValueError("Recipe bounds must span 40–512 local metres")
    source_bounds = world.get("bounds_m")
    if (
        not isinstance(source_bounds, list)
        or len(source_bounds) != 4
        or not all(map(finite, source_bounds))
        or not box(*source_bounds).covers(box(*bounds))
    ):
        raise ValueError("Reference does not cover recipe bounds")
    constraints, templates = recipe.get("constraints", {}), recipe.get("templates", [])
    if (
        not finite(constraints.get("setback_m"))
        or not 1 <= constraints["setback_m"] <= 15
        or not finite(constraints.get("max_coverage"))
        or not 0.1 <= constraints["max_coverage"] <= 0.8
        or not finite(constraints.get("max_height_m"))
        or not 5.5 <= constraints["max_height_m"] <= 50
        or not isinstance(templates, list)
        or not 1 <= len(templates) <= 32
    ):
        raise ValueError("Invalid reference fit controls")
    template_ids = set()
    for template in templates:
        size = template.get("size")
        if (
            not isinstance(template.get("id"), str)
            or template["id"] in template_ids
            or not isinstance(size, list)
            or len(size) != 3
            or not all(map(finite, size))
            or not all(4 <= x <= 80 for x in size[:2])
            or not 5.5 <= size[2] <= constraints["max_height_m"]
        ):
            raise ValueError("Invalid reference template")
        template_ids.add(template["id"])
    result = copy.deepcopy(recipe)
    result.pop("reference", None)
    result["streets"] = []
    result["templates"] = sorted(result["templates"], key=lambda x: x["id"])
    result["reserved"] = sorted(result.get("reserved", []), key=lambda x: x["id"])
    result["frame"] = {
        "crs": world["crs"],
        "origin": world["origin"],
        "source": "Geographic world reference; see source provenance in reference plan",
    }
    controls = {
        key: copy.deepcopy(result[key])
        for key in ["bounds_m", "constraints", "templates", "reserved"]
    }
    site = box(*bounds)
    diagnostics, roads, corridors = [], [], []
    for item in features(world, "roads"):
        points, width = item.get("points"), item.get("width_m")
        kind = "footway" if item.get("kind") in ["footway", "pedestrian", "path"] else "residential"
        if not finite(width) or not (2 <= width <= 8 if kind == "footway" else 6 <= width <= 16):
            raise ValueError(f"Unsupported road width: {item['id']}")
        if (
            not isinstance(points, list)
            or not 2 <= len(points) <= 4096
            or not all(
                isinstance(p, list) and len(p) in [2, 3] and all(map(finite, p)) for p in points
            )
        ):
            raise ValueError(f"Invalid source road points: {item['id']}")
        line = LineString([p[:2] for p in points])
        if not line.is_valid or line.length == 0:
            raise ValueError(f"Invalid source road geometry: {item['id']}")
        margin = width / 2 + (0 if kind == "footway" else SIDEWALK_M + CURB_M)
        # Match the independent JS validator: each segment has square caps,
        # including at bends. A whole-line mitre buffer cuts those corners away.
        corridors.extend(
            LineString([a, b]).buffer(margin, cap_style="square")
            for a, b in zip(line.coords, list(line.coords)[1:])
            if a != b
        )
        crop = box(
            bounds[0] + margin * math.sqrt(2) + 0.01,
            bounds[1] + margin * math.sqrt(2) + 0.01,
            bounds[2] - margin * math.sqrt(2) - 0.01,
            bounds[3] - margin * math.sqrt(2) - 0.01,
        )
        clipped = line.intersection(crop)
        if not clipped.is_empty and not clipped.equals(line):
            diagnostics.append(
                {
                    "severity": "info",
                    "code": "source-road-cropped",
                    "id": item["id"],
                    "message": (
                        "Cropped to keep the full road/sidewalk footprint inside the candidate; "
                        "retained centerline geometry is unchanged."
                    ),
                }
            )
        for index, part in enumerate(
            sorted(parts(clipped, "LineString"), key=lambda g: (g.bounds, g.wkt))
        ):
            if part.length < 0.1:
                continue
            if len(part.coords) > 128:
                raise ValueError(
                    f"Road {item['id']} exceeds Studio segment budget; select a smaller crop"
                )
            roads.append(
                {
                    "id": f"{stable_id('refroad', item['id'])}-{index}",
                    "name": (item.get("name") or item["id"])[:64],
                    "kind": kind,
                    "width_m": width,
                    "points": [list(p) for p in part.coords],
                    "source_id": item["id"],
                }
            )
    if not roads or len(roads) > 64 or sum(len(r["points"]) - 1 for r in roads) > 256:
        raise ValueError("Reference road coverage is empty or exceeds Studio budget")
    road_corridors = unary_union(corridors)
    protected = []
    for item in features(world, "buildings"):
        if "ring" in item:
            shape = polygon(item, "building")
        else:
            if (
                not isinstance(item.get("center"), list)
                or len(item["center"]) < 2
                or not pair(item["center"][:2])
                or not isinstance(item.get("size"), list)
                or len(item["size"]) != 3
                or not all(finite(x) and x > 0 for x in item["size"])
                or not finite(item.get("yaw_deg"))
            ):
                raise ValueError(f"Invalid source building: {item['id']}")
            shape = rectangle_footprint(item["center"][:2], item["size"], item["yaw_deg"])
        for index, part in enumerate(
            sorted(parts(shape.intersection(site), "Polygon"), key=lambda g: g.bounds)
        ):
            protected.append(
                {
                    "id": f"{stable_id('protected', item['id'])}-{index}",
                    "source_id": item["id"],
                    **polygon_record(part),
                }
            )
    if len(protected) > 128:
        raise ValueError("Protected footprint budget exceeded; reduce crop")
    reserved_shapes = [box(*item["bounds_m"]) for item in result["reserved"]]
    exclusions = unary_union(
        [
            road_corridors,
            *[Polygon(p["ring"], p["holes"]).buffer(constraints["setback_m"]) for p in protected],
            *reserved_shapes,
        ]
    )
    block_shapes = sorted(
        parts(site.difference(road_corridors), "Polygon"), key=lambda g: (g.bounds, g.wkt)
    )
    blocks = [
        {
            "id": stable_id("refblock", polygon_record(shape)),
            "bounds_m": list(shape.bounds),
            **polygon_record(shape),
            "parcelIds": [],
        }
        for shape in block_shapes
        if shape.area >= 36
    ]
    if len(blocks) > 64:
        raise ValueError("Reference block budget exceeded; reduce crop")
    parcels, slots = [], []
    for item in features(world, "parcels"):
        shape = polygon(item, "parcel")
        for index, part in enumerate(
            sorted(
                parts(shape.intersection(site.buffer(-1, join_style="mitre")), "Polygon"),
                key=lambda g: (g.bounds, g.wkt),
            )
        ):
            if part.area < 36:
                diagnostics.append(
                    {
                        "severity": "info",
                        "code": "source-parcel-too-small",
                        "id": item["id"],
                        "message": (
                            "Clipped parcel below 36 square metres; "
                            "retained source remains unchanged."
                        ),
                    }
                )
                continue
            parcel_id = f"{stable_id('refparcel', item['id'])}-{index}"
            record = {"id": parcel_id, "source_id": item["id"], **polygon_record(part)}
            if (
                not part.interiors
                and part.equals(box(*part.bounds))
                and part.bounds[2] - part.bounds[0] >= 6
                and part.bounds[3] - part.bounds[1] >= 6
            ):
                record["bounds_m"] = list(part.bounds)
            parcels.append(record)
            if len(parcels) > 32:
                raise ValueError("Reference parcel budget exceeded: 32; reduce crop")
            if not blocks:
                raise ValueError("Source road corridors leave no usable blocks")
            block = max(
                blocks,
                key=lambda b: (part.intersection(Polygon(b["ring"], b["holes"])).area, b["id"]),
            )
            block["parcelIds"].append(parcel_id)
            road = min(roads, key=lambda r: (LineString(r["points"]).distance(part), r["id"]))
            buildable = (
                part.buffer(-constraints["setback_m"])
                .difference(exclusions)
                .intersection(Polygon(block["ring"], block["holes"]))
            )
            options = fit_options(
                buildable,
                part,
                LineString(road["points"]),
                result["templates"],
                constraints["max_coverage"],
            )
            if options:
                slots.append(
                    {
                        "id": f"h-{parcel_id}",
                        "parcelId": parcel_id,
                        "blockId": block["id"],
                        "frontageRoadId": road["id"],
                        "options": options,
                    }
                )
            else:
                diagnostics.append(
                    {
                        "severity": "warning",
                        "code": "source-parcel-unbuildable",
                        "id": parcel_id,
                        "message": (
                            "Bounded search found no fixed-template fit in this parcel's assigned "
                            "block, road clearance and protected footprints. Review the templates "
                            "or reserve this parcel; "
                            "no geometry was deformed."
                        ),
                    }
                )
    if not parcels:
        raise ValueError("No source parcels in the requested crop")
    normalized_source = {
        **world,
        **{name: features(world, name) for name in ["roads", "parcels", "buildings", "trees"]},
    }
    result["reference"] = {
        "schema_version": 1,
        "source_sha256": digest(normalized_source),
        "source_provenance": copy.deepcopy(world.get("provenance", {})),
        "source_limitations": copy.deepcopy(world.get("limitations", [])),
        "frame": copy.deepcopy(result["frame"]),
        "controls": controls,
        "roads": sorted(roads, key=lambda x: x["id"]),
        "parcels": sorted(parcels, key=lambda x: x["id"]),
        "blocks": sorted(blocks, key=lambda x: x["id"]),
        "slots": sorted(slots, key=lambda x: x["id"]),
        "protected": sorted(protected, key=lambda x: x["id"]),
        "terrain": terrain_grid(world, bounds),
        "diagnostics": sorted(diagnostics, key=lambda x: (x["code"], x["id"])),
    }
    if world.get("terrain") is None:
        result["reference"]["diagnostics"].append(
            {
                "severity": "warning",
                "code": "reference-flat-terrain",
                "id": result["id"],
                "message": "No source terrain supplied; candidate uses explicit flat zero ground.",
            }
        )
    if len(result["reference"]["diagnostics"]) > 2048:
        raise ValueError("Reference diagnostics budget exceeded; select a smaller crop")
    if len(canonical(result).encode()) > 2 * 1024 * 1024:
        raise ValueError("Reference recipe exceeds 2 MiB; select a smaller crop")
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--world", required=True)
    parser.add_argument("--recipe", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    try:
        for path in [args.world, args.recipe]:
            if Path(path).stat().st_size > 64 * 1024 * 1024:
                raise ValueError("Input exceeds 64 MiB; select a bounded local export")
        result = compile_reference(
            json.loads(Path(args.world).read_text()), json.loads(Path(args.recipe).read_text())
        )
        with Path(args.out).open("x", encoding="utf-8") as output:
            output.write(canonical(result) + "\n")
        print(
            json.dumps(
                {
                    "out": args.out,
                    "source_sha256": result["reference"]["source_sha256"],
                    "slots": len(result["reference"]["slots"]),
                }
            )
        )
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"neighborhood-reference: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
