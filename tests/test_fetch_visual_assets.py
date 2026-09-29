import hashlib
import importlib.util
import json
from pathlib import Path

import httpx
import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "fetch_visual_assets.py"
spec = importlib.util.spec_from_file_location("fetch_visual_assets", SCRIPT)
fetcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetcher)


def provider(payloads, url_prefix="https://dl.example/"):
    """A fake Poly Haven: every asset lists 1k files whose bytes come from payloads."""

    def item(name):
        data = payloads[name]
        return {"url": url_prefix + name, "md5": hashlib.md5(data).hexdigest(), "size": len(data)}

    def handler(request):
        url = str(request.url)
        if url.startswith("https://api.polyhaven.com/files/"):
            asset = url.rsplit("/", 1)[1]
            if asset == fetcher.SKY:
                return httpx.Response(200, json={"hdri": {"1k": {"hdr": item("sky.hdr")}}})
            name = next(key for key, value in fetcher.ASSETS.items() if value == asset)
            channels = {"Diffuse": "color", "nor_gl": "normal", "arm": "arm"}
            return httpx.Response(
                200,
                json={
                    channel: {"1k": {"jpg": item(f"{name}-{kind}.jpg")}}
                    for channel, kind in channels.items()
                },
            )
        return httpx.Response(200, content=payloads[url.rsplit("/", 1)[1]])

    return httpx.MockTransport(handler)


def files():
    names = [f"{name}-{kind}.jpg" for name in fetcher.ASSETS for kind in ("color", "normal", "arm")]
    return {name: f"pixels for {name}".encode() for name in [*names, "sky.hdr"]}


def pin(tmp_path, payloads):
    fetcher.fetch(update=True, output=tmp_path, transport=provider(payloads))
    return json.loads((tmp_path / "sources.json").read_text())


def test_pinned_downloads_pass(tmp_path):
    payloads = files()
    lock = pin(tmp_path, payloads)
    for item in lock["files"]:
        (tmp_path / Path(item["path"]).name).unlink()
    fetcher.fetch(output=tmp_path, transport=provider(payloads))
    assert json.loads((tmp_path / "sources.json").read_text()) == lock


def test_a_changed_source_url_is_refused_before_contacting_it(tmp_path):
    payloads = files()
    pin(tmp_path, payloads)
    (tmp_path / "brick-color.jpg").unlink()
    seen = []
    inner = provider(payloads, "https://elsewhere.example/")

    def record(request):
        seen.append(str(request.url))
        return inner.handle_request(request)

    with pytest.raises(ValueError, match="source URL changed"):
        fetcher.fetch(output=tmp_path, transport=httpx.MockTransport(record))
    assert not any(url.startswith("https://elsewhere.example/") for url in seen)


def test_a_changed_payload_is_refused(tmp_path):
    payloads = files()
    pin(tmp_path, payloads)
    (tmp_path / "brick-color.jpg").unlink()
    payloads["brick-color.jpg"] = b"swapped upstream"
    with pytest.raises(ValueError, match="pinned SHA-256"):
        fetcher.fetch(output=tmp_path, transport=provider(payloads))


def test_update_repins_a_changed_asset(tmp_path):
    payloads = files()
    pin(tmp_path, payloads)
    payloads["brick-color.jpg"] = b"new upstream release"
    (tmp_path / "brick-color.jpg").unlink()
    lock = pin(tmp_path, payloads)
    entry = next(item for item in lock["files"] if item["path"].endswith("brick-color.jpg"))
    assert entry["sha256"] == hashlib.sha256(b"new upstream release").hexdigest()
