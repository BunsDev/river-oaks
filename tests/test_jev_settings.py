import json

import httpx
import pytest

from river_oaks.agents import DecisionEngine
from river_oaks.auto import AutoEngine
from river_oaks.service import create_app


async def test_override_reaches_both_engines_and_clear_restores_server_keys():
    authorizations = []

    def provider(request):
        authorizations.append(request.headers["authorization"])
        assert "manual-fixture" not in request.content.decode()
        return httpx.Response(200, json={"answers": {}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as remote:
        engine = DecisionEngine(remote, "resident-server-fixture")
        auto = AutoEngine(remote, "auto-server-fixture")
        app = create_app(engine, auto_engine=auto)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app), base_url="http://127.0.0.1"
        ) as c:
            status = await c.get("/v1/settings/jev")
            assert status.json() == {"source": "server", "configured": True}
            for key in ("manual-fixture", "replacement-fixture"):
                result = await c.put("/v1/settings/jev", json={"api_key": f" {key} "})
                assert result.status_code == 200
                assert result.json() == {"source": "manual", "configured": True}
                assert result.headers["cache-control"] == "no-store"
                assert key not in result.text
            await c.put("/v1/settings/jev", json={"api_key": "manual-fixture"})
            await c.post(
                "/v1/decisions",
                json={
                    "schema_version": 1,
                    "tick": 0,
                    "hour": 17,
                    "weather": {},
                    "agents": [
                        {
                            "id": "resident",
                            "kind": "resident",
                            "position": [0, 0, 0],
                            "activity": "walk",
                        }
                    ],
                },
            )
            await c.post(
                "/v1/auto",
                json={
                    "schema_version": 1,
                    "tick": 0,
                    "generation": 0,
                    "candidates": [{"id": "wait", "action": "wait", "label": "Wait"}],
                },
            )
            assert authorizations == ["Bearer manual-fixture", "Bearer manual-fixture"]
            status = await c.get("/v1/settings/jev")
            assert status.json() == {"source": "manual", "configured": True}
            assert "manual-fixture" not in status.text
            result = await c.delete("/v1/settings/jev")
            assert result.json() == {"source": "server", "configured": True}
            assert engine.api_key == "resident-server-fixture"
            assert auto.api_key == "auto-server-fixture"
            assert (await c.delete("/v1/settings/jev")).json() == result.json()


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"api_key": ""},
        {"api_key": "  "},
        {"api_key": 1},
        {"api_key": "fixture\nsecret"},
        {"api_key": "fixture secret"},
        {"api_key": "fixture" * 700},
        {"api_key": "fixture", "extra": True},
        ["fixture"],
    ],
)
async def test_invalid_override_does_not_echo_or_replace_key(payload):
    engine = DecisionEngine(api_key="server-fixture")
    app = create_app(engine)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://127.0.0.1"
    ) as c:
        result = await c.put("/v1/settings/jev", json=payload)
        assert result.status_code == 400
        assert "fixture" not in result.text
        assert engine.api_key == "server-fixture"


async def test_override_is_not_required_or_persisted_in_a_new_bridge():
    app = create_app(DecisionEngine())
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://127.0.0.1"
    ) as c:
        assert (await c.get("/v1/settings/jev")).json() == {"source": "none", "configured": False}
        result = await c.put("/v1/settings/jev", content=json.dumps({"api_key": "fixture"}))
        assert result.status_code == 415
        result = await c.put(
            "/v1/settings/jev", content="{broken", headers={"Content-Type": "application/json"}
        )
        assert result.status_code == 400
        await c.put("/v1/settings/jev", json={"api_key": "fixture"})
        assert (await c.delete("/v1/settings/jev")).json() == {
            "source": "none",
            "configured": False,
        }
        await c.put("/v1/settings/jev", json={"api_key": "fixture"})
    fresh = create_app(DecisionEngine())
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(fresh), base_url="http://127.0.0.1"
    ) as c:
        assert (await c.get("/v1/settings/jev")).json() == {"source": "none", "configured": False}
