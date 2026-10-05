"""Loopback bridge. Credentials stay out of Unreal assets and agent packets."""

import asyncio
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .agents import DecisionEngine, Snapshot
from .auto import AutoEngine, AutoSnapshot
from .chauffeur import ChauffeurEngine, ChauffeurSnapshot
from .companion import CompanionEngine, CompanionSnapshot
from .elevenlabs_voice import (
    ElevenLabsUnavailable,
    ElevenLabsVoice,
    JevVoiceRequest,
    JevVoiceSelection,
)
from .geo import digest
from .voice import LocalVoice, VoiceBusy, VoiceRequest, VoiceUnavailable


def create_app(
    engine=None,
    *,
    world_path=None,
    report_path=None,
    voice=None,
    auto_engine=None,
    companion_engine=None,
    chauffeur_engine=None,
    elevenlabs_voice=None,
):
    world_path = Path(world_path or "unreal/Content/Data/world.json")
    report_path = Path(report_path or "data/reports/verification.json")

    def artifact(path):
        try:
            if path.stat().st_size > 64 * 1024 * 1024:
                raise HTTPException(413, "Generated artifact exceeds the preview size limit")
            return json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            raise HTTPException(404, "Generate the world and verification report first") from None
        except (OSError, ValueError):
            raise HTTPException(503, "Generated artifact is temporarily unavailable") from None

    @asynccontextmanager
    async def lifespan(app):
        if engine is not None:
            yield
            return
        async with httpx.AsyncClient() as client:
            app.state.engine = DecisionEngine(
                client,
                os.environ.get("TYPESAFE_API_KEY"),
                model=os.environ.get("JEV_MODEL", "jev-1.13.0"),
            )
            if auto_engine is None:
                app.state.auto_engine = AutoEngine(
                    client,
                    os.environ.get("TYPESAFE_API_KEY"),
                    model=os.environ.get("JEV_AUTO_MODEL", "jev-1.13.0"),
                )
            if companion_engine is None:
                app.state.companion_engine = CompanionEngine(
                    client,
                    os.environ.get("TYPESAFE_API_KEY"),
                    model=os.environ.get("JEV_AUTO_MODEL", "jev-1.13.0"),
                )
            if chauffeur_engine is None:
                app.state.chauffeur_engine = ChauffeurEngine(
                    client,
                    os.environ.get("TYPESAFE_API_KEY"),
                    model=os.environ.get("JEV_AUTO_MODEL", "jev-1.13.0"),
                )
            if elevenlabs_voice is None:
                app.state.elevenlabs_voice = ElevenLabsVoice(
                    client, os.environ.get("ELEVENLABS_API_KEY")
                )
            yield

    app = FastAPI(title="River Oaks decision bridge", lifespan=lifespan)
    # The bridge spends paid API credits and changes settings, and binding to
    # loopback alone does not stop a website that points its own domain at
    # 127.0.0.1 (DNS rebinding): its requests still name that domain in Host.
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])
    app.state.engine = engine or DecisionEngine()
    app.state.auto_engine = auto_engine or AutoEngine()
    app.state.companion_engine = companion_engine or CompanionEngine()
    app.state.chauffeur_engine = chauffeur_engine or ChauffeurEngine()
    app.state.elevenlabs_voice = elevenlabs_voice or ElevenLabsVoice()
    original_voice_key = None
    voice_override = False
    original_keys = None

    def jev_settings():
        configured = bool(
            app.state.engine.api_key
            or app.state.auto_engine.api_key
            or app.state.companion_engine.api_key
            or app.state.chauffeur_engine.api_key
        )
        source = "manual" if original_keys is not None else "server" if configured else "none"
        return JSONResponse(
            {"source": source, "configured": configured}, headers={"Cache-Control": "no-store"}
        )

    @app.get("/v1/settings/jev")
    async def get_jev_settings():
        return jev_settings()

    @app.put("/v1/settings/jev")
    async def override_jev_key(request: Request):
        nonlocal original_keys
        if request.headers.get("content-type", "").split(";", 1)[0] != "application/json":
            raise HTTPException(415, "Use application/json")
        # Validate without reflecting credential values in FastAPI validation errors.
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 8192:
                raise HTTPException(400, "Invalid API key")
        try:
            payload = json.loads(body)
        except (ValueError, UnicodeError):
            raise HTTPException(400, "Invalid API key") from None
        if not isinstance(payload, dict) or set(payload) != {"api_key"}:
            raise HTTPException(400, "Invalid API key")
        key = payload["api_key"]
        if not isinstance(key, str):
            raise HTTPException(400, "Invalid API key")
        key = key.strip()
        if not 1 <= len(key) <= 4096 or not all(33 <= ord(char) <= 126 for char in key):
            raise HTTPException(400, "Invalid API key")
        if original_keys is None:
            original_keys = (
                app.state.engine.api_key,
                app.state.auto_engine.api_key,
                app.state.companion_engine.api_key,
                app.state.chauffeur_engine.api_key,
            )
        app.state.engine.api_key = key
        app.state.auto_engine.api_key = key
        app.state.companion_engine.api_key = key
        app.state.chauffeur_engine.api_key = key
        return jev_settings()

    @app.delete("/v1/settings/jev")
    async def clear_jev_override():
        nonlocal original_keys
        if original_keys is not None:
            (
                app.state.engine.api_key,
                app.state.auto_engine.api_key,
                app.state.companion_engine.api_key,
                app.state.chauffeur_engine.api_key,
            ) = original_keys
            original_keys = None
        return jev_settings()

    def elevenlabs_settings():
        voice = app.state.elevenlabs_voice
        return JSONResponse(
            {
                "configured": bool(voice.api_key),
                "source": "manual" if voice_override else "server" if voice.api_key else "none",
                "voice_id": voice.voice_id,
            },
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/v1/settings/elevenlabs")
    async def get_elevenlabs_settings():
        return elevenlabs_settings()

    @app.put("/v1/settings/elevenlabs")
    async def set_elevenlabs_key(request: Request):
        nonlocal original_voice_key, voice_override
        if request.headers.get("content-type", "").split(";", 1)[0] != "application/json":
            raise HTTPException(415, "Use application/json")
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 8192:
                raise HTTPException(400, "Invalid API key")
        try:
            payload = json.loads(body)
        except (ValueError, UnicodeError):
            raise HTTPException(400, "Invalid API key") from None
        if not isinstance(payload, dict) or set(payload) != {"api_key"}:
            raise HTTPException(400, "Invalid API key")
        key = payload["api_key"]
        if not isinstance(key, str) or not 1 <= len(key.strip()) <= 4096:
            raise HTTPException(400, "Invalid API key")
        key = key.strip()
        if not all(33 <= ord(char) <= 126 for char in key):
            raise HTTPException(400, "Invalid API key")
        voice = app.state.elevenlabs_voice
        if not voice_override:
            original_voice_key = voice.api_key
        voice_override = True
        voice.set_key(key)
        return elevenlabs_settings()

    @app.delete("/v1/settings/elevenlabs")
    async def reset_elevenlabs_key():
        nonlocal voice_override
        if voice_override:
            app.state.elevenlabs_voice.set_key(original_voice_key)
            voice_override = False
        return elevenlabs_settings()

    @app.put("/v1/settings/elevenlabs/voice")
    async def select_elevenlabs_voice(packet: JevVoiceSelection):
        app.state.elevenlabs_voice.set_voice(packet.voice_id)
        return elevenlabs_settings()

    @app.post("/v1/voice/jev")
    async def jev_speech(packet: JevVoiceRequest):
        try:
            audio = await app.state.elevenlabs_voice.speak(packet)
        except ElevenLabsUnavailable as error:
            raise HTTPException(503, str(error)) from None
        return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})

    busy = asyncio.Lock()
    local_voice = voice or LocalVoice()

    @app.get("/v1/voice")
    async def voice_status():
        return {
            "available": local_voice.available,
            "model": "Kokoro-82M int8",
            "local": True,
            "busy": local_voice.busy,
            "remote_inference": False,
        }

    @app.post("/v1/voice")
    async def speech(packet: VoiceRequest):
        try:
            audio = await local_voice.speak(packet)
        except VoiceBusy:
            raise HTTPException(
                503, "Local voice busy; try again shortly", headers={"Retry-After": "1"}
            ) from None
        except VoiceUnavailable:
            raise HTTPException(503, "Local voice unavailable; select device voices") from None
        return Response(audio, media_type="audio/wav", headers={"Cache-Control": "no-store"})

    @app.get("/health")
    async def health():
        return {"status": "ok", "mode": app.state.engine.mode, "metrics": app.state.engine.metrics}

    @app.get("/v1/auto")
    async def auto_status():
        status = dict(app.state.auto_engine.status)
        evidence_path = Path("data/reports/jev-auto-eval.json")
        try:
            if evidence_path.stat().st_size <= 1024 * 1024:
                evidence = json.loads(evidence_path.read_text())
                metrics = evidence.get("metrics", {})
                competitive = evidence.get("competitive_metrics", {})
                if (
                    evidence.get("mode") == "live_jev"
                    and evidence.get("split") == "holdout"
                    and evidence.get("passed") is True
                    and evidence.get("policy_sha256") == status["policy_sha256"]
                    and evidence.get("model") == status["model"]
                    and metrics.get("cases", 0) >= 96
                    and metrics.get("coverage", 0) >= 0.9
                    and metrics.get("accepted_accuracy", 0) >= 0.95
                    and metrics.get("raw_accuracy", 0) >= 0.95
                    and metrics.get("invalid_actions", -1) == 0
                    and competitive.get("cases", 0) >= 30
                    and competitive.get("coverage", 0) >= 0.9
                    and competitive.get("accepted_accuracy", 0) >= 0.95
                ):
                    status.update(
                        quality="evaluated_on_heldout_scenarios",
                        evaluation={
                            "created_at": evidence["created_at"],
                            "metrics": metrics,
                            "competitive_metrics": competitive,
                            "dataset_sha256": evidence["dataset_sha256"],
                        },
                    )
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            pass
        return JSONResponse(status, headers={"Cache-Control": "no-store"})

    @app.post("/v1/auto")
    async def auto_decision(packet: AutoSnapshot):
        return JSONResponse(
            await app.state.auto_engine.decide(packet), headers={"Cache-Control": "no-store"}
        )

    @app.get("/v1/companion")
    async def companion_status():
        return JSONResponse(
            dict(app.state.companion_engine.status), headers={"Cache-Control": "no-store"}
        )

    @app.post("/v1/companion")
    async def companion_decision(packet: CompanionSnapshot):
        return JSONResponse(
            await app.state.companion_engine.decide(packet), headers={"Cache-Control": "no-store"}
        )

    @app.get("/v1/chauffeur")
    async def chauffeur_status():
        return JSONResponse(
            dict(app.state.chauffeur_engine.status), headers={"Cache-Control": "no-store"}
        )

    @app.post("/v1/chauffeur")
    async def chauffeur_decision(packet: ChauffeurSnapshot):
        return JSONResponse(
            await app.state.chauffeur_engine.decide(packet), headers={"Cache-Control": "no-store"}
        )

    @app.get("/v1/world")
    def world():
        return JSONResponse(artifact(world_path), headers={"Cache-Control": "no-store"})

    @app.get("/v1/verification")
    def verification():
        report = artifact(report_path)
        if report.get("world_sha256") != digest(artifact(world_path)):
            raise HTTPException(409, "Verification report is stale; rerun river-oaks verify")
        return JSONResponse(report, headers={"Cache-Control": "no-store"})

    @app.post("/v1/decisions")
    async def decisions(packet: Snapshot):
        if busy.locked():
            raise HTTPException(503, "Previous batch still running; use local fallback")
        async with busy:
            return await app.state.engine.decide(packet)

    return app
