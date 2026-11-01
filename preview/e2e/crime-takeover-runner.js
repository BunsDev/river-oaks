// Writer takeover in front of a browser (#599 / #640 increment 5). Two Redis-coordinated world
// processes (server/tests/takeover-world.js) share one town through an isolated Redis; a loopback
// TCP proxy on the Vite town port decides which one the page reaches. The journey
// (preview/e2e/crime-takeover.js) kills the writer mid-pursuit; the proxy switches to the other
// process and the browsers reconnect through it. Fixture identities only, no live provider.
//   REDIS_URL=redis://127.0.0.1:<port>/<db> node preview/e2e/crime-takeover-runner.js
import { spawn } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import Redis from 'ioredis';
import { chromium } from 'playwright';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
if (!process.env.REDIS_URL) throw new Error('REDIS_URL names the isolated Redis the two worlds share');
const namespace = `river-oaks:takeover-test:${randomUUID()}`;
const report = { createdAt: new Date().toISOString(), status: 'running', namespace, scope: 'Loopback fixture identities, two world processes on one isolated Redis behind a switching proxy; no live provider or hosted service acceptance.', results: [] };
const interruption = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => interruption.abort(new Error(`${signal} received`)));

const freePort = () => new Promise((resolve, reject) => { const socket = createServer(); socket.once('error', reject); socket.listen(0, '127.0.0.1', () => { const { port } = socket.address(); socket.close(() => resolve(port)); }); });
const children = [], logs = [];
const waitForLine = (child, test, what, ms = 60000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${what}: no ready line within ${ms} ms`)), ms);
  const onData = chunk => { for (const line of String(chunk).split('\n')) { if (line.trim()) logs.push(`[${what}] ${line}`); const found = test(line); if (found) { clearTimeout(timer); child.stdout.off('data', onData); resolve(found); } } };
  child.stdout.on('data', onData);
  child.once('exit', code => { clearTimeout(timer); reject(new Error(`${what} exited with ${code} before it was ready`)); });
});
const startWorld = async (label, port, origin) => {
  const child = spawn(process.execPath, ['server/tests/takeover-world.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: String(port), RIVER_OAKS_TEST_ORIGIN: origin, RIVER_OAKS_TAKEOVER_NAMESPACE: namespace, RIVER_OAKS_TAKEOVER_LABEL: label, NODE_ENV: 'development', VERCEL: '' } });
  children.push(child);
  child.stderr.on('data', chunk => { for (const line of String(chunk).split('\n')) if (line.trim()) logs.push(`[world ${label} stderr] ${line}`); });
  const ready = await waitForLine(child, line => { try { const value = JSON.parse(line); return value.event === 'takeover_world_listening' ? value : null; } catch { return null; } }, `world ${label}`);
  return { label, port, child, pid: ready.pid, exited: new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal, at: Date.now() }))) };
};
// A plain TCP relay: every page connection (HTTP and the multiplayer socket) reaches the current target.
const startProxy = async (port, initialTarget) => {
  let target = initialTarget; const sockets = new Set(); const switches = [];
  const server = createServer(client => {
    const upstream = connect(target, '127.0.0.1');
    sockets.add(client); sockets.add(upstream);
    const end = () => { client.destroy(); upstream.destroy(); sockets.delete(client); sockets.delete(upstream); };
    client.on('error', end); upstream.on('error', end); client.on('close', end); upstream.on('close', end);
    client.pipe(upstream); upstream.pipe(client);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { port, get target() { return target; }, switches,
    switchTo(next) { target = next; switches.push({ at: Date.now(), to: next, dropped: sockets.size }); for (const socket of sockets) socket.destroy(); sockets.clear(); },
    close: () => new Promise(resolve => { for (const socket of sockets) socket.destroy(); server.close(() => resolve()); }) };
};

const releaseBrowserLock = await holdBrowserLock('crime takeover journey', { signal: interruption.signal });
const redis = new Redis(process.env.REDIS_URL);
let browser = null, proxy = null, vite = null;
const reportPath = join(root, 'data/reports', process.env.RIVER_OAKS_SHARED_REPORT ?? 'crime-takeover-shared.json');
try {
  await mkdir(join(root, 'output/playwright'), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  if (await redis.ping() !== 'PONG') throw new Error('Redis did not answer');
  const [web, town, portA, portB] = [await freePort(), await freePort(), await freePort(), await freePort()];
  const origin = `http://127.0.0.1:${web}`;
  const worlds = { A: await startWorld('A', portA, origin), B: await startWorld('B', portB, origin) };
  proxy = await startProxy(town, portA);
  // Vite serves the page and proxies /auth, /api/* and /multiplayer to the town port, where the relay listens
  // (RIVER_OAKS_DEV_TOWN=off: no in-process development town).
  vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'preview/vite.config.js', '--port', String(web)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'development', VERCEL: '', RIVER_OAKS_ACCEPTANCE_FIXTURE: '1', RIVER_OAKS_DEV_TOWN: 'off', RIVER_OAKS_TEST_WEB_PORT: String(web), RIVER_OAKS_DEV_TOWN_PORT: String(town), VITE_WORLD_MAP: 'false', VITE_SHARED_SOFTWARE_RENDERING: '' } });
  children.push(vite);
  vite.stderr.on('data', chunk => { for (const line of String(chunk).split('\n')) if (line.trim()) logs.push(`[vite stderr] ${line}`); });
  await waitForLine(vite, line => /Local:.*127\.0\.0\.1/.test(line) || /ready in/.test(line) ? line : null, 'vite');
  for (let attempt = 0; attempt < 60; attempt++) { try { const response = await fetch(`${origin}/auth/session`); if (response.ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 500)); }
  report.ports = { web, town, worldA: portA, worldB: portB };
  browser = await chromium.launch({ headless: true, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false, args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
  const probe = await browser.newPage();
  report.renderer = await probe.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); if (!gl) throw new Error('A working WebGL2 context is required.'); const info = gl.getExtension('WEBGL_debug_renderer_info'); const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); gl.getExtension('WEBGL_lose_context')?.loseContext(); return renderer; });
  await probe.close();
  console.log(`Takeover renderer (chromium): ${report.renderer}; worlds A ${portA} (pid ${worlds.A.pid}) and B ${portB} (pid ${worlds.B.pid}) behind ${town}; page ${origin}`);
  const leaseKeys = async () => redis.keys(`*${namespace}*lease*`);
  const lease = async () => { const keys = await leaseKeys(); const values = await Promise.all(keys.map(key => redis.get(key))); return Object.fromEntries(keys.map((key, index) => [key.replace(`{${namespace}}`, '').replace(namespace, ''), values[index]])); };
  // The journey's handle on the harness: who is live, the lease, and the failover itself.
  const control = { origin, worlds: { A: { port: portA, pid: worlds.A.pid }, B: { port: portB, pid: worlds.B.pid } }, lease,
    liveWorld: () => proxy.target === portA ? 'A' : 'B',
    async failover() {
      const from = proxy.target === portA ? 'A' : 'B', to = from === 'A' ? 'B' : 'A';
      const leaseBefore = await lease();
      const killedAt = Date.now();
      worlds[from].child.kill('SIGKILL');
      const exit = await worlds[from].exited;
      proxy.switchTo(worlds[to].port);
      return { from, to, killedAt, exitedAfterMs: exit.at - killedAt, signal: exit.signal, leaseBefore, switchedAt: Date.now() };
    } };
  const name = 'crime-takeover', context = await browser.newContext(), page = await context.newPage(), started = Date.now();
  page.setDefaultTimeout(60000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await context.route('**/v1/**', route => route.fulfill({ status: 503, json: { source: 'unavailable', reason: 'acceptance_fixture' } }));
  let result;
  try {
    console.log(`Running ${name}`);
    const source = (await readFile(join(root, `preview/e2e/${name}.js`), 'utf8')).replaceAll(/http:\/\/127\.0\.0\.1:(?:5173|5180)/g, origin);
    result = await eval(`(${source})\n//# sourceURL=preview/e2e/${name}.js`)(page, { takeover: control });
    if (result?.passed === false) throw new Error(result.failure ?? 'Harness reported failure');
    report.results.push({ name, status: 'passed', seconds: (Date.now() - started) / 1000, result, proxySwitches: proxy.switches });
    console.log(`Passed ${name}`);
  } catch (error) {
    report.results.push({ name, status: 'failed', seconds: (Date.now() - started) / 1000, error: error.stack, checksBeforeFailure: error.checks ?? [], rowsBeforeFailure: error.rows ?? [], pageErrors, result, proxySwitches: proxy.switches, worldLog: logs.slice(-80) });
    console.log(`Failed ${name}: ${error.stack}`);
  } finally { await context.close().catch(() => {}); }
  report.leaseAtEnd = await lease();
  report.status = report.results.every(item => item.status === 'passed') ? 'passed' : 'failed';
} catch (error) {
  report.status = 'failed'; report.error = error.stack; report.worldLog = logs.slice(-80);
  console.error(error);
} finally {
  await browser?.close().catch(() => {});
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await proxy?.close().catch(() => {});
  try { const keys = await redis.keys(`*${namespace}*`); if (keys.length) await redis.del(...keys); } catch {}
  await redis.quit().catch(() => {});
  report.finishedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  releaseBrowserLock();
  console.log(`crime-takeover: ${report.status}; report ${reportPath}`);
  process.exit(report.status === 'passed' ? 0 : 1);
}
