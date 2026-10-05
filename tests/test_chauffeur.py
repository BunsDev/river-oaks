import json

import httpx
import pytest
from pydantic import ValidationError

from river_oaks.chauffeur import ChauffeurEngine, ChauffeurSnapshot
from river_oaks.service import create_app


def packet(**changes):
    return ChauffeurSnapshot.model_validate(
        {
            "schema_version": 1,
            "tick": 2,
            "generation": 1,
            "vehicle": "rolls",
            "speed": 1,
            "remaining_m": 40,
            "turn_radians": 0,
            "road_clear": True,
            "candidates": [
                {"id": a, "action": a, "label": a} for a in ["cruise", "slow", "yield", "stop"]
            ],
            **changes,
        }
    )


def test_policy_removes_unsafe_driving_actions():
    engine = ChauffeurEngine()

    def choices(p):
        return set(engine.request_body(p)["state"]["candidates"])

    assert choices(packet(road_clear=False)) == {"yield", "stop"}
    assert choices(packet(remaining_m=1)) == {"stop"}
    assert "cruise" not in choices(packet(turn_radians=0.8))
    with pytest.raises(ValidationError):
        packet(speed=float("nan"))
    with pytest.raises(ValidationError):
        packet(candidates=[{"id": "cruise", "action": "stop", "label": "mismatch"}])


async def test_provider_and_bridge_control_driving_without_exposing_keys():
    async def handler(request):
        body = json.loads(request.content)
        assert request.url == "https://api.typesafe.ai/v1/systemone"
        assert "secret-fixture" not in json.dumps(body)
        criteria = body["questions"]["next_action"]["criteria"]
        return httpx.Response(
            200,
            json={
                "model": "jev-1.13.0",
                "answers": {
                    "next_action": {
                        "type": "choice",
                        "choice": "cruise",
                        "confidence": 0.9,
                        "probabilities": {key: float(key == "cruise") for key in criteria},
                    }
                },
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as provider:
        engine = ChauffeurEngine(provider)
        app = create_app(chauffeur_engine=engine)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app), base_url="http://127.0.0.1"
        ) as client:
            data = packet().model_dump()
            assert (await client.post("/v1/chauffeur", json=data)).json()[
                "reason"
            ] == "not_configured"
            await client.put("/v1/settings/jev", json={"api_key": "secret-fixture"})
            result = await client.post("/v1/chauffeur", json=data)
            assert result.json()["source"] == "jev"
            assert result.json()["candidate_id"] == "cruise"
            assert "secret-fixture" not in result.text
            await client.delete("/v1/settings/jev")
            assert engine.api_key is None


def test_comprehensive_controls_obey_direction_clearance_and_parking():
    engine = ChauffeurEngine()
    candidates = [{"id": a, "action": a, "label": a} for a in engine.thresholds]

    def choices(**changes):
        p = packet(candidates=candidates, **changes)
        return set(engine.request_body(p)["state"]["candidates"])

    assert "accelerate" in choices(speed=0)
    assert "turn_left" in choices(turn_radians=0.8)
    assert "turn_right" not in choices(turn_radians=0.8)
    assert choices(road_clear=False) == {"stop", "brake", "yield"}
    assert "reverse" in choices(recovery=True, rear_clear=True, speed=0)
    assert "reverse" not in choices(recovery=True, rear_clear=False, speed=0)
    assert choices(remaining_m=1) == {"stop", "brake", "park"}
