"""Evaluation only: Overture building height coverage around the District.

Runs a bounding-box query against the public Overture release with an ephemeral DuckDB
(not a project dependency); only the row groups intersecting the box are read.

    uv run --no-project --with duckdb==1.4.1 python -I \
        experiments/procedural-tools/overture_heights.py --release 2026-10-21.0 --out report.json
"""

import argparse
import json
from pathlib import Path

import duckdb

# Same box as the Overpass completeness query: the District and its eastern expansion land.
WEST, SOUTH, EAST, NORTH = -95.462, 29.735, -95.440, 29.750
DISTRICT = Path(__file__).resolve().parents[2] / "preview/public/data/district.json"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--release", required=True)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    db = duckdb.connect()
    db.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    path = f"s3://overturemaps-us-west-2/release/{args.release}/theme=buildings/type=building/*"
    db.execute(
        f"""CREATE TABLE b AS SELECT id, height, num_floors, roof_shape, class,
            sources FROM read_parquet('{path}', hive_partitioning=1)
            WHERE bbox.xmin > {WEST} AND bbox.xmax < {EAST}
              AND bbox.ymin > {SOUTH} AND bbox.ymax < {NORTH}"""
    )
    total, height, floors, either, roof = db.execute(
        """SELECT count(*), count(height), count(num_floors),
           count(*) FILTER (WHERE height IS NOT NULL OR num_floors IS NOT NULL),
           count(roof_shape) FROM b"""
    ).fetchone()
    datasets = db.execute(
        """SELECT s.dataset, count(*) AS n, count(*) FILTER (WHERE height IS NOT NULL) AS h
           FROM b, unnest(sources) AS u(s) GROUP BY 1 ORDER BY 2 DESC"""
    ).fetchall()
    height_sources = db.execute(
        """SELECT s.dataset, count(*) FROM b, unnest(sources) AS u(s)
           WHERE s.property LIKE '%height%' GROUP BY 1 ORDER BY 2 DESC"""
    ).fetchall()
    ids = [b["id"].removeprefix("osm-way-") for b in json.loads(DISTRICT.read_text())["buildings"]]
    district = db.execute(
        """SELECT regexp_extract(s.record_id, 'w([0-9]+)', 1) AS way, height, num_floors,
           (SELECT string_agg(h.dataset, ',') FROM unnest(sources) AS v(h)
            WHERE h.property LIKE '%height%') AS height_from
           FROM b, unnest(sources) AS u(s) WHERE s.dataset = 'OpenStreetMap'
           AND regexp_extract(s.record_id, 'w([0-9]+)', 1) IN (SELECT unnest(?))""",
        [ids],
    ).fetchall()
    report = {
        "generatedBy": "experiments/procedural-tools/overture_heights.py",
        "release": args.release,
        "bbox": [WEST, SOUTH, EAST, NORTH],
        "buildings": total,
        "with_height": height,
        "with_num_floors": floors,
        "with_either": either,
        "with_roof_shape": roof,
        "by_dataset": [{"dataset": d, "buildings": n, "with_height": h} for d, n, h in datasets],
        "height_property_sources": [{"dataset": d, "count": n} for d, n in height_sources],
        "district_buildings": [
            {"osm_way": w, "height": h, "num_floors": f, "height_from": src or "OpenStreetMap"}
            for w, h, f, src in sorted(district)
        ],
    }
    text = json.dumps(report, indent=2) + "\n"
    if args.out:
        args.out.write_text(text)
    print(text)


if __name__ == "__main__":
    main()
