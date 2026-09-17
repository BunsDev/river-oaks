"""Bounded, complete ArcGIS downloads with a strict non-personal attribute whitelist."""

import json
from datetime import datetime, timezone
from pathlib import Path

import httpx

from .geo import digest


def fetch_layer(client, url, bbox, fields, chunk_size=500, max_features=25000):
    def query(params):
        response = (
            client.post(url + "/query", data=params)
            if "objectIds" in params
            else client.get(url + "/query", params=params)
        )
        response.raise_for_status()
        data = response.json()
        if "error" in data:
            raise ValueError(
                f"ArcGIS query failed: {data['error'].get('message', 'unknown error')}"
            )
        return data

    data = query(
        {
            "f": "json",
            "where": "1=1",
            "geometry": ",".join(map(str, bbox)),
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "returnIdsOnly": "true",
        }
    )
    ids = sorted(data.get("objectIds") or [])
    if not ids or len(ids) > max_features:
        raise ValueError(f"Expected 1..{max_features} features; received {len(ids)}")
    features = []
    for start in range(0, len(ids), chunk_size):
        wanted = ids[start : start + chunk_size]
        page = query(
            {
                "f": "geojson",
                "objectIds": ",".join(map(str, wanted)),
                "outFields": ",".join(fields),
                "outSR": "4326",
                "returnGeometry": "true",
            }
        )
        received = page.get("features", [])
        actual = [int(f.get("id", f.get("properties", {}).get("OBJECTID", -1))) for f in received]
        if sorted(actual) != wanted or page.get("exceededTransferLimit"):
            raise ValueError("Incomplete ArcGIS page; refusing partial geometry")
        for item in received:
            item["properties"] = {
                k: v for k, v in item.get("properties", {}).items() if k in fields
            }
        features.extend(
            sorted(received, key=lambda f: int(f.get("id", f["properties"]["OBJECTID"])))
        )
    return {"type": "FeatureCollection", "features": features}


def acquire(config, directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    receipts = {}
    with httpx.Client(timeout=60, follow_redirects=True) as client:
        for name, source in config["sources"].items():
            result = fetch_layer(client, source["url"], config["bbox"], source["fields"])
            receipts[name] = {
                "url": source["url"],
                "retrieved_at": datetime.now(timezone.utc).isoformat(),
                "sha256": digest(result),
                "feature_count": len(result["features"]),
                "fields": source["fields"],
                "bbox": config["bbox"],
                "license_status": source["license_status"],
            }
            (directory / f"{name}.geojson").write_text(json.dumps(result), encoding="utf-8")
    (directory / "sources.json").write_text(json.dumps(receipts, indent=2) + "\n", encoding="utf-8")
    return receipts
