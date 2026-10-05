"""The bridge spends paid API credits, so only loopback hosts may call it.

A website can point its own domain at 127.0.0.1 (DNS rebinding) and then make
same-origin requests to the bridge; the Host header still names its domain.
"""

import httpx
import pytest

from river_oaks.agents import DecisionEngine
from river_oaks.service import create_app


def client(app, host):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url=f"http://{host}")


@pytest.mark.parametrize(
    "host", ["rebind.attacker.example:8765", "attacker.example", "127.0.0.1.attacker.example"]
)
async def test_foreign_hosts_are_refused_before_any_route(host):
    engine = DecisionEngine(api_key="server-fixture")
    app = create_app(engine)
    async with client(app, host) as c:
        assert (await c.get("/health")).status_code == 400
        result = await c.put("/v1/settings/jev", json={"api_key": "attacker-key-0000000000"})
        assert result.status_code == 400
        assert engine.api_key == "server-fixture"


@pytest.mark.parametrize("host", ["127.0.0.1:8765", "localhost:5174", "127.0.0.1"])
async def test_loopback_hosts_are_served(host):
    app = create_app(DecisionEngine())
    async with client(app, host) as c:
        assert (await c.get("/health")).status_code == 200
