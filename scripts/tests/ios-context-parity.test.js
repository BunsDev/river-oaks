import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture({ denied = false, wrongNonce = false } = {}) {
  const timers = new Map(); const listeners = new Map(); let sequence = 0; let terminated = 0;
  const sandbox = {
    URL, AbortController, JSON, Promise,
    location: { href: "capacitor://localhost/index.html" },
    addEventListener(name, callback) { listeners.set(name, callback); }, removeEventListener(name) { listeners.delete(name); },
    setTimeout(fn) { const id = ++sequence; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async () => { if (denied) { listeners.get('securitypolicyviolation')?.({ violatedDirective: 'connect-src', blockedURI: 'http://127.0.0.1:12345/DO-NOT-EXPORT' }); throw new TypeError('PRIVATE-ERROR-CONTENT'); } return { status: 200 }; },
    Worker: class {
      addEventListener(name, callback) { if (name === 'message') this.reply = callback; }
      postMessage(value) { queueMicrotask(() => this.reply({ data: { kind: 'context-worker-ready', nonce: wrongNonce ? 'wrong' : value.nonce } })); }
      terminate() { terminated++; }
    },
    webkit: { messageHandlers: { harness: { postMessage() { throw new Error('No native transport permitted'); } } } },
  };
  vm.runInNewContext(readFileSync(new URL('../../experiments/ios-bundled-origin/Web/context-parity.js', import.meta.url), 'utf8'), sandbox);
  const config = { target: 'http://127.0.0.1:12345/witness/get', nonce: 'test-run', role: 'page' };
  return { sandbox, timers, config, terminated: () => terminated };
}

test('context probe requires a real nonce-matched worker reply and exports bounded facts only', async () => {
  const f = fixture();
  const result = JSON.parse(await f.sandbox.ContextParityProbe.run(f.config));
  assert.equal(result.checks.fetch.status, 200);
  assert.equal(result.checks.worker.outcome, 'reply');
  assert.equal(result.checks.worker.nonceValidated, true);
  assert.equal(result.checks.harnessHandlerPresent, true, 'presence is reported without calling it');
  assert.equal(f.terminated(), 1);
  assert.equal(f.timers.size, 0);
});

test('fetch denial is recorded without exporting arbitrary error text', async () => {
  const f = fixture({ denied: true });
  const text = await f.sandbox.ContextParityProbe.run(f.config);
  const result = JSON.parse(text);
  assert.equal(result.checks.fetch.outcome, 'error');
  assert.equal(result.checks.fetch.errorName, 'TypeError');
  assert.equal(text.includes('PRIVATE-ERROR-CONTENT'), false);
  assert.equal(text.includes('DO-NOT-EXPORT'), false);
  assert.equal(result.violations[0].canaryOrigin, true);
});

test('a wrong worker nonce times out instead of claiming successful startup', async () => {
  const f = fixture({ wrongNonce: true });
  const pending = f.sandbox.ContextParityProbe.run(f.config);
  await new Promise(resolve => setImmediate(resolve));
  for (const callback of f.timers.values()) callback();
  const result = JSON.parse(await pending);
  assert.equal(result.checks.worker.outcome, 'timeout');
  assert.equal(result.checks.worker.nonceValidated, false);
  assert.equal(f.terminated(), 1);
});

test('comparison rejects mixed documents or native handlers and checks witness consistency', async () => {
  const { validateContextTrial } = await import('../../experiments/ios-bundled-origin/context-parity-report.mjs');
  const hash = 'a'.repeat(64);
  const world = role => ({ checks: { runID: 'run-1', role, harnessHandlerPresent: false, fetch: { outcome: 'response', status: 200 }, worker: { outcome: 'reply', nonceValidated: true } }, violations: [] });
  const record = { mode: 'context-parity', cspEnabled: false, sourcePolicySHA256: hash, registeredMessageHandlers: 0, navigationCount: 1, worlds: { page: world('page'), isolated: world('isolated') } };
  const witness = role => ({ method: 'GET', path: `/witness/get?context=${role}&run=run-1`, origin: 'capacitor://localhost', cookieNames: [] });
  const seen = [witness('page'), witness('isolated')];
  assert.equal(validateContextTrial(record, seen, { enabled: false, policyHash: hash }).page.fetch, 'response');
  for (const change of [value => { value.registeredMessageHandlers = 1; }, value => { value.navigationCount = 2; }, value => { value.worlds.page.checks.runID = 'other'; }, value => { value.sourcePolicySHA256 = 'b'.repeat(64); }]) {
    const altered = structuredClone(record); change(altered);
    assert.throws(() => validateContextTrial(altered, seen, { enabled: false, policyHash: hash }));
  }
  assert.throws(() => validateContextTrial(record, [], { enabled: false, policyHash: hash }));
  const csp = structuredClone(record); csp.cspEnabled = true;
  csp.worlds.page.checks.fetch = { outcome: 'error', errorName: 'TypeError' };
  csp.worlds.page.violations = [{ directive: 'connect-src', canaryOrigin: true }];
  assert.equal(validateContextTrial(csp, [witness('isolated')], { enabled: true, policyHash: hash }).page.fetch, 'no-response');
  assert.throws(() => validateContextTrial(csp, seen, { enabled: true, policyHash: hash }));
  for (const errorName of ['AbortError', 'other']) { const altered = structuredClone(csp); altered.worlds.page.checks.fetch.errorName = errorName; assert.throws(() => validateContextTrial(altered, [witness('isolated')], { enabled: true, policyHash: hash })); }
  const noEvent = structuredClone(csp); noEvent.worlds.page.violations = [];
  assert.throws(() => validateContextTrial(noEvent, [witness('isolated')], { enabled: true, policyHash: hash }));
  noEvent.worlds.page.violations = [{ directive: 'connect-src', canaryOrigin: false }];
  assert.throws(() => validateContextTrial(noEvent, [witness('isolated')], { enabled: true, policyHash: hash }));
});

test('ordinary origin measurements publish a polled result without calling a native handler', async () => {
  const timers = []; let nativeCalls = 0;
  const storage = new Map();
  const sandbox = { URL, Promise, document: { readyState: 'complete', cookie: '', querySelector: () => null }, location: { origin: 'capacitor://localhost', href: 'capacitor://localhost/index.html', protocol: 'capacitor:' },
    addEventListener() {}, setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
    localStorage: { setItem: (k, v) => storage.set(k, v), getItem: k => storage.get(k), removeItem: k => storage.delete(k) },
    indexedDB: { open() { const request = { result: { close() {} } }; queueMicrotask(() => request.onsuccess()); return request; }, deleteDatabase() {} },
    fetch: async () => ({ status: 200, json: async () => ({ authenticated: false }) }),
    WebSocket: class { addEventListener(name, fn) { if (name === 'close') queueMicrotask(() => fn({ code: 1006, wasClean: false })); } close() {} },
    webkit: { messageHandlers: { harness: { postMessage() { nativeCalls++; } } } },
  };
  vm.runInNewContext(readFileSync(new URL('../../experiments/ios-bundled-origin/Web/harness.js', import.meta.url), 'utf8'), sandbox);
  sandbox.BundledOriginHarness.start({ api: 'http://127.0.0.1:12345', witness: 'http://127.0.0.1:12346', captureID: 'fixture-capture' });
  timers[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nativeCalls, 0);
  assert.equal(typeof sandbox.__typeSafeBundledOriginResult, 'string');
  assert.equal(JSON.parse(sandbox.__typeSafeBundledOriginResult).checks.hostCaptureID, 'fixture-capture');
});
