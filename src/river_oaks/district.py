"""Export the bundled shopping district to the native blockout's flat ground plane."""

from copy import deepcopy
from math import isfinite


def district_manifest(source):
    bounds = source.get("bounds_m", [])
    if (
        source.get("scene") != "district"
        or len(bounds) != 4
        or not all(isfinite(value) for value in bounds)
        or not 2 < bounds[2] - bounds[0] < 500
        or not 2 < bounds[3] - bounds[1] < 500
    ):
        raise ValueError("Expected the compact shopping district manifest")
    result = deepcopy(source)
    # Native blockout has a flat ground plane; retain geographic x/y, not NAVD88 z.
    result.pop("terrain", None)
    for road in result["roads"]:
        for point in road["points"]:
            point[2] = 0
    for building in result["buildings"]:
        building["center"][2] = 0
        building["style"] = building["kind"]
    for tree in result["trees"]:
        tree["position"][2] = 0
        # Native sphere crown clips retail corner 625333008; measured pilot leaves
        # 4.36 cm clearance at 3.29 m. Keep trunk, location and browser data intact.
        if tree["id"] == "osm-node-5904555939":
            tree["crown_radius_m"] = min(tree["crown_radius_m"], 3.29)
    for key in ("walkSpawn", "walkLookAt"):
        result[key][2] = 0
    for store in result["stores"]:
        for key in ("visit", "facade"):
            store[key][2] = 0
    for location in result.get("communityLocations", []):
        location["position"][2] = 0
    result["vertical_reference"] = "Flat native blockout ground, not surveyed elevation"
    return result
