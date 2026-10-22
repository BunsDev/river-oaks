import hashlib
import runpy
from pathlib import Path

import pytest

collect_inputs = runpy.run_path(
    str(Path(__file__).resolve().parents[1] / "scripts/character_build_inputs.py")
)["collect_inputs"]


def test_sibling_material_and_texture_are_hashed_transitively(tmp_path):
    eyes = tmp_path / "eyes"
    mesh, materials = eyes / "high-poly", eyes / "materials"
    mesh.mkdir(parents=True)
    materials.mkdir()
    descriptor = mesh / "high-poly.mhclo"
    descriptor.write_text("obj_file high-poly.obj\nmaterial ../materials/brown.mhmat\n")
    (mesh / "high-poly.obj").write_text("mesh")
    (materials / "brown.mhmat").write_text("diffuseTexture brown_eye.png\n")
    texture = materials / "brown_eye.png"
    texture.write_bytes(b"fixture pixels")
    result = collect_inputs(tmp_path, [descriptor])
    assert len(result) == 4
    assert (
        result["eyes/materials/brown_eye.png"] == hashlib.sha256(texture.read_bytes()).hexdigest()
    )
    texture.write_bytes(b"changed pixels")
    assert collect_inputs(tmp_path, [descriptor]) != result


def test_references_cannot_read_outside_the_selected_cache(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    descriptor = source / "escape.mhclo"
    descriptor.write_text("material ../private.mhmat\n")
    with pytest.raises(ValueError, match="escapes source root"):
        collect_inputs(source, [descriptor])
