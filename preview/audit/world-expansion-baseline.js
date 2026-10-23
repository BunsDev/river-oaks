// Reproducible local baseline for #580. Uses the existing fixture's identities,
// revision selection and real loopback HTTP/WebSocket transports.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, loadavg, platform, arch } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
import { startBrowserFixture } from '../e2e/fixture-server.js';
import { distribution } from './metrics.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Capture provenance only after the queue wait, when the measured source is loaded.
const release = await holdBrowserLock('world expansion baseline');
const output = join(root, '.runtime/world-expansion', `baseline-${new Date().toISOString().replaceAll(':', '-')}`);
const files = ['preview/public/data/district.json', 'preview/public/data/world-manifest.json',
  'preview/src/world-manifest.js', 'preview/src/district-interior-contract.js', 'preview/src/garden-campus-district.js',
  'preview/src/main.js', 'preview/src/render-audit.js', 'preview/src/walking.js', 'preview/src/world-surface.js',
  'server/district-data.js', 'server/world.js', 'shared/east-garden-commons-layout.js',
  'preview/audit/world-expansion-baseline.js', 'pnpm-lock.yaml'];
const report = {
  status: 'running', startedAt: new Date().toISOString(),
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceSha256: Object.fromEntries(await Promise.all(files.map(async file => [file, createHash('sha256').update(await readFile(join(root, file))).digest('hex')]))),
  machine: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, loadAverage: loadavg() },
  scope: 'Local Chromium development build, Gardens revision, fixture accounts and in-memory loopback authority. Phone-sized viewport uses the same desktop GPU, not physical mobile hardware. Resource bytes include Vite development modules, not a production initial-download budget. Two-player samples render two full browser clients concurrently on this host. GPU memory bytes, live auth, hosted performance and human accessibility are not measured.',
  quality: 'sharp', reducedMotion: 'reduce', sampleDurationMs: 30000, samplesPerWorkload: 3, warmupMs: 5000, profiles: [],
};
let browser, fixture;
await mkdir(output, { recursive: true });
const flush = () => writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
  browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
  report.browser = browser.version();
  const district = JSON.parse(await readFile(join(root, 'preview/public/data/district.json')));
  const [x, north, height] = district.walkSpawn;
  report.camera = { position: [x, height + 2.4, -north + 5], target: [x, height + 1.4, -north - 12], fov: 55 };
  for (const profile of [
    { name: 'desktop', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 },
    { name: 'phone-viewport', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  ]) {
    const row = { ...profile, status: 'running', samples: [], errors: [] };
    report.profiles.push(row); await flush();
    fixture = await startBrowserFixture({ env: { RIVER_OAKS_DISTRICT_REVISION: 'river-oaks-gardens-3' } });
    const contexts = [];
    async function joinPlayer(identity) {
      const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, reducedMotion: 'reduce' });
      contexts.push(context);
      await context.addCookies([{ name: 'fixture_session', value: identity, url: fixture.origin }]);
      await context.addInitScript(() => {
        localStorage.setItem('river-oaks-graphics', 'sharp');
        performance.setResourceTimingBufferSize(10000);
        window.__expansionSockets = [];
        const NativeSocket = window.WebSocket;
        window.WebSocket = class extends NativeSocket {
          constructor(...args) {
            super(...args);
            if (new URL(args[0], location.href).pathname === '/multiplayer') window.__expansionSockets.push(this);
          }
        };
      });
      const page = await context.newPage(); page.setDefaultTimeout(120000);
      page.on('pageerror', error => row.errors.push(error.message));
      const started = performance.now();
      await page.goto(`${fixture.origin}/?motion-debug=1&render-audit=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => {
        const town = window.__riverMultiplayer?.();
        return town?.connected && town.snapshot?.players.some(player => player.id === town.selfId)
          && document.querySelector('#canvas-host')?.dataset.playerReady === 'true';
      });
      const joinReadyMs = performance.now() - started;
      await page.waitForFunction(() => JSON.parse(document.querySelector('#viewport')?.dataset.assetProgress ?? '{}').done);
      const assets = JSON.parse(await page.locator('#viewport').getAttribute('data-asset-progress'));
      assert.equal(assets.failed, 0, 'Asset failures invalidate the baseline');
      if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
      await page.evaluate(camera => window.__riverRenderAudit.view(camera), report.camera);
      return { page, joinReadyMs, assetReadyMs: performance.now() - started, assets };
    }
    try {
      const owner = await joinPlayer('owner'); row.ownerJoinReadyMs = owner.joinReadyMs; row.ownerAssetReadyMs = owner.assetReadyMs;
      row.assets = owner.assets;
      row.resources = await owner.page.evaluate(() => {
        const entries = performance.getEntriesByType('resource');
        return { count: entries.length, transferBytes: entries.reduce((n, e) => n + e.transferSize, 0), decodedBodyBytes: entries.reduce((n, e) => n + e.decodedBodySize, 0) };
      });
      const sample = async (count, iteration) => {
        await owner.page.waitForTimeout(report.warmupMs);
        const before = await owner.page.evaluate(() => window.__riverRenderAudit.graphics());
        assert.ok(!/SwiftShader|llvmpipe|Software|Microsoft Basic Render/i.test(before.renderer), `Software renderer: ${before.renderer}`);
        await owner.page.evaluate(() => window.__riverRenderAudit.start());
        await owner.page.waitForTimeout(report.sampleDurationMs);
        const data = await owner.page.evaluate(() => ({ timing: window.__riverRenderAudit.stop(), graphics: window.__riverRenderAudit.graphics(),
          players: window.__riverMultiplayer().snapshot.players.length, heap: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize } : null }));
        assert.equal(data.timing.overflow, false); assert.equal(data.timing.discontinuities ?? 0, 0);
        assert.equal(data.players, count); assert.ok(data.graphics.render.calls > 0);
        const screenshot = `${profile.name}-${count}-players-${iteration}.png`;
        await owner.page.screenshot({ path: join(output, screenshot) });
        row.samples.push({ players: count, iteration, before, after: data.graphics, heap: data.heap,
          frame: distribution(data.timing.frames.map(frame => frame.intervalMs)), cpuSubmission: distribution(data.timing.frames.map(frame => frame.cpuMs)),
          screenshot, loadAverage: loadavg() });
        await flush();
      };
      for (let iteration = 1; iteration <= report.samplesPerWorkload; iteration++) await sample(1, iteration);
      const peer = await joinPlayer('alice'); row.peerJoinReadyMs = peer.joinReadyMs;
      await owner.page.waitForFunction(() => window.__riverMultiplayer().snapshot.players.length === 2);
      await peer.page.waitForFunction(() => window.__riverMultiplayer().snapshot.players.length === 2);
      for (let iteration = 1; iteration <= report.samplesPerWorkload; iteration++) await sample(2, iteration);
      row.medians = [1, 2].map(players => {
        const samples = row.samples.filter(sample => sample.players === players);
        return { players, frameP95Ms: distribution(samples.map(sample => sample.frame.p95Ms)).p50Ms,
          cpuSubmissionP95Ms: distribution(samples.map(sample => sample.cpuSubmission.p95Ms)).p50Ms };
      });
      const before = await owner.page.evaluate(() => {
        const town = window.__riverMultiplayer();
        return { id: town.selfId, player: town.snapshot.players.find(player => player.id === town.selfId), sockets: window.__expansionSockets.length };
      });
      const rejoinStarted = performance.now();
      await owner.page.evaluate(() => window.__expansionSockets.at(-1).close());
      await owner.page.waitForFunction(prior => {
        const socket = window.__expansionSockets.at(-1), town = window.__riverMultiplayer();
        return window.__expansionSockets.length > prior.sockets && socket.readyState === WebSocket.OPEN && town.connected
          && town.selfId === prior.id && town.snapshot?.players.some(player => player.id === prior.id);
      }, before);
      row.reconnectMs = performance.now() - rejoinStarted;
      const after = await owner.page.evaluate(() => { const town = window.__riverMultiplayer(); return town.snapshot.players.find(player => player.id === town.selfId); });
      row.reconnectPositionDeltaM = Math.hypot(...after.position.map((value, axis) => value - before.player.position[axis]));
      assert.ok(row.reconnectPositionDeltaM < 0.5, 'Reconnect moved the stationary player');
      assert.deepEqual(row.errors, []);
      row.status = 'passed';
    } finally { for (const context of contexts) await context.close(); await fixture.close(); fixture = null; await flush(); }
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.stack; process.exitCode = 1;
  const current = report.profiles.at(-1); if (current?.status === 'running') current.status = 'failed';
} finally {
  await browser?.close(); await fixture?.close(); release();
  report.finishedAt = new Date().toISOString(); await flush();
  console.log(JSON.stringify({ status: report.status, report: join(output, 'report.json'), error: report.error }));
}
