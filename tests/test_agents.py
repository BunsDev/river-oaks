import asyncio

import httpx
import pytest
from pydantic import ValidationError

from river_oaks.agents import DecisionEngine, Snapshot, daily_schedule
from river_oaks.service import create_app


def snapshot(count=3, **overrides):
    value = {
        "schema_version": 1,
        "tick": 7,
        "hour": 17,
        "weather": {"rain": 0, "humidity": 0.8, "storm": False},
        "agents": [
            {
                "id": f"npc-{i}",
                "kind": "resident",
                "position": [i, 0, 0],
                "activity": "walk",
                "nearby": [],
                "blocked": False,
                "vehicle_distance_m": None,
            }
            for i in range(count)
        ],
    }
    value.update(overrides)
    return Snapshot.model_validate(value)


async def test_local_rules_cover_weather_and_collision():
    packet = snapshot()
    packet.agents[0].blocked = True
    packet.agents[1].vehicle_distance_m = 2
    packet.weather.storm = True
    engine = DecisionEngine()
    result = await engine.decide(packet)
    assert [d["action"] for d in result["decisions"]] == ["stop", "stop", "seek_shelter"]
    assert all(d["source"] == "local_rules" for d in result["decisions"])


async def test_jev_batches_reference_agent_and_local_safety_overrides():
    calls = []

    async def respond(request):
        import json

        body = json.loads(request.content)
        calls.append(body)
        assert request.headers["authorization"] == "Bearer test-key"
        assert request.url.path == "/v1/systemone"
        for key, question in body["questions"].items():
            assert key in question["instructions"]
        return httpx.Response(
            200,
            json={
                "answers": {
                    key: {"type": "choice", "choice": "continue", "confidence": 0.95}
                    for key in body["questions"]
                }
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        engine = DecisionEngine(client=client, api_key="test-key", batch_size=2)
        packet = snapshot(5)
        packet.agents[0].blocked = True
        result = await engine.decide(packet)
    assert len(calls) == 3
    assert result["tick"] == 7
    assert result["decisions"][0] == {"id": "npc-0", "action": "stop", "source": "safety_override"}
    assert result["decisions"][1]["source"] == "jev"


async def test_timeouts_keep_500_agents_and_bound_parallelism():
    active = peak = 0

    async def slow(request):
        nonlocal active, peak
        active += 1
        peak = max(active, peak)
        try:
            await asyncio.sleep(1)
        finally:
            active -= 1
        return httpx.Response(200, json={})

    async with httpx.AsyncClient(transport=httpx.MockTransport(slow)) as client:
        engine = DecisionEngine(client=client, api_key="test", deadline_s=0.03, concurrency=2)
        result = await engine.decide(snapshot(500))
    assert len(result["decisions"]) == 500
    assert peak <= 2
    assert all(d["source"] == "local_rules" for d in result["decisions"])


async def test_malformed_and_missing_jev_answers_fall_back_per_agent():
    async def bad(request):
        return httpx.Response(
            200,
            json={
                "answers": {
                    "npc-0": {"type": "choice", "choice": "teleport", "confidence": 1},
                    "npc-1": {"type": "choice", "choice": "pause", "confidence": 0.9},
                }
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(bad)) as client:
        result = await DecisionEngine(client=client, api_key="test").decide(snapshot())
    assert [d["source"] for d in result["decisions"]] == ["local_rules", "jev", "local_rules"]


def test_packets_reject_duplicate_ids_nonfinite_positions_and_oversize():
    for change in (
        lambda p: p["agents"].append(p["agents"][0]),
        lambda p: p["agents"][0].update(position=[float("nan"), 0, 0]),
    ):
        p = snapshot().model_dump()
        change(p)
        with pytest.raises(ValidationError):
            Snapshot.model_validate(p)
    with pytest.raises(ValidationError):
        snapshot(501)


async def test_http_health_and_decisions():
    app = create_app(DecisionEngine())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as c:
        assert (await c.get("/health")).json()["mode"] == "local_rules"
        response = await c.post("/v1/decisions", json=snapshot().model_dump())
        assert response.status_code == 200
        assert len(response.json()["decisions"]) == 3


def test_daily_schedule_is_stable_and_covers_day():
    schedule = daily_schedule("npc-2", 42)
    assert schedule == daily_schedule("npc-2", 42)
    assert schedule[0]["hour"] == 0
    assert all(0 <= entry["hour"] < 24 for entry in schedule)


async def test_local_service_preserves_sleep_and_midday_jogger_pause():
    packet = snapshot(1, hour=2)
    assert (await DecisionEngine().decide(packet))["decisions"][0]["action"] == "pause"
    packet.hour = 14
    packet.agents[0].kind = "jogger"
    assert (await DecisionEngine().decide(packet))["decisions"][0]["action"] == "pause"


async def test_concurrent_service_requests_fail_fast_instead_of_queueing():
    entered, release = asyncio.Event(), asyncio.Event()

    class WaitingEngine(DecisionEngine):
        async def decide(self, packet):
            entered.set()
            await release.wait()
            return await super().decide(packet)

    app = create_app(WaitingEngine())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as c:
        first = asyncio.create_task(c.post("/v1/decisions", json=snapshot().model_dump()))
        await entered.wait()
        second = await c.post("/v1/decisions", json=snapshot().model_dump())
        release.set()
        assert (await first).status_code == 200
        assert second.status_code == 503


async def test_batch_budget_rotates_so_last_agents_are_not_permanently_starved():
    import json

    async def respond(request):
        questions = json.loads(request.content)["questions"]
        return httpx.Response(
            200,
            json={
                "answers": {
                    key: {"type": "choice", "choice": "continue", "confidence": 0.9}
                    for key in questions
                }
            },
        )

    fallback_sets = []
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        for tick in (0, 1):
            # Fresh budget represents each tick after the one-second rate window expires.
            engine = DecisionEngine(client=client, api_key="test-key")
            result = await engine.decide(snapshot(500, tick=tick))
            fallback_sets.append(
                {d["id"] for d in result["decisions"] if d["source"] == "local_rules"}
            )
    assert all(len(ids) == 20 for ids in fallback_sets)
    assert fallback_sets[0].isdisjoint(fallback_sets[1])
