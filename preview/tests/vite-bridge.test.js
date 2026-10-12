import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { bridgeDevServer } from '../vite-bridge.js';

async function listen(server, port = 0) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server.address().port;
}
async function close(server) {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
async function fixture(t, port, timeoutMs = 1000) {
  let middleware;
  const warnings = [];
  bridgeDevServer({ port, timeoutMs }).configureServer({
    config: { logger: { warn: message => warnings.push(message) } },
    middlewares: { use: handler => { middleware = handler; } },
  });
  const server = createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end('unhandled'); }));
  const origin = `http://127.0.0.1:${await listen(server)}`;
  t.after(() => close(server));
  return { origin, warnings };
}

test('offline bridge returns explicit failures once per outage and recovers without restart', async t => {
  const bridge = createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"source":"none"}'); });
  const port = await listen(bridge);
  await close(bridge);
  const { origin, warnings } = await fixture(t, port);
  for (const path of ['/v1/settings/jev', '/v1/settings/elevenlabs', '/health']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'bridge_unavailable');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /uv run river-oaks serve/);
  const failedWrite = await fetch(origin + '/v1/settings/jev', { method: 'PUT', body: '{"api_key":"synthetic-fixture"}' });
  assert.equal(failedWrite.status, 503);
  assert.equal(warnings.length, 1);
  assert.ok(!warnings.join().includes('synthetic-fixture'));
  await listen(bridge, port);
  t.after(() => close(bridge));
  const recovered = await fetch(origin + '/v1/settings/jev');
  assert.equal(recovered.status, 200);
  assert.deepEqual(await recovered.json(), { source: 'none' });
  await close(bridge);
  assert.equal((await fetch(origin + '/health')).status, 503);
  assert.equal(warnings.length, 2);
});

test('bridge forwards method, query, body, response status and binary content', async t => {
  const bridge = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    assert.equal(req.method, 'POST'); assert.equal(req.url, '/v1/speech?voice=fixture'); assert.equal(body, 'fixture text');
    res.writeHead(202, { 'Content-Type': 'audio/wav' }); res.end(Buffer.from([0, 255, 1, 128]));
  });
  const port = await listen(bridge); t.after(() => close(bridge));
  const { origin, warnings } = await fixture(t, port);
  const response = await fetch(origin + '/v1/speech?voice=fixture', { method: 'POST', body: 'fixture text' });
  assert.equal(response.status, 202); assert.equal(response.headers.get('content-type'), 'audio/wav');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from([0, 255, 1, 128]));
  assert.deepEqual(warnings, []);
  for (const path of ['/api/profile', '/health-other', '/v10/settings']) assert.equal((await fetch(origin + path)).status, 404);
});

test('an unresponsive bridge has a bounded failure', async t => {
  const bridge = createServer(() => {});
  const port = await listen(bridge); t.after(() => close(bridge));
  const { origin, warnings } = await fixture(t, port, 50);
  const response = await fetch(origin + '/v1/settings/jev');
  assert.equal(response.status, 503); assert.equal((await response.json()).error, 'bridge_unavailable');
  assert.equal(warnings.length, 1);
});

test('Vite handles bridge outages without its generic proxy stack trace', async t => {
  const { createServer: createVite, createLogger } = await import('vite');
  const { default: config } = await import('../vite.config.js');
  const bridge = createServer();
  const port = await listen(bridge); await close(bridge);
  const errors = [], warnings = [];
  const logger = createLogger('silent');
  logger.error = message => errors.push(message);
  logger.warn = message => warnings.push(message);
  const vite = await createVite({
    ...config, configFile: false, customLogger: logger,
    plugins: [bridgeDevServer({ port })],
    server: { ...config.server, port: 0, strictPort: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  t.after(() => vite.close());
  await vite.listen();
  for (const path of ['/v1/settings/jev', '/v1/settings/elevenlabs']) {
    const response = await fetch(`http://127.0.0.1:${vite.httpServer.address().port}${path}`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'bridge_unavailable');
  }
  assert.deepEqual(errors, []);
  assert.equal(warnings.filter(message => message.includes('Optional decision/voice bridge')).length, 1);
});

test('only loopback pages reach the bridge: rebinding hosts and other sites are refused', async t => {
  let calls = 0;
  const bridge = createServer((req, res) => { calls++; res.end('{"ok":true}'); });
  const port = await listen(bridge);
  t.after(() => close(bridge));
  const { origin } = await fixture(t, port);
  const send = headers => new Promise((resolve, reject) => {
    const url = new URL('/v1/settings/elevenlabs', origin);
    const req = request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'text/plain', ...headers } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end('{}');
  });
  const { port: vitePort } = new URL(origin);
  for (const headers of [{ host: `attacker.example:${vitePort}` }, { host: `127.0.0.1:${vitePort}`, origin: 'https://attacker.example' },
    { host: `127.0.0.1:${vitePort}`, origin: 'null' }, { host: `localhost.attacker.example:${vitePort}` }])
    assert.equal(await send(headers), 403, JSON.stringify(headers));
  assert.equal(calls, 0, 'refused requests never reach the bridge');
  for (const headers of [{ host: `127.0.0.1:${vitePort}`, origin: `http://127.0.0.1:${vitePort}` }, { host: `localhost:${vitePort}` }, { host: `[::1]:${vitePort}`, origin: `http://[::1]:${vitePort}` }])
    assert.equal(await send(headers), 200, JSON.stringify(headers));
  assert.equal(calls, 3);
});
