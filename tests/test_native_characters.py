import json
import struct
from pathlib import Path

import pytest

from river_oaks.native_characters import prepare_character

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "preview/public/assets/characters"


def read_glb(path):
    data = path.read_bytes()
    size = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20 : 20 + size])
    return document, data[28 + size :]


def test_native_texture_conversion_preserves_geometry_and_skeleton(tmp_path):
    entry = json.loads((SOURCE / "sources.json").read_text())["files"][0]
    source = SOURCE / Path(entry["path"]).name
    output = tmp_path / "resident.glb"
    prepare_character(source, output, entry["sha256"])
    old, old_binary = read_glb(source)
    new, binary = read_glb(output)
    assert new["skins"] == old["skins"]
    assert new["nodes"] == old["nodes"]
    assert new["meshes"] == old["meshes"]
    assert new["accessors"] == old["accessors"]
    assert binary[: len(old_binary)] == old_binary
    assert "EXT_texture_webp" not in new.get("extensionsRequired", [])
    for texture in new["textures"]:
        assert "source" in texture
        assert "EXT_texture_webp" not in texture.get("extensions", {})
    for image in new["images"]:
        assert image["mimeType"] == "image/png"
        view = new["bufferViews"][image["bufferView"]]
        assert binary[view["byteOffset"] :][:8] == b"\x89PNG\r\n\x1a\n"


def test_native_conversion_rejects_wrong_hash_and_existing_output(tmp_path):
    entry = json.loads((SOURCE / "sources.json").read_text())["files"][0]
    source = SOURCE / Path(entry["path"]).name
    output = tmp_path / "resident.glb"
    with pytest.raises(ValueError, match="hash"):
        prepare_character(source, output, "0" * 64)
    assert not output.exists()
    output.write_text("keep")
    with pytest.raises(FileExistsError):
        prepare_character(source, output, entry["sha256"])
    assert output.read_text() == "keep"
