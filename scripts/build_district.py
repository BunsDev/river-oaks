"""Build a bounded ODbL district scene from an OSM API extract, without private records."""

import hashlib
import json
import math
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import httpx
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import nearest_points

from river_oaks.geo import LocalFrame
from river_oaks.terrain import TerrainRaster

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/district-osm.xml"
OUTPUT = ROOT / "preview/public/data/district.json"
URL = "https://api.openstreetmap.org/api/0.6/map?bbox=-95.457,29.740,-95.451,29.745"
# Membership checked against the official directory on 2026-09-17. Coordinates
# remain OSM observations, not official tenant/door survey coordinates.
CURRENT = {
    "Toulouse",
    "Hopdoddy Burger Bar",
    "Bella Rinova",
    "Dior",
    "Vilebrequin",
    "Jo Malone",
    "IPIC Theaters",
    "Cartier",
    "Van Cleef & Arpels",
    "MAD",
    "Hermès",
    "Harry Winston",
    "Saint Bernard",
    "Equinox",
    "Le Colonial",
    "Laura Rathe Fine Art",
    "Oliver Peoples",
    "Moreau",
    "Brunello Cucinelli",
    "Diptypque",
    "VINCE.",
    "Alice + Olivia",
    "Zadig & Voltaire",
    "Kiton",
    "de Bouille",
    "Steak 48",
    "Baccarat",
    "Dolce & Gabbana",
    "Veronica Beard",
    "Amorino",
}
DISPLAY = {
    "Diptypque": "Diptyque",
    "de Bouille": "de Boulle",
    "VINCE.": "Vince",
    "Jo Malone": "Jo Malone London",
    "MAD": "MAD Houston",
}


def build():
    if not RAW.exists():
        response = httpx.get(
            URL, headers={"User-Agent": "RiverOaks-local-development/0.1"}, timeout=40
        )
        response.raise_for_status()
        if len(response.content) > 4 * 1024 * 1024:
            raise ValueError("District source exceeds bounded download budget")
        RAW.parent.mkdir(parents=True, exist_ok=True)
        RAW.write_bytes(response.content)
    root = ET.fromstring(RAW.read_bytes())
    nodes = {node.get("id"): node for node in root.findall("node")}
    frame = LocalFrame([-95.425, 29.755], "EPSG:32615")
    terrain = TerrainRaster(ROOT / "data/raw/terrain.tif")

    def elevation(x, y):
        return terrain.sample(frame.east + x, frame.north + y)

    elements = []
    for element in root:
        if element.tag not in {"node", "way"}:
            continue
        tags = {tag.get("k"): tag.get("v") for tag in element.findall("tag")}
        if not tags:
            continue
        points = []
        if element.tag == "way":
            refs = [item.get("ref") for item in element.findall("nd")]
            if any(ref not in nodes for ref in refs):
                continue
            for ref in refs:
                node = nodes[ref]
                points.append(frame.to_local(float(node.get("lon")), float(node.get("lat"))))
        else:
            points = [frame.to_local(float(element.get("lon")), float(element.get("lat")))]
        elements.append((element, tags, points))
    site = next(
        Polygon(points) for _, tags, points in elements if tags.get("name") == "River Oaks District"
    )
    clip = site.buffer(12)
    shapes, buildings, roads, trees, stores = [], [], [], [], []
    for element, tags, points in elements:
        if element.tag == "way" and tags.get("building") and len(points) >= 4:
            polygon = Polygon(points)
            if not polygon.is_valid or not clip.covers(polygon.representative_point()):
                continue
            centroid = polygon.centroid
            base = elevation(centroid.x, centroid.y)
            levels = float(
                tags.get(
                    "building:levels", 5 if tags["building"] in {"apartments", "parking"} else 1
                )
            )
            height = float(tags.get("height", max(6.5, levels * 4)))
            bounds = polygon.bounds
            building = {
                "id": f"osm-way-{element.get('id')}",
                "center": [centroid.x, centroid.y, base],
                "ring": list(map(list, polygon.exterior.coords)),
                "size": [bounds[2] - bounds[0], bounds[3] - bounds[1], height],
                "yaw_deg": 0,
                "kind": tags["building"],
                "height_source": "OSM height"
                if "height" in tags
                else "estimated from tagged/default levels",
                "source_version": element.get("version"),
            }
            buildings.append(building)
            shapes.append(polygon)
        if element.tag == "way" and tags.get("highway") and len(points) >= 2:
            line = LineString(points).intersection(clip)
            for index, part in enumerate(
                [line] if line.geom_type == "LineString" else getattr(line, "geoms", [])
            ):
                if part.geom_type != "LineString" or part.length < 0.5:
                    continue
                kind = tags["highway"]
                roads.append(
                    {
                        "id": f"osm-way-{element.get('id')}-{index}",
                        "name": tags.get(
                            "name",
                            "District walkway"
                            if kind in {"footway", "pedestrian"}
                            else "District access lane",
                        ),
                        "points": [[x, y, elevation(x, y)] for x, y in part.coords],
                        "width_m": float(
                            tags.get("width", 3 if kind in {"footway", "pedestrian"} else 6.5)
                        ),
                        "kind": kind,
                        "width_source": "OSM" if "width" in tags else "provisional",
                    }
                )
        if (
            element.tag == "node"
            and tags.get("natural") == "tree"
            and clip.covers(Point(points[0]))
        ):
            x, y = points[0]
            trees.append(
                {
                    "id": f"osm-node-{element.get('id')}",
                    "position": [x, y, elevation(x, y)],
                    "height_m": 8,
                    "crown_radius_m": 3.5,
                    "species": "unknown",
                    "source": "OSM mapped point; dimensions/species estimated",
                }
            )
    for element, tags, points in elements:
        if (
            element.tag != "node"
            or tags.get("name") not in CURRENT
            or not site.covers(Point(points[0]))
        ):
            continue
        point = Point(points[0])
        candidates = [(polygon.distance(point), i) for i, polygon in enumerate(shapes)]
        _, index = min(candidates)
        polygon = shapes[index]
        boundary_point = nearest_points(point, polygon.boundary)[1]
        ring = list(polygon.exterior.coords)
        a, b = min(zip(ring, ring[1:]), key=lambda edge: LineString(edge).distance(boundary_point))
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        nx, ny = -dy / length, dx / length
        if polygon.contains(Point(boundary_point.x + nx * 0.2, boundary_point.y + ny * 0.2)):
            nx, ny = -nx, -ny
        x, y = boundary_point.x, boundary_point.y
        position = [x + nx * 5.2, y + ny * 5.2]
        name = DISPLAY.get(tags["name"], tags["name"])
        stores.append(
            {
                "id": f"osm-node-{element.get('id')}",
                "name": name,
                "category": tags.get("shop", tags.get("amenity", "wellness")),
                "position": [*points[0], elevation(*points[0])],
                "facade": [x, y, buildings[index]["center"][2]],
                "outward": [nx, ny],
                "visit": [*position, elevation(*position)],
                "building_id": buildings[index]["id"],
                "location_basis": (
                    "OSM tenant point; facade/arrival projected to nearest footprint edge, "
                    "unverified"
                ),
                "directory_checked": "2026-09-17",
            }
        )
    world = json.loads((ROOT / "unreal/Content/Data/world.json").read_text())
    bounds = list(clip.bounds)
    spacing = [(bounds[2] - bounds[0]) / 64, (bounds[3] - bounds[1]) / 64]
    observed_terrain = {
        **world["terrain"],
        "width": 65,
        "height": 65,
        "grid_origin_m": bounds[:2],
        "spacing_m": spacing,
        "heights_m": [
            elevation(bounds[0] + col * spacing[0], bounds[1] + row * spacing[1])
            for row in range(65)
            for col in range(65)
        ],
    }
    spawn_store = next(store for store in stores if store["name"] == "Dior")
    result = {
        "schema_version": 1,
        "scene": "district",
        "title": "River Oaks District",
        "address": "4444 Westheimer Rd, Houston",
        "origin": [-95.425, 29.755],
        "crs": "EPSG:32615",
        "bounds_m": bounds,
        "site_ring": list(map(list, site.exterior.coords)),
        "buildings": buildings,
        "roads": roads,
        "trees": trees,
        "parcels": [{"id": "osm-district-landuse", "ring": list(map(list, site.exterior.coords))}],
        "stores": sorted(stores, key=lambda s: s["name"]),
        "terrain": world["terrain"],
        "walkSurfaceOffset": 0.2,
        "walkSpawn": spawn_store["visit"],
        "collisionPolygons": [building["ring"] for building in buildings],
        "communityLocations": [
            {
                "id": store["id"],
                "name": store["name"],
                "position": [
                    store["visit"][0] + store["outward"][0] * 1.5,
                    store["visit"][1] + store["outward"][1] * 1.5,
                    store["visit"][2] + 0.2,
                ],
            }
            for store in stores
        ],
        "provenance": {
            "source": URL,
            "source_sha256": hashlib.sha256(RAW.read_bytes()).hexdigest(),
            "built_at": datetime.now(timezone.utc).isoformat(),
            "license": "ODbL-1.0",
            "license_url": "https://opendatacommons.org/licenses/odbl/1-0/",
            "attribution": "© OpenStreetMap contributors",
            "directory_reference": "https://www.riveroaksdistrict.com/map",
            "directory_checked": "2026-09-17",
        },
        "limitations": [
            (
                "OSM footprint/tenant positions are mapped observations; independent survey "
                "accuracy unverified."
            ),
            (
                "Facade designs, glass displays, heights without OSM tags, street furniture "
                "and planting are interpreted, not photographed replicas."
            ),
            (
                "Storefront/arrival points inferred from nearest footprint edge; current "
                "entrance and tenant boundaries require a site survey."
            ),
            (
                "No exact shop interiors. Fictional visitors and authored conversations, "
                "not real residents or store staff."
            ),
            (
                "No live Jev inference verified without configured credentials. No UE or "
                "target-GPU 4K performance proof."
            ),
        ],
    }
    result["terrain"] = observed_terrain
    cartier = next(store for store in stores if store["name"] == "Cartier")
    sx = (spawn_store["visit"][0] + cartier["visit"][0]) / 2
    sy = min(spawn_store["visit"][1], cartier["visit"][1]) - 2
    result["walkSpawn"] = [sx, sy, elevation(sx, sy)]
    result["walkLookAt"] = [sx, sy + 35, elevation(sx, sy + 35)]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, separators=(",", ":")) + "\n")
    print(json.dumps({key: len(result[key]) for key in ["buildings", "roads", "trees", "stores"]}))


if __name__ == "__main__":
    build()
