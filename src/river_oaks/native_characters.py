"""Keep the shipped GLB geometry intact while replacing WebP with native PNG images."""

import hashlib
import io
import json
import struct
from pathlib import Path


def prepare_character(source: Path, output: Path, expected_hash: str):
    if output.exists():
        raise FileExistsError(output)
    data = source.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected_hash:
        raise ValueError(f"Character source hash mismatch: {source.name}")
    magic, version, length = struct.unpack_from("<III", data)
    if magic != 0x46546C67 or version != 2 or length != len(data):
        raise ValueError("Expected a complete GLB version 2 file")
    size, kind = struct.unpack_from("<II", data, 12)
    if kind != 0x4E4F534A:
        raise ValueError("Expected a JSON chunk")
    document = json.loads(data[20 : 20 + size])
    binary_size, binary_kind = struct.unpack_from("<II", data, 20 + size)
    if binary_kind != 0x004E4942 or 28 + size + binary_size != len(data):
        raise ValueError("Expected a single embedded binary chunk")
    binary = bytearray(data[28 + size :])
    from PIL import Image

    for image in document["images"]:
        if image["mimeType"] != "image/webp":
            raise ValueError("Expected embedded WebP source textures")
        view = document["bufferViews"][image["bufferView"]]
        offset = view.get("byteOffset", 0)
        pixels = Image.open(io.BytesIO(binary[offset : offset + view["byteLength"]]))
        png = io.BytesIO()
        pixels.save(png, format="PNG")
        binary.extend(b"\0" * (-len(binary) % 4))
        image["bufferView"] = len(document["bufferViews"])
        image["mimeType"] = "image/png"
        document["bufferViews"].append(
            {"buffer": 0, "byteOffset": len(binary), "byteLength": len(png.getvalue())}
        )
        binary.extend(png.getvalue())
    for texture in document["textures"]:
        extensions = texture.get("extensions", {})
        texture["source"] = extensions.pop("EXT_texture_webp")["source"]
        if not extensions:
            texture.pop("extensions", None)
    for key in ("extensionsUsed", "extensionsRequired"):
        if key in document:
            document[key] = [name for name in document[key] if name != "EXT_texture_webp"]
    document["buffers"][0]["byteLength"] = len(binary)
    binary.extend(b"\0" * (-len(binary) % 4))
    encoded = json.dumps(document, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("xb") as target:
        target.write(struct.pack("<III", magic, version, 28 + len(encoded) + len(binary)))
        target.write(struct.pack("<II", len(encoded), kind))
        target.write(encoded)
        target.write(struct.pack("<II", len(binary), binary_kind))
        target.write(binary)
