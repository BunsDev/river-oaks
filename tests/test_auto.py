import asyncio
import json

import httpx
import pytest
from pydantic import ValidationError

from river_oaks.auto import AutoEngine, AutoSnapshot, eligible, parse_choice, request_body
from river_oaks.auto_eval import curriculum
from river_oaks.service import create_app


def packet(**changes):
    return AutoSnapshot.model_validate(
        {
            "schema_version": 1,
            "tick": 4,
            "generation": 2,
            "candidates": [
                {
                    "id": "ask-person",
                    "action": "ask",
                    "label": "Meet Maya",
                    "target_id": "person",
                    "distance_m": 2,
                },
                {"id": "wait", "action": "wait", "label": "Wait"},
            ],
            **changes,
        }
    )


def response(body, **changes):
    options = body["questions"]["next_action"]["criteria"]
    return {
        "model": "jev-1.13.0",
        "answers": {
            "next_action": {
                "type": "choice",
                "choice": next(iter(options)),
                "confidence": 0.95,
                "probabilities": {key: float(i == 0) for i, key in enumerate(options)},
                **changes,
            }
        },
    }


async def test_remote_choice_uses_domain_context_and_never_receives_credentials_in_state():
    async def handler(request):
        body = json.loads(request.content)
        assert request.headers["Authorization"] == "Bearer fixture"
        assert "fixture" not in json.dumps(body)
        assert "domain_examples" in body["state"]
        assert "state.candidates" in body["questions"]["next_action"]["instructions"]
        return httpx.Response(200, json=response(body))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await AutoEngine(client, "fixture").decide(packet())
    assert result["source"] == "jev"
    assert result["candidate_id"] == "ask-person"
    assert result["tick"] == 4 and result["generation"] == 2


@pytest.mark.parametrize(
    "changes,reason",
    [
        ({"confidence": 0.2}, "low_confidence"),
        ({"confidence": True}, "invalid_answer"),
        ({"choice": "invented"}, "invalid_answer"),
        ({"probabilities": {"ask-person": 0.2}}, "invalid_answer"),
        ({"probabilities": {"ask-person": 0.1, "wait": 0.9}}, "invalid_answer"),
        ({"type": "noul"}, "invalid_answer"),
    ],
)
async def test_bad_or_uncertain_answers_never_execute(changes, reason):
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200, json=response(json.loads(request.content), **changes)
            )
        )
    ) as client:
        result = await AutoEngine(client, "fixture").decide(packet())
    assert result["candidate_id"] is None and result["reason"] == reason


async def test_deadline_cancels_provider_and_concurrent_calls_do_not_queue():
    started, cancelled = asyncio.Event(), asyncio.Event()

    async def handler(request):
        started.set()
        try:
            await asyncio.sleep(10)
        finally:
            cancelled.set()

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        engine = AutoEngine(client, "fixture", deadline_s=0.04)
        pending = asyncio.create_task(engine.decide(packet()))
        await started.wait()
        assert (await engine.decide(packet()))["reason"] == "busy"
        assert (await pending)["reason"] == "timeout"
        assert cancelled.is_set()


def test_eligibility_excludes_weather_distance_and_resource_violations():
    base = packet()
    ask = base.candidates[0]
    assert eligible(ask, base)
    assert not eligible(ask, packet(storm=True))
    assert not eligible(ask.model_copy(update={"distance_m": 2.81}), base)
    supply = ask.model_copy(update={"action": "supply", "known": True, "needs_help": True})
    ready = packet(running=True, supplies_available=True, visits_available=True)
    assert eligible(supply, ready)
    for changes in [{"running": False}, {"finished": True}, {"supplies_available": False}]:
        assert not eligible(supply, ready.model_copy(update=changes))
    for changes in [{"known": False}, {"needs_help": False}, {"cooldown": True}]:
        assert not eligible(supply.model_copy(update=changes), ready)
    assert set(
        request_body(packet(storm=True), "jev-1.13.0")["questions"]["next_action"]["criteria"]
    ) == {"wait"}


async def test_unconfigured_http_and_validation_are_explicit():
    app = create_app(auto_engine=AutoEngine())
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://127.0.0.1"
    ) as c:
        assert (await c.get("/v1/auto")).json()["available"] is False
        result = (await c.post("/v1/auto", json=packet().model_dump())).json()
        assert result["candidate_id"] is None and result["reason"] == "not_configured"
        bad = packet().model_dump()
        bad["candidates"] *= 2
        assert (await c.post("/v1/auto", json=bad)).status_code == 422
    with pytest.raises(ValidationError):
        packet(candidates=[{"id": "a", "label": "bad", "action": "teleport"}])


def test_rounded_probability_mass_is_accepted_but_bad_distribution_is_not():
    body = request_body(packet(), "jev-1.13.0")
    body["questions"]["next_action"]["criteria"]["wait"] = {"action": "wait"}
    options = body["questions"]["next_action"]["criteria"]
    rounded = response(body, probabilities={"ask-person": 0.8, "wait": 0.21})
    assert parse_choice(rounded, options, 0.75)[0] == "ask-person"
    with pytest.raises(ValueError):
        parse_choice(response(body, probabilities={"ask-person": 0.8, "wait": 0.3}), options, 0.75)


def test_curriculum_labels_are_eligible_and_never_leak_into_inference():
    cases = curriculum()
    assert len({case["id"] for case in cases}) == len(cases)
    assert len({case["family"] for case in cases}) >= 30
    dev, holdout = [], []
    for case in cases:
        snapshot = AutoSnapshot.model_validate(case["packet"])
        allowed = {c.id for c in snapshot.candidates if eligible(c, snapshot)}
        assert set(case["expected"]) <= allowed
        body = request_body(snapshot, "jev-1.13.0")
        assert "expected" not in body["state"] and "family" not in body["state"]
        (dev if case["split"] == "development" else holdout).append(case["id"])
    assert set(dev).isdisjoint(holdout)


async def test_quality_status_rejects_stale_or_non_live_evidence(tmp_path, monkeypatch):
    from river_oaks.auto import POLICY_SHA256

    monkeypatch.chdir(tmp_path)
    path = tmp_path / "data/reports/jev-auto-eval.json"
    path.parent.mkdir(parents=True)
    report = {
        "mode": "live_jev",
        "split": "holdout",
        "passed": True,
        "model": "jev-1.13.0",
        "policy_sha256": POLICY_SHA256,
        "created_at": "fixture",
        "dataset_sha256": "fixture",
        "metrics": {
            "cases": 96,
            "coverage": 1,
            "accepted_accuracy": 1,
            "raw_accuracy": 1,
            "invalid_actions": 0,
        },
        "competitive_metrics": {"cases": 30, "coverage": 1, "accepted_accuracy": 1},
    }
    app = create_app(auto_engine=AutoEngine())
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://127.0.0.1"
    ) as c:
        path.write_text(json.dumps(report))
        assert (await c.get("/v1/auto")).json()["quality"] == "evaluated_on_heldout_scenarios"
        for changes in [
            {"policy_sha256": "old"},
            {"model": "other"},
            {"mode": "mock"},
            {"split": "development"},
            {"passed": False},
            {"competitive_metrics": {}},
        ]:
            path.write_text(json.dumps({**report, **changes}))
            assert (await c.get("/v1/auto")).json()["quality"] == "live_evaluation_required"
