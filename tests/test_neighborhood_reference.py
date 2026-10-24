import json
import subprocess
import sys
from pathlib import Path

import pytest
from shapely.affinity import rotate, translate
from shapely.geometry import LineString, Polygon, box

from river_oaks.neighborhood_reference import compile_reference

ROOT = Path(__file__).resolve().parents[1]


def recipe():
    return json.loads((ROOT / "config/neighborhoods/garden-blocks.json").read_text())


def source():
    return {
        "schema_version": 1,
        "crs": "EPSG:32615",
        "origin": [-95.425, 29.755],
        "bounds_m": [-120, -120, 120, 120],
        "roads": [
            {
                "id": "road:1",
                "name": "Reference road",
                "width_m": 8.4,
                "points": [[-115, -35, 0], [0, -30, 0], [115, -5, 0]],
            },
        ],
        "parcels": [
            {
                "id": "lot:1",
                "ring": [[-65, -10], [-10, -5], [-5, 60], [-70, 60], [-65, -10]],
                "holes": [[[-50, 30], [-40, 30], [-40, 40], [-50, 40], [-50, 30]]],
            },
            {
                "id": "lot:2",
                "ring": [[15, 15], [75, 25], [65, 70], [15, 70], [15, 15]],
                "holes": [],
            },
        ],
        "buildings": [],
        "trees": [],
        "provenance": {
            "roads_sha256": "a" * 64,
            "parcels_sha256": "b" * 64,
            "source": "Synthetic projected fixture",
        },
        "limitations": ["Synthetic input, not geographic accuracy evidence"],
    }


def footprint(option):
    w, d, _ = option["size"]
    return translate(
        rotate(box(-w / 2, -d / 2, w / 2, d / 2), option["yaw_deg"]), *option["center"]
    )


def test_preserves_frame_polygons_holes_and_cropped_road_geometry_without_rectifying():
    world, before = source(), source()
    result = compile_reference(world, recipe())
    ref = result["reference"]
    assert world == before
    assert result["frame"]["crs"] == "EPSG:32615"
    assert result["frame"]["origin"] == world["origin"]
    assert result["streets"] == []
    assert ref["source_provenance"] == world["provenance"]
    assert len(ref["source_sha256"]) == 64
    assert ref["parcels"][0]["holes"]
    original = LineString([p[:2] for p in world["roads"][0]["points"]])
    for road in ref["roads"]:
        assert LineString(road["points"]).difference(original.buffer(1e-8)).is_empty
    assert ref["diagnostics"][0]["code"] == "source-road-cropped"
    assert len(ref["slots"]) == 2
    assert all(
        slot["frontageRoadId"] in {road["id"] for road in ref["roads"]} for slot in ref["slots"]
    )
    for slot in ref["slots"]:
        parcel = next(p for p in ref["parcels"] if p["id"] == slot["parcelId"])
        inset = Polygon(parcel["ring"], parcel["holes"]).buffer(-result["constraints"]["setback_m"])
        assert slot["options"]
        for option in slot["options"]:
            assert inset.covers(footprint(option))
            block = next(b for b in ref["blocks"] if b["id"] == slot["blockId"])
            assert Polygon(block["ring"], block["holes"]).covers(footprint(option))
            template = next(t for t in result["templates"] if t["id"] == option["templateId"])
            assert option["size"] == template["size"], "Never shrink a reusable module to fit"


def test_reordered_source_and_recipe_inputs_are_deterministic():
    world, controls = source(), recipe()
    expected = compile_reference(world, controls)
    world["parcels"].reverse()
    controls["templates"].reverse()
    controls["streets"].reverse()
    assert compile_reference(world, controls) == expected


def test_existing_source_buildings_are_protected_footprints_and_never_placement_slots():
    world = source()
    world["buildings"] = [
        {"id": "handmade-pavilion", "ring": [[-64, 0], [-12, 0], [-12, 59], [-64, 59], [-64, 0]]}
    ]
    result = compile_reference(world, recipe())["reference"]
    assert result["protected"][0]["source_id"] == "handmade-pavilion"
    assert len(result["slots"]) == 1
    assert any(item["code"] == "source-parcel-unbuildable" for item in result["diagnostics"])
    protected = Polygon(result["protected"][0]["ring"])
    assert all(
        not protected.intersects(footprint(option))
        for slot in result["slots"]
        for option in slot["options"]
    )


def test_resamples_observed_terrain_in_the_same_frame_without_extrapolation():
    world = source()
    world["terrain"] = {
        "width": 5,
        "height": 5,
        "grid_origin_m": [-120, -120],
        "spacing_m": [60, 60],
        "heights_m": [10 + x + 2 * y for y in range(5) for x in range(5)],
    }
    terrain = compile_reference(world, recipe())["reference"]["terrain"]
    assert terrain["width"] == terrain["height"] == 17
    assert terrain["heights_m"][0] == pytest.approx(11.2)
    assert terrain["heights_m"][-1] == pytest.approx(20.8)
    world["terrain"]["grid_origin_m"] = [0, 0]
    with pytest.raises(ValueError, match="terrain.*coverage"):
        compile_reference(world, recipe())


def test_narrow_source_rectangles_remain_overlays_instead_of_invalid_studio_parcels():
    world = source()
    world["parcels"].append(
        {"id": "thin-lot", "ring": [[78, 20], [82, 20], [82, 60], [78, 60], [78, 20]]}
    )
    ref = compile_reference(world, recipe())["reference"]
    narrow = next(p for p in ref["parcels"] if p["source_id"] == "thin-lot")
    assert "bounds_m" not in narrow
    assert len(ref["slots"]) == 2


def assert_node_builds(result):
    built = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import {buildNeighborhood} from './shared/neighborhood/preserve.js';"
            "let data=''; for await (const chunk of process.stdin) data+=chunk;"
            "buildNeighborhood(JSON.parse(data));",
        ],
        input=json.dumps(result),
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert built.returncode == 0, built.stderr


def test_bent_roads_use_the_same_square_segment_clearance_as_node():
    world, controls = source(), recipe()
    world["roads"] = [{"id": "bend", "width_m": 8.4, "points": [[-70, 0], [0, 0], [60, 60]]}]
    world["parcels"] = [
        {"id": "corner", "ring": [[4, -15], [14, -15], [14, -5], [4, -5], [4, -15]]}
    ]
    controls["constraints"]["setback_m"] = 1
    controls["templates"] = [{"id": "small", "kind": "residential", "size": [4, 4, 6]}]
    assert_node_builds(compile_reference(world, controls))


def test_offsite_roads_do_not_exhaust_candidate_diagnostics():
    world = source()
    world["roads"].extend(
        {"id": f"offsite-{index}", "width_m": 8.4, "points": [[110, 110], [115, 115]]}
        for index in range(2050)
    )
    result = compile_reference(world, recipe())
    assert len(result["reference"]["diagnostics"]) < 10
    assert_node_builds(result)


@pytest.mark.parametrize(
    "change,match",
    [
        ({"crs": "EPSG:4326"}, "EPSG:32615"),
        ({"origin": [0, float("nan")]}, "finite"),
        (
            {"parcels": [{"id": "broken", "ring": [[0, 0], [20, 20], [0, 20], [20, 0], [0, 0]]}]},
            "Invalid.*parcel",
        ),
        ({"roads": [{"id": "r", "points": [[0, 0], [10, 0]], "width_m": 100}]}, "width"),
        ({"roads": []}, "road"),
    ],
)
def test_invalid_sources_fail_explicitly(change, match):
    with pytest.raises(ValueError, match=match):
        compile_reference({**source(), **change}, recipe())


@pytest.mark.parametrize("preset", ["garden-blocks", "garden-market"])
def test_cli_writes_once_and_result_builds_with_existing_node_pipeline(tmp_path, preset):
    world_path, recipe_path, output = (
        tmp_path / "world.json",
        tmp_path / "recipe.json",
        tmp_path / "reference.json",
    )
    world_path.write_text(json.dumps(source()))
    controls = json.loads((ROOT / f"config/neighborhoods/{preset}.json").read_text())
    recipe_path.write_text(json.dumps(controls))
    original_source = world_path.read_bytes()
    command = [
        sys.executable,
        "-m",
        "river_oaks.neighborhood_reference",
        "--world",
        str(world_path),
        "--recipe",
        str(recipe_path),
        "--out",
        str(output),
    ]
    run = subprocess.run(command, capture_output=True, text=True, check=False)
    assert run.returncode == 0, run.stderr
    before = output.read_bytes()
    refused = subprocess.run(command, capture_output=True, text=True, check=False)
    assert refused.returncode == 1 and output.read_bytes() == before
    built = subprocess.run(
        [
            "node",
            "scripts/neighborhood.mjs",
            "build",
            "--recipe",
            str(output),
            "--out",
            str(tmp_path / "candidate"),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert built.returncode == 0, built.stderr
    artifact = json.loads((tmp_path / "candidate/authoring.json").read_text())
    assert len(artifact["region"]["buildings"]) == 2
    assert artifact["region"]["parcels"] == [], (
        "Irregular source parcels are not mislabeled rectangular parcels"
    )
    assert artifact["recipe"]["reference"]["parcels"][0]["holes"]
    assert "reference-parcel" in (tmp_path / "candidate/preview.svg").read_text()
    assert world_path.read_bytes() == original_source
    assert artifact["recipe"]["frame"]["origin"] == source()["origin"]
    if "architecture" in controls:
        architecture = json.loads((tmp_path / "candidate/architecture.json").read_text())
        assert architecture["artifact_sha256"] == artifact["sha256"]
        assert architecture["counts"]["buildings"] == 2
        assert architecture["counts"]["fallbacks"] == 0
        assert any(instance["yaw_deg"] != 0 for instance in architecture["instances"])
        for instance in architecture["instances"]:
            building = next(b for b in artifact["region"]["buildings"] if b["id"] == instance["id"])
            assert instance["position"][:2] == building["center"]
            assert instance["yaw_deg"] == building["yaw_deg"]
            assert instance["plan"]["collisionRings"]
            assert instance["plan"]["supportSurfaces"]
            envelope = box(
                -building["size"][0] / 2,
                -building["size"][1] / 2,
                building["size"][0] / 2,
                building["size"][1] / 2,
            )
            for part in instance["plan"]["parts"]:
                assert envelope.buffer(1e-6).covers(rectangle_part(part))


def rectangle_part(part):
    width, depth, _ = part["size"]
    return translate(
        rotate(box(-width / 2, -depth / 2, width / 2, depth / 2), part["rotation"]),
        *part["position"][:2],
    )
