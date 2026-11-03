"""Publishing must refuse failed audits and changed staging bytes before writing."""

import hashlib
import runpy
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/quaternius_clip_publish.py"


def setup_bundle(tmp_path):
    assert SCRIPT.exists(), "audited bundle publication must exist"
    publish = runpy.run_path(str(SCRIPT))["publish_bundle"]
    stage = tmp_path / ".runtime/quaternius-clips/staging"
    stage.mkdir(parents=True)
    source = tmp_path / "data/raw/characters/quaternius"
    source.mkdir(parents=True)
    for name in ["UAL1", "UAL2"]:
        (source / f"{name}.glb").write_bytes(b"source")
        (source / f"License-{name}.txt").write_text("CC0 1.0 Universal by Quaternius")
    scripts = tmp_path / "scripts"
    scripts.mkdir()
    for name in [
        "build_quaternius_clips.py",
        "quaternius_clip_audit.py",
        "quaternius_clip_publish.py",
    ]:
        (scripts / name).write_text("fixture")
    (stage / "wave.glb").write_bytes(b"fixture")
    report = {
        "ok": True,
        "generator": "fixture",
        "fps": 30,
        "boneHeuristic": "BLENDER",
        "sources": {
            f"{name}.glb": hashlib.sha256(b"source").hexdigest() for name in ["UAL1", "UAL2"]
        },
        "groups": [
            {
                "group": "wave",
                "clips": ["Wave"],
                "bytes": 7,
                "sha256": hashlib.sha256(b"fixture").hexdigest(),
                "problems": [],
            }
        ],
    }
    # Synthetic, independently pinned inputs replace the large ignored source packs.
    publish.__globals__["SOURCE_SHA256"] = report["sources"].copy()
    return publish, report


@pytest.mark.parametrize("invalid", ["failed", "changed", "missing", "source"])
def test_refuses_incomplete_or_changed_inputs_without_public_output(tmp_path, invalid):
    publish, report = setup_bundle(tmp_path)
    if invalid == "failed":
        report["ok"] = False
    if invalid == "changed":
        (tmp_path / ".runtime/quaternius-clips/staging/wave.glb").write_bytes(b"changed")
    if invalid == "missing":
        report["groups"] = []
    if invalid == "source":
        (tmp_path / "data/raw/characters/quaternius/UAL1.glb").write_bytes(b"changed")
    with pytest.raises(ValueError):
        publish(tmp_path, report, {"wave": ["Wave"]}, ["root"])
    assert not (tmp_path / "preview").exists()


def test_publishes_matching_catalog_receipt_licenses_and_bytes(tmp_path):
    import json

    publish, report = setup_bundle(tmp_path)
    written = publish(tmp_path, report, {"wave": ["Wave"]}, ["root"])
    output = tmp_path / "preview/public/assets/animations"
    assert (output / "wave.glb").read_bytes() == b"fixture"
    receipt = json.loads((output / "quaternius.sources.json").read_text())
    assert receipt["groups"]["wave"]["sha256"] == hashlib.sha256(b"fixture").hexdigest()
    assert receipt["license"] == "CC0-1.0"
    assert len(receipt["licenses"]) == 2
    assert "preview/src/animation-clip-assets.js" in written
    for name in written:
        assert (tmp_path / name).is_file()


def test_matching_report_cannot_relabel_unpinned_source_bytes(tmp_path):
    publish, report = setup_bundle(tmp_path)
    (tmp_path / "data/raw/characters/quaternius/UAL1.glb").write_bytes(b"different source")
    report["sources"]["UAL1.glb"] = hashlib.sha256(b"different source").hexdigest()
    with pytest.raises(ValueError, match="pinned"):
        publish(tmp_path, report, {"wave": ["Wave"]}, ["root"])
    assert not (tmp_path / "preview").exists()
