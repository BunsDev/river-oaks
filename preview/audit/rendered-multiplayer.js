// Explicit local capacity audit: one real renderer, N-1 transport actors.
// Never starts WorkOS, contacts a hosted town, or grants a fixture guest powers.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createNetServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import { platform, arch, cpus, loadavg } from 'node:os';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { WebSocket } from 'ws';
import { createGameServer } from '../../server/app.js';
import { createSharedWorld } from '../../server/world.js';
import { createMemoryWorldCatalog } from '../../server/world-catalog.js';
import { createMemoryLandmarks } from '../../server/landmarks.js';
import { createMemorySocial } from '../../server/social.js';
import { createMemoryGroups } from '../../server/groups.js';
import { createMemoryProfiles } from '../../server/profiles.js';
import { createMemoryEvents } from '../../server/events.js';
import { SHARED_APPEARANCES } from '../src/shared-appearances.js';
import { auditOptions, distribution, gestureWait } from './metrics.js';

const options = auditOptions(process.argv.slice(2));
const root = fileURLToPath(new URL('../../', import.meta.url));
const district = JSON.parse(await readFile(new URL('../public/data/district.json', import.meta.url)));
district.vegetation = JSON.parse(await readFile(new URL('../public/data/district-vegetation.json', import.meta.url)));
const appearances = SHARED_APPEARANCES.filter(look => look.character !== 'jevica' && look.form === 'human');
const sourceFiles = ['package-lock.json', 'preview/src/main.js', 'preview/src/render-audit.js', 'preview/src/render-pipeline.js',
  'preview/src/remote-players.js', 'preview/src/avatars.js', 'preview/src/romance-look.js',
  'preview/src/reference-archetypes.js', 'preview/src/costume-batching.js', 'server/app.js', 'server/world.js',
  'preview/audit/rendered-multiplayer.js', 'preview/audit/metrics.js'];
const source = { baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sha256: Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash('sha256').update(await readFile(`${root}/${file}`)).digest('hex')]))) };
const lock = JSON.parse(await readFile(`${root}/package-lock.json`));
const dependencies = Object.fromEntries(['three', 'ws', 'vite', 'playwright'].map(name => [name, lock.packages[`node_modules/${name}`].version]));
const report = { source, dependencies, createdAt: new Date().toISOString(), status: 'running', options,
  machine: { node: process.version, platform: `${platform()}/${arch()}`, cpu: cpus()[0]?.model, logicalCPUs: cpus().length, loadAverageAtStart: loadavg() },
  scope: 'Loopback in-memory authority; synthetic approved guest accounts; one Chromium renderer plus transport actors. Phone viewport uses the host GPU. No Redis, live WorkOS, hosted network, geographic load, or global readiness proof.', results: [] };
let browser, app, vite, movementTimer, gestureTimer;
const actors = new Map(), errors = [];
const abort = new AbortController();
const signals = new Map(['SIGINT', 'SIGTERM', 'SIGHUP'].map(signal => [signal, () => {
  process.exitCode = signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 129;
  abort.abort(new Error(`Audit interrupted by ${signal}`));
  void browser?.close().catch(() => {});
}]));
for (const [signal, handler] of signals) process.on(signal, handler);
const pause = ms => new Promise((resolve, reject) => {
  abort.signal.throwIfAborted();
  const stop = () => { clearTimeout(timer); reject(abort.signal.reason); };
  const timer = setTimeout(() => { abort.signal.removeEventListener('abort', stop); resolve(); }, ms);
  abort.signal.addEventListener('abort', stop, { once: true });
});
async function port() {
  const listener = createNetServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const value = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return value;
}
const identity = req => {
  const match = /(?:^|;\s*)render_audit=(viewer|actor-\d+)(?:;|$)/.exec(req.headers.cookie ?? '');
  return match ? { userId: match[1], name: `Audit ${match[1]}`, sessionId: match[1], csrfToken: 'render-audit-csrf', expiresAt: Date.now() + 3600000 } : null;
};
async function flush() { await mkdir(dirname(options.output), { recursive: true }); await writeFile(options.output, JSON.stringify(report, null, 2) + '\n'); }
let town, origin, world;
async function connectActor(index) {
  const id = `actor-${index}`, started = performance.now();
  const response = await fetch(`${town}/api/multiplayer/ticket`, { method: 'POST', headers: { Origin: origin, Cookie: `render_audit=${id}`, 'X-CSRF-Token': 'render-audit-csrf' }, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]) });
  assert.equal(response.status, 200, `Actor ticket ${id}`);
  const { ticket } = await response.json();
  const ws = new WebSocket(`${town.replace('http:', 'ws:')}/multiplayer?ticket=${ticket}`, { headers: { Origin: origin, Cookie: `render_audit=${id}` } });
  const actor = { id, ws, errors: 0, corrections: 0, commands: 0, pending: new Map(), home: null, expectedClose: false };
  actors.set(id, actor);
  ws.on('error', error => { actor.errors++; errors.push(`${id}: ${error.message}`); });
  ws.on('close', code => { if (!actor.expectedClose && !abort.signal.aborted) errors.push(`${id}: unexpected close ${code}`); });
  ws.on('message', raw => {
    const data = JSON.parse(raw);
    if (data.type === 'snapshot' && !actor.home) actor.home = data.players.find(player => player.id === id)?.position;
    if (data.type === 'result') {
      if (data.correction) actor.corrections++;
      const pending = actor.pending.get(data.requestId);
      if (pending) { actor.pending.delete(data.requestId); pending(data); }
    }
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${id} did not receive its admission snapshot`)), 15000);
    const onMessage = raw => { if (JSON.parse(raw).selfId === id) { clearTimeout(timer); ws.off('message', onMessage); resolve(); } };
    ws.on('message', onMessage);
    ws.once('error', error => { clearTimeout(timer); reject(error); });
    ws.once('close', code => { if (!actor.home) { clearTimeout(timer); reject(new Error(`${id} admission closed ${code}`)); } });
    ws.once('unexpected-response', (_request, res) => { clearTimeout(timer); reject(new Error(`${id} upgrade HTTP ${res.statusCode}`)); });
  });
  const joinMs = performance.now() - started;
  const look = appearances[index % appearances.length].id;
  assert.equal((await command(actor, { type: 'appearance', appearance: look })).ok, true);
  for (const type of ['build', 'wish']) {
    const result = await command(actor, { type, isAdmin: true, canBuild: true, canGrantWishes: true });
    assert.equal(result.ok, false); assert.equal(result.error, 'admin_only');
  }
  return { actor, joinMs };
}
function command(actor, message) {
  const requestId = `audit-${++actor.commands}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { actor.pending.delete(requestId); reject(new Error(`${actor.id}: ${message.type} timed out`)); }, 10000);
    actor.pending.set(requestId, result => { clearTimeout(timer); resolve(result); });
    actor.ws.send(JSON.stringify({ ...message, requestId }));
  });
}
async function converge(page, count) {
  await page.waitForFunction(count => {
    const town = window.__riverMultiplayer?.(), remotes = town?.remotes ?? [];
    return town?.connected && town.snapshot?.players.length === count && remotes.length === count - 1
      && remotes.every(player => player.ready) && document.querySelector('#canvas-host')?.dataset.playerReady === 'true';
  }, count, { timeout: 90000 });
  const permissions = await page.evaluate(() => window.__riverMultiplayer().snapshot.players.map(player => [player.canBuild, player.canGrantWishes]));
  assert.ok(permissions.every(([build, wish]) => build === false && wish === false), 'Synthetic guests must never receive admin capabilities');
}
async function closeActors({ immediate = false } = {}) {
  for (const actor of actors.values()) { actor.expectedClose = true; if (immediate) app?.disconnectUser(actor.id); actor.ws.terminate(); }
  actors.clear();
}
// Instrument only the browser's real received frames and gesture round trips.
// The scene's development hook measures animation-loop intervals and CPU work.
function browserTransport() {
  let active = false, previous = null, samples, pending = new Map();
  const NativeSocket = window.WebSocket;
  window.WebSocket = class extends NativeSocket {
    constructor(...args) {
      super(...args);
      this.auditSocket = String(args[0]).includes('/multiplayer?');
      if (!this.auditSocket) return;
      this.addEventListener('message', event => {
        if (!active) return;
        const frame = JSON.parse(event.data), now = performance.now();
        if (frame.type === 'snapshot') {
          if (previous !== null) samples.gaps.push(now - previous);
          previous = now; samples.snapshots++; samples.bytes += new TextEncoder().encode(event.data).length;
        }
        if (frame.type === 'result' && pending.has(frame.requestId)) {
          const sent = pending.get(frame.requestId); pending.delete(frame.requestId);
          samples.commands.push(now - sent); samples.commandLog.push({ sentMs: sent, ackMs: now, error: frame.error ?? null }); if (!frame.ok) samples.rejections.push(frame.error ?? frame.message);
        }
      });
      this.addEventListener('close', () => { if (active) samples.closes++; });
    }
    send(raw) {
      if (!this.auditSocket) return super.send(raw);
      const frame = JSON.parse(raw);
      if (active && frame.type === 'gesture' && frame.requestId) pending.set(frame.requestId, performance.now());
      return super.send(raw);
    }
  };
  window.__auditTransport = {
    start() { active = true; previous = null; pending = new Map(); samples = { gaps: [], commands: [], snapshots: 0, bytes: 0, closes: 0, rejections: [], commandLog: [] }; },
    get pending() { return pending.size; },
    stop() { active = false; return { ...samples, pending: pending.size }; },
  };
}
try {
  await mkdir(`${root}/output/playwright`, { recursive: true });
  const webPort = await port(); origin = `http://127.0.0.1:${webPort}`;
  world = createSharedWorld(district);
  const auth = { authenticate: async req => identity(req), async handle(req, res) {
    if (!req.url.startsWith('/auth/')) return false;
    const user = identity(req); res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/auth/session') res.end(JSON.stringify(user ? { authenticated: true, user: { id: user.userId, name: user.name }, csrfToken: user.csrfToken, canGrantWishes: false } : { authenticated: false }));
    else { res.statusCode = 404; res.end('{}'); } return true;
  } };
  app = createGameServer({ auth, world, origin, waitlist: { async isApproved() { return true; }, async request(user) { return { userId: user.userId, name: user.name, status: 'approved' }; } },
    worldCatalog: createMemoryWorldCatalog(), landmarks: createMemoryLandmarks(), social: createMemorySocial(), groups: createMemoryGroups(), profiles: createMemoryProfiles(), events: createMemoryEvents() });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  town = `http://127.0.0.1:${app.server.address().port}`;
  const proxy = Object.fromEntries(['/auth', '/api'].map(path => [path, town]));
  proxy['/multiplayer'] = { target: town.replace('http:', 'ws:'), ws: true };
  vite = await createViteServer({ configFile: false, root: `${root}/preview`, cacheDir: `${root}/.runtime/render-audit-vite`,
    define: { 'import.meta.env.VITE_MULTIPLAYER': JSON.stringify('required') }, server: { host: '127.0.0.1', port: webPort, strictPort: true, proxy } });
  await vite.listen();
  browser = await chromium.launch({ headless: true, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false, args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
  report.browser = browser.version();
  for (const profile of [{ name: 'desktop', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, { name: 'phone-viewport', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }]) {
    const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor });
    await context.addCookies([{ name: 'render_audit', value: 'viewer', url: origin }]);
    await context.addInitScript(quality => localStorage.setItem('river-oaks-graphics', quality), options.quality);
    await context.addInitScript(browserTransport);
    await context.route('**/v1/**', route => route.fulfill({ status: 503, json: { source: 'unavailable', reason: 'audit_fixture' } }));
    const page = await context.newPage(); page.setDefaultTimeout(90000);
    page.on('pageerror', error => errors.push(`Browser: ${error.message}`));
    await page.goto(`${origin}/?play=multiplayer&motion-debug=1&render-audit=1`, { waitUntil: 'domcontentloaded' });
    await converge(page, 1);
    if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
    movementTimer = setInterval(() => {
      const phase = performance.now() / 1000;
      for (const [id, actor] of actors) if (actor.home && actor.ws.readyState === WebSocket.OPEN) {
        const [x, north, ground] = actor.home, index = Number(id.split('-')[1]);
        actor.ws.send(JSON.stringify({ type: 'pose', position: [x + Math.sin(phase + index) * .2, north, ground], yaw: Math.cos(phase + index), altitude: 0 }));
      }
    }, 100);
    gestureTimer = setInterval(() => { for (const actor of actors.values()) if (actor.ws.readyState === WebSocket.OPEN) actor.ws.send(JSON.stringify({ type: 'gesture', kind: 'wave' })); }, 2500);
    for (const count of options.players) {
      const joins = [], convergenceStart = performance.now();
      while (actors.size < count - 1) joins.push((await connectActor(actors.size)).joinMs);
      await converge(page, count);
      const browserConvergenceMs = Math.round(performance.now() - convergenceStart);
      const settleStart = performance.now();
      await page.evaluate(() => window.__riverRenderAudit.crowdView());
      await pause(options.warmup * 1000);
      await page.waitForFunction(() => { const progress = JSON.parse(document.querySelector('#viewport').dataset.assetProgress ?? '{}'); return progress.done; }, null, { timeout: 90000 });
      const assetState = await page.locator('#viewport').getAttribute('data-asset-progress');
      assert.equal(JSON.parse(assetState).failed, 0, 'Asset failures invalidate a rendering baseline');
      const before = await page.evaluate(() => window.__riverRenderAudit.graphics());
      assert.ok(!/SwiftShader|llvmpipe|Software|Microsoft Basic Render/i.test(before.renderer), `Hardware performance audit refuses software renderer: ${before.renderer}`);
      console.log(`${profile.name}: measuring ${count} players (${before.renderer}, ${options.quality})`);
      const warmupMs = Math.round(performance.now() - settleStart);
      const measurementStart = performance.now();
      await page.evaluate(() => { window.__auditTransport.start(); window.__riverRenderAudit.start(); });
      // These are the real UI command handlers, even when the People tab is closed.
      const deadline = performance.now() + options.seconds * 1000;
      while (performance.now() < deadline) {
        await page.evaluate(() => document.querySelector('.multiplayer-gesture-controls button').click());
        await page.waitForFunction(() => window.__auditTransport.pending === 0, null, { timeout: 10000 });
        // The server applies its 1.5 s cooldown when processing a command, not
        // when the browser sends it. Space from the ack even under queue load.
        const wait = gestureWait(deadline - performance.now());
        await pause(wait.delayMs);
        if (wait.finish) break;
      }
      const measuredSeconds = (performance.now() - measurementStart) / 1000;
      const sample = await page.evaluate(() => ({ timing: window.__riverRenderAudit.stop(), transport: window.__auditTransport.stop(), graphics: window.__riverRenderAudit.graphics(),
        onScreenPeers: [...document.querySelectorAll('.remote-player-label')].filter(label => !label.hidden).length,
        peers: window.__riverMultiplayer().remotes, npcs: window.__riverMultiplayer().snapshot.locals.length, visibility: document.visibilityState }));
      report.lastSample = sample;
      assert.equal(sample.timing.overflow, false); assert.equal(sample.visibility, 'visible');
      assert.equal(sample.onScreenPeers, count - 1, 'All peer landmarks must fit in the crowd view');
      assert.equal(sample.peers.length, count - 1); assert.ok(sample.peers.every(peer => peer.ready));
      assert.equal(sample.transport.closes, 0); assert.deepEqual(sample.transport.rejections, []); assert.equal(sample.transport.pending, 0);
      assert.equal(sample.npcs, 98); assert.ok(sample.graphics.render.calls > 0);
      if (count === 32) await page.screenshot({ path: `${root}/output/playwright/render-audit-${profile.name}-32.png` });
      const row = { profile, players: count, seconds: Math.round(measuredSeconds * 100) / 100, npcs: sample.npcs,
        joined: joins.length, join: joins.length ? distribution(joins) : null, browserConvergenceMs, warmupMs,
        frame: distribution(sample.timing.frames.map(frame => frame.intervalMs)), cpuSubmission: distribution(sample.timing.frames.map(frame => frame.cpuMs)),
        framesOver33Ms: sample.timing.frames.filter(frame => frame.intervalMs > 33.34).length, framesOver50Ms: sample.timing.frames.filter(frame => frame.intervalMs > 50).length,
        snapshots: sample.transport.snapshots, snapshotGap: distribution(sample.transport.gaps), decodedSnapshotBytesPerSecond: Math.round(sample.transport.bytes / measuredSeconds),
        gestureAck: distribution(sample.transport.commands), loadedPeers: sample.peers.length, onScreenPeers: sample.onScreenPeers,
        graphicsBefore: before, graphicsAfter: sample.graphics, assets: JSON.parse(assetState), actorCorrections: [...actors.values()].reduce((sum, actor) => sum + actor.corrections, 0) };
      // Reconnect a peer in the room at capacity. Preserve its authenticated ID,
      // and wait for the same loaded roster rather than counting socket opens.
      if (actors.size) {
        const actor = [...actors.values()].at(-1), start = performance.now();
        actor.expectedClose = true; actor.ws.terminate(); actors.delete(actor.id);
        await connectActor(Number(actor.id.split('-')[1])); await converge(page, count);
        row.reconnectMs = Math.round(performance.now() - start);
      }
      assert.deepEqual(errors, []); delete report.lastSample; report.results.push(row); await flush();
      console.log(`${profile.name} ${count}: frame p95 ${row.frame.p95Ms} ms; snapshot p95 ${row.snapshotGap.p95Ms} ms; ${row.onScreenPeers}/${row.loadedPeers} peer labels in view`);
    }
    clearInterval(movementTimer); clearInterval(gestureTimer); movementTimer = gestureTimer = null;
    const departureStart = performance.now();
    await closeActors(); await converge(page, 1);
    report.results.at(-1).departureConvergenceMs = Math.round(performance.now() - departureStart);
    await pause(3000);
    report.results.at(-1).resourceSettleMs = 3000;
    report.results.at(-1).afterPeersLeave = await page.evaluate(() => ({ peers: window.__riverMultiplayer().remotes.length, graphics: window.__riverRenderAudit.graphics() }));
    assert.equal(report.results.at(-1).afterPeersLeave.peers, 0);
    await page.screenshot({ path: `${root}/output/playwright/render-audit-${profile.name}-cleanup.png` });
    await context.close(); app.disconnectUser('viewer'); await flush();
  }
  assert.deepEqual(errors, []); report.status = 'passed';
} catch (error) {
  report.status = abort.signal.aborted ? 'interrupted' : 'failed'; report.error = error.stack; report.browserErrors = errors;
  process.exitCode ||= 1; console.error(error.stack);
  for (const page of browser?.contexts().flatMap(context => context.pages()) ?? []) {
    report.diagnostics = await page.evaluate(() => ({ access: document.querySelector('#access-status')?.textContent,
      connection: document.querySelector('#connection')?.textContent, player: document.querySelector('#canvas-host')?.dataset.playerReady,
      town: window.__riverMultiplayer?.(), assets: document.querySelector('#viewport')?.dataset.assetProgress })).catch(() => null);
    await page.screenshot({ path: `${root}/output/playwright/render-audit-failure.png` }).catch(() => {});
  }
} finally {
  clearInterval(movementTimer); clearInterval(gestureTimer);
  await closeActors({ immediate: true }); await browser?.close(); await vite?.close(); await app?.close();
  for (const [signal, handler] of signals) process.removeListener(signal, handler);
  await flush();
}
