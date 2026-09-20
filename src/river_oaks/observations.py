"""Bounded public elevation and historical canopy acquisition with source receipts."""

import hashlib
import json
import warnings
from datetime import datetime, timezone
from pathlib import Path

import httpx
import numpy as np
from rasterio.errors import NotGeoreferencedWarning
from rasterio.features import shapes
from rasterio.io import MemoryFile
from rasterio.transform import Affine
from shapely.affinity import translate
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from .geo import LocalFrame
from .terrain import TerrainRaster

DEM_SERVICE = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer"
CANOPY_SERVICE = (
    "https://gis.h-gac.com/arcgis/rest/services/UrbanForestry/UrbanForestry_CIR_UA/MapServer"
)


def json_response(client, url, params):
    response = client.get(url, params=params)
    response.raise_for_status()
    data = response.json()
    if "error" in data:
        raise ValueError(f"Observation service failed: {data['error']}")
    return data


def download(client, url, max_bytes=32 * 1024 * 1024):
    with client.stream("GET", url) as response:
        response.raise_for_status()
        content = bytearray()
        for chunk in response.iter_bytes():
            content.extend(chunk)
            if len(content) > max_bytes:
                raise ValueError("Observation exceeds bounded download budget")
    return bytes(content)


def canopy_reference(png, extent, origin_projected, source_id):
    if extent.get("spatialReference", {}).get("wkid") != 32615:
        raise ValueError("Canopy export must use EPSG:32615")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", NotGeoreferencedWarning)
        with MemoryFile(png) as memory, memory.open() as raster:
            if raster.count != 4:
                raise ValueError("Canopy renderer must export RGBA")
            rgba = raster.read()
    height, width = rgba.shape[1:]
    visible = rgba[3] > 0
    green = (rgba[0] == 0) & (rgba[1] == 115) & (rgba[2] == 76) & (rgba[3] == 255)
    if np.any(visible & ~green):
        raise ValueError("Unexpected canopy renderer colors; inspect source classification")
    dx, dy = (extent["xmax"] - extent["xmin"]) / width, (extent["ymax"] - extent["ymin"]) / height
    if not (dx > 0 and dy > 0):
        raise ValueError("Invalid canopy export extent")
    transform = Affine(dx, 0, extent["xmin"], 0, -dy, extent["ymax"])
    polygons = [
        shape(geometry)
        for geometry, value in shapes(green.astype("uint8"), mask=green, transform=transform)
        if value == 1
    ]
    geometry = translate(unary_union(polygons), -origin_projected[0], -origin_projected[1])
    return {
        "source_id": source_id,
        "crs": "local_m",
        "geometry": mapping(geometry),
        "pixel_size_m": [dx, dy],
        "observed_canopy_pixels": int(green.sum()),
        "export_sha256": hashlib.sha256(png).hexdigest(),
        "observation": "Rendered classified canopy footprint; not individual stems or species",
    }


def acquire_observations(config, directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    west, south, east, north = config["bbox"]
    bbox = ",".join(map(str, config["bbox"]))
    when = datetime.now(timezone.utc).isoformat()
    with httpx.Client(timeout=60) as client:
        catalog = json_response(
            client,
            DEM_SERVICE + "/query",
            {
                "f": "json",
                "where": "Category=1",
                "geometry": bbox,
                "geometryType": "esriGeometryEnvelope",
                "inSR": "4326",
                "spatialRel": "esriSpatialRelIntersects",
                "returnGeometry": "false",
                "outFields": "OBJECTID,Name,VerticalDatum,AcquisitionDate,Source,URL,LowPS",
            },
        )
        candidates = [
            f["attributes"]
            for f in catalog.get("features", [])
            if f["attributes"].get("Name") == "TX_Houston_B24"
            and f["attributes"].get("LowPS", 100) <= 1.01
            and "NAVD" in (f["attributes"].get("VerticalDatum") or "")
        ]
        if len(candidates) != 1:
            raise ValueError(
                "Expected one Houston B24 1m NAVD88 DEM; review the live source catalog"
            )
        selected = candidates[0]
        params = {
            "f": "json",
            "bbox": f"{west - 0.0005},{south - 0.0005},{east + 0.0005},{north + 0.0005}",
            "bboxSR": "4326",
            "imageSR": "32615",
            "size": "513,513",
            "format": "tiff",
            "pixelType": "F32",
            "interpolation": "RSP_BilinearInterpolation",
            "renderingRule": json.dumps({"rasterFunction": "None"}),
            "mosaicRule": json.dumps(
                {
                    "mosaicMethod": "esriMosaicLockRaster",
                    "lockRasterIds": [selected["OBJECTID"]],
                    "mosaicOperation": "MT_FIRST",
                }
            ),
        }
        exported = json_response(client, DEM_SERVICE + "/exportImage", params)
        raw = download(client, exported["href"])
        terrain_path = directory / "terrain.tif"
        terrain_path.write_bytes(raw)
        raster = TerrainRaster(terrain_path)
        terrain_receipt = {
            "source_id": f"usgs-3dep-{selected['Name']}-{selected['OBJECTID']}",
            "service_url": DEM_SERVICE,
            "source_url": selected["URL"],
            "vertical_datum": "NAVD88",
            "source_native_resolution_m": selected["LowPS"],
            "catalog_acquisition_timestamp_ms": selected["AcquisitionDate"],
            "date_note": "Catalog timestamp retained; survey flight dates need metadata review",
            "retrieved_at": when,
            "sha256": raster.sha256,
            "bbox_wgs84": config["bbox"],
            "export": exported,
            "request": params,
            "attribution": "USGS 3D Elevation Program",
            "license_status": "USGS public-domain elevation data",
        }
        (directory / "terrain-source.json").write_text(json.dumps(terrain_receipt, indent=2) + "\n")

        exported = json_response(
            client,
            CANOPY_SERVICE + "/export",
            {
                "f": "json",
                "bbox": bbox,
                "bboxSR": "4326",
                "imageSR": "32615",
                "size": "1024,1024",
                "layers": "show:3",
                "format": "png32",
                "transparent": "true",
            },
        )
        png = download(client, exported["href"])
        (directory / "canopy-2016.png").write_bytes(png)
        frame = LocalFrame(config["origin"], config["crs"])
        reference = canopy_reference(
            png, exported["extent"], (frame.east, frame.north), "hgac-urban-forestry-cir-2016"
        )
        reference.update(
            {
                "origin": config["origin"],
                "projected_crs": config["crs"],
                "service_url": CANOPY_SERVICE + "/3",
                "retrieved_at": when,
                "source_label_year": 2016,
                "export_extent": exported["extent"],
                "date_note": "Service label 2016; exact flight date/native resolution unavailable",
                "license_status": "Local inspection only; redistribution terms not established",
                "attribution": "Houston-Galveston Area Council Urban Forestry CIR 2016",
            }
        )
        (directory / "canopy-reference.json").write_text(json.dumps(reference) + "\n")
    return {
        "terrain": {
            "sha256": raster.sha256,
            "source_id": terrain_receipt["source_id"],
            "raster_resolution_m": raster.resolution_m,
        },
        "canopy": {
            k: reference[k] for k in ("source_id", "observed_canopy_pixels", "pixel_size_m")
        },
    }
