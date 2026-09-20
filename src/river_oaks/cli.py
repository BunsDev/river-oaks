"""Reproducible local commands; verification failures are machine-readable exit codes."""

import argparse
import asyncio
import json
import statistics
import sys
from pathlib import Path

import httpx

from .acquire import acquire
from .agents import DecisionEngine, Snapshot
from .geo import build_world
from .observations import acquire_observations
from .terrain import TerrainRaster, apply_terrain
from .verify import markdown_report, verify_world


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def demo(directory):
    """Small explicit synthetic fixture for engine and offline CI, never GIS evidence."""
    config = {
        "origin": [-95.425, 29.755],
        "crs": "EPSG:32615",
        "bbox": [-95.429, 29.751, -95.421, 29.759],
        "seed": 42,
        "setback_m": 6,
        "boundary_status": "Synthetic test fixture; not actual River Oaks geography",
    }
    roads = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": 1,
                "properties": {"ST_NAME": "Synthetic test road"},
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[-95.429, 29.755], [-95.421, 29.755]],
                },
            }
        ],
    }
    parcels = {"type": "FeatureCollection", "features": []}
    for index in range(8):
        x = -95.4285 + index * 0.0008
        y = 29.7553
        parcels["features"].append(
            {
                "type": "Feature",
                "id": index,
                "properties": {"state_class": "A1"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [[x, y], [x + 0.0006, y], [x + 0.0006, y + 0.001], [x, y + 0.001], [x, y]]
                    ],
                },
            }
        )
    for name, value in (
        ("config.json", config),
        ("roads.geojson", roads),
        ("parcels.geojson", parcels),
    ):
        write(directory / name, value)
    world = build_world(config, roads, parcels)
    world["data_mode"] = "synthetic_fixture"
    write(directory / "world.json", world)
    return world


async def benchmark(count, iterations):
    engine = DecisionEngine()
    packet = Snapshot.model_validate(
        {
            "schema_version": 1,
            "tick": 0,
            "hour": 17,
            "weather": {"rain": 0.5, "humidity": 0.9, "storm": False},
            "agents": [
                {
                    "id": f"npc-{i}",
                    "kind": "pedestrian",
                    "position": [i, 0, 0],
                    "activity": "walk",
                    "nearby": [],
                    "blocked": i % 10 == 0,
                }
                for i in range(count)
            ],
        }
    )
    times = [(await engine.decide(packet))["latency_ms"] for _ in range(iterations)]
    times.sort()
    return {
        "scope": "local Python decision rules only; excludes networking, Jev, UE and GPU",
        "agents": count,
        "iterations": iterations,
        "mode": "local_rules",
        "median_ms": statistics.median(times),
        "p95_ms": times[int((len(times) - 1) * 0.95)],
        "max_ms": max(times),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    download = commands.add_parser("acquire", help="Download bounded public GIS geometry")
    download.add_argument("--config", default="config/river-oaks.json")
    download.add_argument("--output", default="data/raw")
    observations = commands.add_parser(
        "observe", help="Acquire observed USGS terrain and H-GAC canopy"
    )
    observations.add_argument("--config", default="config/river-oaks.json")
    observations.add_argument("--output", default="data/raw")
    build = commands.add_parser("build", help="Create UE world manifest and privacy review queue")
    verify = commands.add_parser("verify", help="Independent input comparison; blocked exits 2")
    for command in (build, verify):
        command.add_argument("--config", default="config/river-oaks.json")
        command.add_argument("--raw", default="data/raw")
        command.add_argument("--terrain", help="Observed EPSG:32615 floating-point DEM GeoTIFF")
    build.add_argument("--trees", help="Observed WGS84 point GeoJSON with source_id")
    build.add_argument("--terrain-source", help="DEM source receipt (required with --terrain)")
    build.add_argument("--canopy-reference", help="Historical observed canopy overlay JSON")
    build.add_argument("--output", default="data/generated/world.json")
    verify.add_argument("--world", default="data/generated/world.json")
    verify.add_argument("--canopy", help="Independent local-meter canopy polygon reference JSON")
    verify.add_argument("--output", default="data/reports/verification.json")
    fixture = commands.add_parser("demo", help="Generate clearly labeled synthetic offline fixture")
    fixture.add_argument("--output", default="data/generated/demo")
    serve = commands.add_parser("serve", help="Start decision bridge on 127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    bench = commands.add_parser("benchmark", help="Measure local fallback decision dispatch")
    bench.add_argument("--agents", type=int, choices=range(1, 501), default=500, metavar="1..500")
    bench.add_argument(
        "--iterations", type=int, choices=range(2, 10001), default=100, metavar="2..10000"
    )
    bench.add_argument("--output", default="data/reports/local-benchmark.json")
    args = parser.parse_args(argv)
    try:
        if args.command == "serve":
            import uvicorn

            uvicorn.run(
                "river_oaks.service:create_app", factory=True, host="127.0.0.1", port=args.port
            )
        elif args.command == "demo":
            world = demo(Path(args.output))
            print(
                f"Synthetic fixture: {len(world['buildings'])} buildings; {args.output}/world.json"
            )
        elif args.command == "acquire":
            print(json.dumps(acquire(read(args.config), args.output), indent=2))
        elif args.command == "observe":
            print(json.dumps(acquire_observations(read(args.config), args.output), indent=2))
        elif args.command == "benchmark":
            result = asyncio.run(benchmark(args.agents, args.iterations))
            write(args.output, result)
            print(json.dumps(result, indent=2))
        else:
            config, raw = read(args.config), Path(args.raw)
            roads, parcels = read(raw / "roads.geojson"), read(raw / "parcels.geojson")
            if args.command == "build":
                world = build_world(
                    config, roads, parcels, read(args.trees) if args.trees else None
                )
                world["data_mode"] = "source_gis"
                if (raw / "sources.json").exists():
                    world["provenance"]["receipts"] = read(raw / "sources.json")
                if args.terrain:
                    if not args.terrain_source:
                        raise ValueError("--terrain-source is required with --terrain")
                    apply_terrain(world, TerrainRaster(args.terrain), read(args.terrain_source))
                if args.canopy_reference:
                    reference = read(args.canopy_reference)
                    if (
                        reference.get("origin") != world["origin"]
                        or reference.get("projected_crs") != world["crs"]
                    ):
                        raise ValueError("Canopy reference coordinate frame does not match world")
                    world["canopy_reference"] = reference
                write(args.output, world)
                write(
                    Path(args.output).with_name("residence-review.json"),
                    {
                        "status": "pending_manual_review",
                        "automatic_similarity_detection": "not_available",
                        "reason": "No licensed reference facade corpus; all generated homes queued",
                        "structures": [
                            {
                                "id": b["id"],
                                "parcel_id": b["parcel_id"],
                                "style": b["style"],
                                "review_status": b["review_status"],
                            }
                            for b in world["buildings"]
                        ],
                    },
                )
                print(
                    json.dumps(
                        {k: len(world[k]) for k in ("roads", "parcels", "buildings", "trees")}
                    )
                )
            else:
                result = verify_world(
                    read(args.world),
                    config,
                    roads,
                    parcels,
                    read(args.canopy) if args.canopy else None,
                    TerrainRaster(args.terrain) if args.terrain else None,
                )
                write(args.output, result)
                Path(args.output).with_suffix(".md").write_text(
                    markdown_report(result), encoding="utf-8"
                )
                print(f"Verification: {result['status']}; {args.output}")
                return (
                    1 if result["status"] == "fail" else 2 if result["status"] == "blocked" else 0
                )
    except (OSError, ValueError, KeyError, httpx.HTTPError) as exc:
        print(f"river-oaks: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
