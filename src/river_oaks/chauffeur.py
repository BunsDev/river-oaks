"""Bounded Jev driving decisions; client code owns route tracking and collisions."""

import hashlib
import json
from importlib.resources import files
from typing import Annotated, Literal

from pydantic import Field, model_validator

from .agents import Finite, Packet
from .auto import AutoEngine

CONFIG = json.loads(files("river_oaks").joinpath("chauffeur-policy.json").read_text())
POLICY = CONFIG["instructions"]
Action = Literal[
    "cruise",
    "slow",
    "yield",
    "stop",
    "accelerate",
    "turn_left",
    "turn_right",
    "brake",
    "reverse",
    "park",
]


class ChauffeurCandidate(Packet):
    id: Action
    action: Action
    label: Annotated[str, Field(max_length=100)]


class ChauffeurSnapshot(Packet):
    schema_version: Literal[1]
    tick: Annotated[int, Field(ge=0)]
    generation: Annotated[int, Field(ge=0)]
    vehicle: Literal["rolls", "motorcycle"]
    speed: Annotated[Finite, Field(ge=0, le=20)]
    remaining_m: Annotated[Finite, Field(ge=0, le=100000)]
    turn_radians: Annotated[Finite, Field(ge=-3.142, le=3.142)]
    road_clear: bool
    rear_clear: bool = False
    recovery: bool = False
    candidates: Annotated[list[ChauffeurCandidate], Field(min_length=1, max_length=10)]

    @model_validator(mode="after")
    def bounded_candidates(self):
        if len({c.id for c in self.candidates}) != len(self.candidates):
            raise ValueError("Duplicate actions")
        if any(c.id != c.action for c in self.candidates):
            raise ValueError("Action must match candidate ID")
        return self


class ChauffeurEngine(AutoEngine):
    policy_version = CONFIG["version"]
    policy_sha256 = hashlib.sha256(POLICY.encode()).hexdigest()
    thresholds = CONFIG["thresholds"]

    def request_body(self, packet):
        allowed = {"stop", "brake"}
        if packet.remaining_m < 2:
            allowed.add("park")
        else:
            allowed.add("yield")
            if packet.road_clear and not packet.recovery:
                allowed.add("slow")
                if packet.turn_radians > 0.12:
                    allowed.add("turn_left")
                if packet.turn_radians < -0.12:
                    allowed.add("turn_right")
                if abs(packet.turn_radians) < 0.35 and packet.remaining_m > 10:
                    allowed.add("cruise")
                if abs(packet.turn_radians) < 0.15 and packet.remaining_m > 20 and packet.speed < 4:
                    allowed.add("accelerate")
            if packet.recovery and packet.rear_clear and packet.speed < 0.5:
                allowed.add("reverse")
        descriptions = {c.id: c.model_dump() for c in packet.candidates if c.id in allowed}
        return {
            "model": self.model,
            "state": {
                **packet.model_dump(exclude={"candidates", "tick", "generation"}),
                "candidates": descriptions,
            },
            "questions": {
                "next_action": {"type": "choice", "instructions": POLICY, "criteria": descriptions}
            },
        }
