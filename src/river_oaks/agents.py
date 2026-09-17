"""Stateless micro-action classification with bounded latency and deterministic safety."""

import asyncio
import math
import random
import time
from collections import deque
from functools import lru_cache
from typing import Annotated, Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field, model_validator

Finite = Annotated[float, Field(allow_inf_nan=False)]
Identifier = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.:-]+$")]
ACTIONS = {
    "continue": "Continue current local activity",
    "pause": "Pause briefly",
    "greet": "Greet a nearby pedestrian",
    "redirect": "Reverse local walking direction",
    "seek_shelter": "Pause outdoors and request nearby shelter navigation",
    "slow": "Slow movement in rain or humid heat",
    "stop": "Stop for a local hazard",
}


class Packet(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Nearby(Packet):
    id: Identifier
    kind: Annotated[str, Field(max_length=32)]
    distance_m: Annotated[Finite, Field(ge=0, le=1000)]


class Agent(Packet):
    id: Identifier
    kind: Literal[
        "resident", "jogger", "dog_walker", "landscaper", "delivery", "vehicle", "pedestrian"
    ]
    position: tuple[Finite, Finite, Finite]
    activity: Annotated[str, Field(max_length=64)]
    nearby: Annotated[list[Nearby], Field(max_length=16)] = []
    vehicle_distance_m: Annotated[Finite, Field(ge=0)] | None = None
    blocked: bool = False


class Weather(Packet):
    rain: Annotated[Finite, Field(ge=0, le=1)] = 0
    humidity: Annotated[Finite, Field(ge=0, le=1)] = 0.7
    storm: bool = False


class Snapshot(Packet):
    schema_version: Literal[1]
    tick: Annotated[int, Field(ge=0)]
    agents: Annotated[list[Agent], Field(min_length=1, max_length=500)]
    weather: Weather
    hour: Annotated[Finite, Field(ge=0, lt=24)]

    @model_validator(mode="after")
    def unique_ids(self):
        if len({a.id for a in self.agents}) != len(self.agents):
            raise ValueError("Duplicate agent IDs")
        return self


def safety_stop(agent):
    return agent.blocked or (agent.vehicle_distance_m is not None and agent.vehicle_distance_m < 5)


def local_action(agent, weather, hour):
    if safety_stop(agent):
        return "stop"
    if weather.storm and agent.kind != "vehicle":
        return "seek_shelter"
    if hour < 6 or hour >= 22 or (agent.kind == "jogger" and 11 <= hour < 17):
        return "pause"
    if weather.rain > 0.5 or (weather.humidity > 0.85 and agent.kind != "vehicle"):
        return "slow"
    return "continue"


@lru_cache(maxsize=4096)
def daily_schedule(agent_id, day):
    """Generated once per agent/day, outside the reactive decision loop."""
    rng = random.Random(f"{agent_id}:{day}")
    return (
        {"hour": 0, "activity": "home"},
        {"hour": 6 + rng.random() * 2, "activity": "walk"},
        {"hour": 9, "activity": "errand"},
        {"hour": 17 + rng.random(), "activity": "walk"},
        {"hour": 20, "activity": "home"},
    )


class DecisionEngine:
    def __init__(
        self,
        client=None,
        api_key=None,
        model="jev-1.13.0",
        batch_size=32,
        concurrency=4,
        deadline_s=0.75,
    ):
        if not 1 <= batch_size <= 32 or not 1 <= concurrency <= 8 or deadline_s <= 0:
            raise ValueError("Invalid decision budget")
        self.client, self.api_key, self.model = client, api_key, model
        self.batch_size, self.deadline_s = batch_size, deadline_s
        self.semaphore = asyncio.Semaphore(concurrency)
        self.starts = deque()
        self.metrics = {"requests": 0, "batches": 0, "fallback_agents": 0, "failed_batches": 0}

    @property
    def mode(self):
        return "jev" if self.api_key and self.client else "local_rules"

    async def _batch(self, agents, packet):
        async with self.semaphore:
            now = time.monotonic()
            while self.starts and self.starts[0] < now - 1:
                self.starts.popleft()
            # No automatic retry queue: obsolete reactions must never accumulate.
            if len(self.starts) >= 15:
                return {}
            self.starts.append(now)
            self.metrics["batches"] += 1
            body = {
                "model": self.model,
                "state": {
                    "agents": {a.id: a.model_dump() for a in agents},
                    "weather": packet.weather.model_dump(),
                    "hour": packet.hour,
                },
                "questions": {
                    a.id: {
                        "type": "choice",
                        "criteria": ACTIONS,
                        "instructions": f"Choose the immediate local micro-action for agent {a.id} "
                        f"using state.agents['{a.id}'] and current weather. "
                        "Do not plan a schedule. "
                        "Vehicles must obey local road constraints; never greet or seek shelter.",
                    }
                    for a in agents
                },
            }
            try:
                response = await self.client.post(
                    "https://api.typesafe.ai/v1/systemone",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=body,
                    timeout=self.deadline_s,
                )
                response.raise_for_status()
                answers = response.json()["answers"]
                if not isinstance(answers, dict):
                    raise ValueError("Invalid answers")
                results = {}
                for agent in agents:
                    answer = answers.get(agent.id, {})
                    if not isinstance(answer, dict):
                        continue
                    choice, confidence = answer.get("choice"), answer.get("confidence")
                    if (
                        not isinstance(choice, str)
                        or choice not in ACTIONS
                        or not isinstance(confidence, (float, int))
                        or not math.isfinite(confidence)
                        or not 0.6 <= confidence <= 1
                        or answer.get("type") != "choice"
                    ):
                        continue
                    if agent.kind == "vehicle" and choice in {"greet", "seek_shelter"}:
                        continue
                    results[agent.id] = choice
                return results
            except (httpx.HTTPError, ValueError, KeyError, TypeError):
                self.metrics["failed_batches"] += 1
                return {}

    async def decide(self, packet):
        started = time.monotonic()
        self.metrics["requests"] += 1
        answers = {}
        if self.mode == "jev":
            # Rotate priority so rate/deadline limits do not permanently starve the tail.
            offset = (packet.tick * self.batch_size) % len(packet.agents)
            ordered = packet.agents[offset:] + packet.agents[:offset]
            tasks = [
                asyncio.create_task(self._batch(ordered[i : i + self.batch_size], packet))
                for i in range(0, len(ordered), self.batch_size)
            ]
            try:
                done, _ = await asyncio.wait(tasks, timeout=self.deadline_s)
                for task in done:
                    answers.update(task.result())
            finally:
                for task in tasks:
                    if not task.done():
                        task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
        decisions = []
        for agent in packet.agents:
            action, source = answers.get(agent.id), "jev"
            if action is None:
                action, source = local_action(agent, packet.weather, packet.hour), "local_rules"
                self.metrics["fallback_agents"] += 1
            elif safety_stop(agent):
                action, source = "stop", "safety_override"
            decisions.append({"id": agent.id, "action": action, "source": source})
        return {
            "schema_version": 1,
            "tick": packet.tick,
            "decisions": decisions,
            "latency_ms": (time.monotonic() - started) * 1000,
        }
