import json

import httpx
import pytest
from pydantic import ValidationError

from river_oaks.auto import AutoEngine
from river_oaks.companion import CompanionEngine, CompanionSnapshot, eligible, request_body
from river_oaks.service import create_app

CANDIDATES = [
    {"id": "beside", "action": "beside", "label": "Walk beside Jevica"},
    {"id": "lead", "action": "lead", "label": "Walk a step ahead"},
    {"id": "trail", "action": "trail", "label": "Walk a step behind"},
    {"id": "pause", "action": "pause", "label": "Wait attentively"},
    {"id": "greet", "action": "greet", "label": "Offer a courtly bow"},
    {"id": "return", "action": "return", "label": "Return to the carriage"},
]


def packet(**changes):
    return CompanionSnapshot.model_validate(
        {"schema_version": 1, "tick": 3, "generation": 1, "candidates": CANDIDATES, **changes}
    )


def reply(body, choice, confidence=0.9):
    options = body["questions"]["next_action"]["criteria"]
    return {
        "model": "jev-1.13.0",
        "answers": {
            "next_action": {
                "type": "choice",
                "choice": choice,
                "confidence": confidence,
                "probabilities": {key: float(key == choice) for key in options},
            }
        },
    }


def ids(p):
    return set(request_body(p, "jev-1.13.0")["questions"]["next_action"]["criteria"])


def test_eligibility_keeps_the_prince_sensible():
    assert ids(packet(riding=True)) == {"return"}
    assert "return" not in ids(packet(player_speed=1.4))
    assert "lead" in ids(packet(player_speed=1.4, gap_m=1.2))
    assert "lead" not in ids(packet(player_speed=1.4, flying=True))
    assert "greet" in ids(packet(player_speed=0, gap_m=1.5))
    assert "greet" not in ids(packet(player_speed=0, gap_m=1.5, greeted_recently=True))
    assert eligible(packet().candidates[3], packet())


def test_ground_wait_conversation_and_indoor_catchup_match_the_physical_controller():
    assert ids(packet(flying=True, player_speed=4, gap_m=30)) == {"pause"}
    assert ids(packet(conversing=True, player_speed=0, gap_m=1)) == {"pause"}
    assert ids(packet(indoor=True, player_speed=0, gap_m=8)) == {"beside", "trail"}
    assert ids(packet(indoor=True, player_speed=0, gap_m=2.2)) == {"beside", "trail"}
    assert "lead" not in ids(packet(indoor=True, player_speed=1, gap_m=1))


def test_snapshot_rejects_unknown_actions_and_duplicates():
    with pytest.raises(ValidationError):
        packet(candidates=[{"id": "fly", "action": "teleport", "label": "x"}])
    with pytest.raises(ValidationError):
        packet(candidates=[CANDIDATES[0], CANDIDATES[0]])
    with pytest.raises(ValidationError):
        packet(candidates=[{"id": "return", "action": "beside", "label": "Conflicting action"}])


async def test_jev_controls_the_companion_stance_with_its_own_policy():
    async def handler(request):
        body = json.loads(request.content)
        assert "Prince Jev" in body["questions"]["next_action"]["instructions"]
        assert "fixture" not in json.dumps(body)
        return httpx.Response(200, json=reply(body, "trail"))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        engine = CompanionEngine(client, "fixture")
        result = await engine.decide(packet(player_speed=1.2, crowded=True))
    assert result["source"] == "jev" and result["candidate_id"] == "trail"
    assert engine.status["policy_version"] == "prince-companion-v3"
    assert engine.status["policy_sha256"] != AutoEngine().status["policy_sha256"]


async def test_low_confidence_is_not_presented_as_jev():
    async def handler(request):
        return httpx.Response(200, json=reply(json.loads(request.content), "lead", 0.2))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await CompanionEngine(client, "fixture").decide(packet(player_speed=1.2))
    assert result["source"] == "uncertain" and result["candidate_id"] is None


async def test_bridge_route_reports_unconfigured_and_shares_key_override():
    app = create_app(auto_engine=AutoEngine(), companion_engine=CompanionEngine())
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://127.0.0.1"
    ) as c:
        body = {"schema_version": 1, "tick": 0, "generation": 0, "candidates": CANDIDATES}
        result = (await c.post("/v1/companion", json=body)).json()
        assert result["source"] == "unavailable" and result["reason"] == "not_configured"
        assert (await c.get("/v1/companion")).json()["available"] is False
        await c.put("/v1/settings/jev", json={"api_key": "manual-fixture"})
        assert app.state.companion_engine.api_key == "manual-fixture"
        await c.delete("/v1/settings/jev")
        assert app.state.companion_engine.api_key is None
