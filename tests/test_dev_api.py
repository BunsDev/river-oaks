import json

import httpx

from river_oaks.agents import DecisionEngine
from river_oaks.geo import digest
from river_oaks.service import create_app


async def test_dev_artifacts_are_explicit_not_a_filesystem_server(tmp_path):
    world = {"schema_version": 1, "roads": [], "buildings": [], "trees": []}
    world_path, report_path = tmp_path / "world.json", tmp_path / "report.json"
    world_path.write_text(json.dumps(world))
    report_path.write_text(json.dumps({"world_sha256": digest(world), "status": "blocked"}))
    (tmp_path / ".env").write_text("PRIVATE=fixture-only")
    app = create_app(DecisionEngine(), world_path=world_path, report_path=report_path)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as c:
        response = await c.get("/v1/world")
        assert response.json() == world
        assert response.headers["cache-control"] == "no-store"
        assert (await c.get("/v1/verification")).json()["status"] == "blocked"
        assert (await c.get("/.env")).status_code == 404
        assert (await c.get("/v1/world/.env")).status_code == 404


async def test_missing_or_stale_artifacts_do_not_claim_current_verification(tmp_path):
    world_path, report_path = tmp_path / "world.json", tmp_path / "report.json"
    app = create_app(DecisionEngine(), world_path=world_path, report_path=report_path)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as c:
        assert (await c.get("/v1/world")).status_code == 404
        world_path.write_text(json.dumps({"schema_version": 1, "changed": True}))
        report_path.write_text(json.dumps({"world_sha256": "outdated", "status": "pass"}))
        response = await c.get("/v1/verification")
        assert response.status_code == 409
        assert "stale" in response.json()["detail"]
