"""Independent checks against input observations, never procedural completion flags."""

import math

from shapely.affinity import rotate, translate
from shapely.geometry import LineString, Point, Polygon, box, shape
from shapely.ops import unary_union

from .geo import LocalFrame, digest, source_features


def geometry_check(expected, actual, tolerance):
    missing, extra = (
        sorted(expected.keys() - actual.keys()),
        sorted(actual.keys() - expected.keys()),
    )
    shared = expected.keys() & actual.keys()
    distances = [expected[k].hausdorff_distance(actual[k]) for k in shared]
    maximum = max(distances) if distances else None
    passed = bool(expected) and not missing and not extra and maximum is not None
    passed = passed and math.isfinite(maximum) and maximum < tolerance
    return {
        "status": "pass" if passed else "fail",
        "max_deviation_m": maximum,
        "tolerance_m": tolerance,
        "missing_ids": missing,
        "extra_ids": extra,
        "reference_count": len(expected),
        "generated_count": len(actual),
        "scope": "import fidelity against source GIS, not independent survey accuracy",
    }


def verify_world(world, config, roads, parcels, canopy=None, terrain_raster=None):
    frame = LocalFrame(config["origin"], config["crs"])
    clip = frame.geometry(box(*config["bbox"]))
    ref_roads = {fid: line for fid, line, _ in source_features(roads, frame, clip, "LineString")}
    ref_parcels = {
        fid: polygon for fid, polygon, _ in source_features(parcels, frame, clip, "Polygon")
    }
    actual_roads = {r["id"]: LineString([p[:2] for p in r["points"]]) for r in world["roads"]}
    actual_parcels = {p["id"]: Polygon(p["ring"], p.get("holes", [])) for p in world["parcels"]}
    checks = {
        "road_import": geometry_check(ref_roads, actual_roads, 5),
        "parcel_import": geometry_check(ref_parcels, actual_parcels, 0.1),
    }
    bounds = world.get("bounds_m", [])
    checks["world_bounds"] = {
        "status": "pass"
        if len(bounds) == 4
        and all(math.isfinite(a) and abs(a - b) < 0.01 for a, b in zip(bounds, clip.bounds))
        else "fail"
    }
    bad_buildings, seen_buildings = [], set()
    for building in world["buildings"]:
        fid = building["id"]
        parcel = ref_parcels.get(building["parcel_id"])
        width, depth, height = building["size"]
        x, y, z = building["center"]
        yaw = building["yaw_deg"]
        valid = (
            fid not in seen_buildings
            and parcel is not None
            and all(math.isfinite(v) for v in (width, depth, height, x, y, z, yaw))
            and min(width, depth, height) > 0
        )
        seen_buildings.add(fid)
        if valid:
            footprint = translate(
                rotate(box(-width / 2, -depth / 2, width / 2, depth / 2), yaw), x, y
            )
            valid = parcel.buffer(-config["setback_m"] + 0.001).covers(footprint)
        if not valid:
            bad_buildings.append(fid)
    checks["building_containment"] = {
        "status": "fail" if bad_buildings else "pass",
        "invalid_building_ids": bad_buildings,
        "checked_count": len(world["buildings"]),
        "scope": "Footprints inside independently projected source parcel setbacks",
    }
    checks["coordinate_contract"] = {
        "status": "pass"
        if world["origin"] == config["origin"]
        and world["crs"] == config["crs"]
        and world["schema_version"] == 1
        else "fail"
    }
    duplicate_ids = len(actual_roads) != len(world["roads"]) or len(actual_parcels) != len(
        world["parcels"]
    )
    checks["unique_geometry_ids"] = {"status": "fail" if duplicate_ids else "pass"}
    checks["source_integrity"] = {
        "status": "pass"
        if world["provenance"].get("roads_sha256") == digest(roads)
        and world["provenance"].get("parcels_sha256") == digest(parcels)
        else "fail"
    }
    if terrain_raster is not None:
        from .terrain import verify_terrain

        checks["terrain_import"] = verify_terrain(world, terrain_raster)
    elif "terrain" in world:
        checks["terrain_import"] = {
            "status": "blocked",
            "reason": "Provide source DEM with --terrain",
        }
    sources = {t["source"] for t in world["trees"]}
    if not canopy or not canopy.get("source_id") or canopy["source_id"] in sources:
        checks["canopy"] = {"status": "blocked", "reason": "Independent canopy reference required"}
    else:
        if canopy.get("crs") != "local_m":
            raise ValueError("Canopy reference must use the manifest's local_m coordinate frame")
        reference = shape(canopy["geometry"]).intersection(clip)
        generated = unary_union(
            [Point(*t["position"][:2]).buffer(t["crown_radius_m"]) for t in world["trees"]]
        ).intersection(clip)
        union = reference.union(generated).area
        iou = reference.intersection(generated).area / union if union else None
        error = abs(reference.area - generated.area) / clip.area
        checks["canopy"] = {
            "status": "pass" if iou is not None and iou >= 0.75 and error <= 0.05 else "fail",
            "iou": iou,
            "coverage_error_fraction": error,
            "reference_coverage_fraction": reference.area / clip.area,
            "generated_coverage_fraction": generated.area / clip.area,
            "reference_source": canopy["source_id"],
            "threshold_note": "provisional IoU>=0.75 and coverage error<=0.05",
        }
    for gate, reason in {
        "road_survey_accuracy": "Independent survey/checkpoints not supplied",
        "neighborhood_boundary": "Bounding box is provisional; authoritative boundary required",
        "elevation": (
            "DEM imported; source age and independent vertical checkpoints require review"
            if "terrain" in world
            else "LiDAR terrain surface not acquired"
        ),
        "lane_topology": "Lane count/width/median/signal observations required",
        "residence_similarity": "All generated homes require manual facade review",
        "visual_fidelity": "Licensed foliage/material/audio kits and engine capture required",
        "gpu_performance": "Target GPU 4K frame-time trace required",
        "jev_live": "Authenticated live service benchmark required",
    }.items():
        checks[gate] = {"status": "blocked", "reason": reason}
    status = "fail" if any(c["status"] == "fail" for c in checks.values()) else "blocked"
    return {
        "schema_version": 1,
        "status": status,
        "world_sha256": digest(world),
        "counts": {k: len(world[k]) for k in ("roads", "parcels", "buildings", "trees")},
        "checks": checks,
        "limitations": world["limitations"],
    }


def markdown_report(report):
    lines = [
        "# River Oaks verification",
        "",
        f"Overall: **{report['status']}**",
        "",
        "This report does not certify photorealism, survey accuracy, or real-time performance.",
        "",
        "| Check | Status | Evidence |",
        "| --- | --- | --- |",
    ]
    for name, check in report["checks"].items():
        evidence = check.get("reason", check.get("scope", "Measured from generated manifest"))
        if "max_deviation_m" in check:
            evidence += f"; max deviation {check['max_deviation_m']} m"
        lines.append(f"| {name} | {check['status']} | {evidence} |")
    return "\n".join(lines) + "\n"
