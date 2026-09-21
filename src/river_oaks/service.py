"""Loopback-only bridge. API keys never enter the Unreal project or agent packets."""

import asyncio
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, Response

from .agents import DecisionEngine, Snapshot
from .auto import AutoEngine, AutoSnapshot
from .geo import digest
from .voice import LocalVoice, VoiceBusy, VoiceRequest, VoiceUnavailable


def create_app(engine=None, *, world_path=None, report_path=None, voice=None, auto_engine=None):
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
            yield

    app = FastAPI(title="River Oaks decision bridge", lifespan=lifespan)
    app.state.engine = engine or DecisionEngine()
    app.state.auto_engine = auto_engine or AutoEngine()
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
        return JSONResponse(app.state.auto_engine.status, headers={"Cache-Control": "no-store"})

    @app.post("/v1/auto")
    async def auto_decision(packet: AutoSnapshot):
        return JSONResponse(
            await app.state.auto_engine.decide(packet), headers={"Cache-Control": "no-store"}
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
