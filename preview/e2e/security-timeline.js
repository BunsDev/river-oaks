// Test-only passive metadata. Never import this from shipped application code.
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';

const browserKinds = new Set(['longtask', 'socket-construct', 'socket-open', 'socket-receive-gap', 'socket-close', 'socket-error',
  'socket-client-close-call', 'slow-gl-call', 'state-mutation-delivered', 'state-watch-start', 'sample', 'observation-bound-reached',
  'settings-pointerdown', 'settings-click', 'visibility', 'browser-event-cap']);
const reasons = ['No town updates.', 'Moved to a fresh connection.', 'Session expired. Reconnecting securely.', 'World region updated.', 'District revision changed', 'other-or-empty-unrecorded'];
const stateStrings = ['', 'true', 'false', 'connecting', 'joined', 'disconnected'];
const selectors = ['.multiplayer-gate', '.app-shell', '.multiplayer-roster', '#canvas-host', '#settings-dialog', 'unavailable'];
const attributes = ['hidden', 'inert', 'data-connected', 'data-multiplayer', 'data-player-ready', 'open'];
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const choice = (value, allowed) => value === null ? null : allowed.includes(value) ? value : 'unrecorded';
const state = value => {
  if (!value || typeof value !== 'object') return null;
  const result = {};
  for (const key of ['gateHidden', 'appInert', 'settingsOpen']) if (typeof value[key] === 'boolean' || value[key] === null) result[key] = value[key];
  for (const key of ['rosterConnected', 'multiplayer', 'playerReady']) if (Object.hasOwn(value, key)) result[key] = choice(value[key], stateStrings);
  return result;
};

// The browser binding is an input boundary, even in a local fixture. Retain only
// fixed metadata shapes; extra keys, arbitrary text and oversized arrays vanish.
function projectBrowserEvent(value) {
  if (!value || !browserKinds.has(value.kind) || !finite(value.documentEpoch) || !finite(value.pageAt)) return null;
  const result = { kind: value.kind, documentEpoch: value.documentEpoch, pageAt: value.pageAt };
  for (const key of ['id', 'messages', 'snapshots', 'lastReceived', 'maxReceiveGap', 'readyState', 'gap', 'code', 'reasonLength',
    'startAt', 'duration', 'frames', 'lastFrame', 'maxFrameGap', 'timerGap', 'emitted', 'samples', 'limit']) {
    if (finite(value[key]) || value[key] === null) result[key] = value[key];
  }
  if (typeof value.wasClean === 'boolean') result.wasClean = value.wasClean;
  Object.assign(result, state(value));
  if ('messageType' in value) result.messageType = choice(value.messageType, ['snapshot', 'result', 'rotate', 'other']);
  if ('reason' in value) result.reason = choice(value.reason, reasons);
  if ('name' in value) result.name = choice(value.name, ['getProgramInfoLog', 'readPixels', 'finish']);
  if ('visibility' in value) result.visibility = choice(value.visibility, ['visible', 'hidden', 'prerender']);
  if (value.kind === 'visibility') result.value = choice(value.value, ['visible', 'hidden', 'prerender']);
  if (value.kind === 'state-mutation-delivered') {
    result.target = choice(value.target, selectors); result.attribute = choice(value.attribute, attributes);
    result.priorValue = choice(value.priorValue, stateStrings); result.stateAtCallbackDelivery = state(value.stateAtCallbackDelivery);
  }
  if (value.kind === 'sample' && value.launcher && typeof value.launcher === 'object') {
    const launcher = {};
    for (const key of ['x', 'y', 'width', 'height']) if (typeof value.launcher[key] === 'number' && Number.isFinite(value.launcher[key]) && Math.abs(value.launcher[key]) <= 1e6) launcher[key] = value.launcher[key];
    if (typeof value.launcher.disabled === 'boolean') launcher.disabled = value.launcher.disabled;
    launcher.hit = Array.isArray(value.launcher.hit) ? value.launcher.hit.slice(0, 4).map(hit => ({
      tag: choice(hit?.tag, ['HTML', 'BODY', 'DIV', 'SECTION', 'BUTTON', 'SPAN', 'SVG', 'PATH', 'DIALOG', 'CANVAS']),
      target: choice(hit?.target, ['settings-toggle', 'settings-dialog', 'canvas-host', 'other']), gate: hit?.gate === true,
    })) : [];
    result.launcher = launcher;
  }
  return result;
}

export async function createSecurityTimeline({ directory = 'output/playwright/security-timeline', limit = 6000 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 6000) throw new Error('Invalid security timeline limit');
  await mkdir(directory, { recursive: true });
  const output = join(directory, `events-${process.pid}.jsonl`);
  const startedAt = Date.now();
  // Exclusive creation refuses to mix a stale run with this process's evidence.
  await writeFile(output, JSON.stringify({ kind: 'timeline-start', hostAt: startedAt, processId: process.pid }) + '\n', { flag: 'wx' });
  let writes = Promise.resolve(), writeFailure = null, events = 0, dropped = 0, rejectedBrowserEvents = 0, closed = false, closing;
  const record = event => {
    if (closed) return;
    if (events >= limit) { dropped++; return; }
    const line = JSON.stringify({ hostAt: Date.now(), processId: process.pid, ...event }) + '\n';
    if (Buffer.byteLength(line) > 4096) { dropped++; return; }
    events++;
    writes = writes.then(() => appendFile(output, line)).catch(() => { writeFailure ??= 'event-write-failed'; });
  };
  const restorations = [], listeners = [];
  const listen = (socket, name, callback) => { socket.on(name, callback); listeners.push(() => socket.off(name, callback)); };
  let serverId = 0;
  const observeSocket = socket => {
    const id = ++serverId;
    let sends = 0, lastSent = null;
    record({ kind: 'server-socket-connected', id });
    listen(socket, 'pong', () => record({ kind: 'server-pong', id }));
    listen(socket, 'close', (code, reason) => record({ kind: 'server-socket-close', id, code, reasonBytes: reason.length }));
    for (const method of ['send', 'ping', 'terminate', 'close']) {
      const original = socket[method];
      const wrapped = function (...args) {
        if (method === 'send') {
          const now = Date.now(), gap = lastSent === null ? null : now - lastSent;
          sends++; lastSent = now;
          if (sends <= 2 || (gap !== null && gap > 1000)) record({ kind: 'server-send-gap', id, sends, gap });
        } else {
          const sourceFrames = new Error().stack?.split('\n').map(line => line.match(/server\/[A-Za-z0-9_./-]+\.js:\d+:\d+/)?.[0]).filter(Boolean).slice(0, 3);
          record({ kind: `server-${method}-call`, id, readyState: this.readyState,
            code: method === 'close' ? args[0] ?? null : null, sourceFrames });
        }
        return original.apply(this, args);
      };
      socket[method] = wrapped;
      restorations.push(() => { if (socket[method] === wrapped) socket[method] = original; });
    }
  };
  // app.js invokes handleUpgrade's callback directly; it never emits connection.
  const upgrade = WebSocketServer.prototype.handleUpgrade;
  const wrappedUpgrade = function (request, socket, head, callback) {
    if (request.url?.split('?')[0] !== '/multiplayer') return upgrade.call(this, request, socket, head, callback);
    return upgrade.call(this, request, socket, head, function (accepted, ...args) {
      observeSocket(accepted);
      return callback.call(this, accepted, ...args);
    });
  };
  WebSocketServer.prototype.handleUpgrade = wrappedUpgrade;
  restorations.push(() => { if (WebSocketServer.prototype.handleUpgrade === wrappedUpgrade) WebSocketServer.prototype.handleUpgrade = upgrade; });
  const close = () => closing ??= (async () => {
    closed = true;
    for (const restore of restorations.reverse()) restore();
    for (const remove of listeners) remove();
    await writes;
    const health = { processId: process.pid, startedAt, finishedAt: Date.now(), events, dropped, rejectedBrowserEvents, limit, maxEventBytes: 4096, writeFailure,
      scope: 'Passive observation; server sends are attempts, browser messages are delivery callbacks, DOM states are callback-delivery observations. No payloads, URLs, tickets or identities retained.' };
    await writeFile(join(directory, `health-${process.pid}.json`), JSON.stringify(health, null, 2) + '\n', { flag: 'wx' });
    if (writeFailure) throw new Error('Security timeline event output failed');
    return health;
  })();
  // Also drains evidence after test/server cleanup if setup failed before the
  // caller could register its final cleanup. Original test failure is preserved.
  const beforeExit = () => { void close().catch(() => { console.error('Security timeline terminal output failed'); process.exitCode = 1; }); };
  process.once('beforeExit', beforeExit);
  return {
    async observeContext(context) {
      await context.exposeBinding('__securityTimelineEvent', (_source, input) => {
        const event = projectBrowserEvent(input);
        if (event) record({ kind: 'browser-event', event }); else rejectedBrowserEvents++;
      });
      await context.addInitScript(observeSecurityPage);
    },
    async close() { try { return await close(); } finally { process.removeListener('beforeExit', beforeExit); } },
  };
}

// This function is serialized by Playwright; all state belongs to one document.
function observeSecurityPage() {
  let emitted = 0, frames = 0, lastFrame = 0, maxFrameGap = 0, previousTimer = performance.now(), socketId = 0;
  const emit = event => {
    if (emitted >= 2400) return;
    if (++emitted === 2400) event = { kind: 'browser-event-cap', limit: 2400 };
    void window.__securityTimelineEvent({ documentEpoch: performance.timeOrigin, pageAt: performance.now(), ...event }).catch(() => {});
  };
  const raf = now => { frames++; if (lastFrame) maxFrameGap = Math.max(maxFrameGap, now - lastFrame); lastFrame = now; requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  let tasks = 0;
  try { new PerformanceObserver(list => { for (const entry of list.getEntries()) if (tasks++ < 128) emit({ kind: 'longtask', startAt: entry.startTime, duration: entry.duration }); }).observe({ type: 'longtask', buffered: true }); } catch {}
  const reasons = ['No town updates.', 'Moved to a fresh connection.', 'Session expired. Reconnecting securely.', 'World region updated.', 'District revision changed'];
  const reasonClass = reason => reasons.includes(reason) ? reason : 'other-or-empty-unrecorded';
  const Socket = window.WebSocket;
  window.WebSocket = class extends Socket {
    constructor(...args) {
      super(...args);
      let town = false;
      try { town = new URL(String(args[0]), location.href).pathname === '/multiplayer'; } catch {}
      if (!town) return;
      const id = ++socketId; let messages = 0, snapshots = 0, lastReceived = null, maxReceiveGap = 0;
      const summary = () => ({ id, messages, snapshots, lastReceived, maxReceiveGap, readyState: this.readyState });
      emit({ kind: 'socket-construct', id });
      this.addEventListener('open', () => emit({ kind: 'socket-open', id }));
      this.addEventListener('message', event => {
        const now = performance.now(), gap = lastReceived === null ? null : now - lastReceived;
        if (gap !== null) maxReceiveGap = Math.max(maxReceiveGap, gap);
        lastReceived = now; messages++;
        const match = typeof event.data === 'string' ? event.data.slice(0, 96).match(/"type"\s*:\s*"(snapshot|result|rotate)"/) : null;
        const type = match?.[1] ?? 'other'; if (type === 'snapshot') snapshots++;
        if (messages <= 2 || (gap !== null && gap > 1000) || type === 'rotate') emit({ kind: 'socket-receive-gap', ...summary(), gap, messageType: type });
      });
      this.addEventListener('close', event => emit({ kind: 'socket-close', ...summary(), code: event.code, reason: reasonClass(event.reason), reasonLength: event.reason.length, wasClean: event.wasClean }));
      this.addEventListener('error', () => emit({ kind: 'socket-error', ...summary() }));
      const close = this.close;
      this.close = (...values) => { emit({ kind: 'socket-client-close-call', ...summary(), code: values[0] ?? null, reason: reasonClass(values[1]) }); return close.apply(this, values); };
    }
  };
  let glEvents = 0; const observedMethods = new WeakSet();
  for (const prototype of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype].filter(Boolean)) {
    for (const name of ['getProgramInfoLog', 'readPixels', 'finish']) {
      const original = prototype[name]; if (typeof original !== 'function' || observedMethods.has(original)) continue;
      prototype[name] = function (...args) {
        const start = performance.now();
        try { return original.apply(this, args); }
        finally { const duration = performance.now() - start; if (duration > 100 && glEvents++ < 128) emit({ kind: 'slow-gl-call', name, startAt: start, duration }); }
      };
      observedMethods.add(prototype[name]);
    }
  }
  const gateState = () => ({
    gateHidden: document.querySelector('.multiplayer-gate')?.hidden ?? null,
    appInert: document.querySelector('.app-shell')?.inert ?? null,
    rosterConnected: document.querySelector('.multiplayer-roster')?.dataset.connected ?? null,
    multiplayer: document.querySelector('#canvas-host')?.dataset.multiplayer ?? null,
    playerReady: document.querySelector('#canvas-host')?.dataset.playerReady ?? null,
    settingsOpen: document.querySelector('#settings-dialog')?.open ?? null,
  });
  let watching = false;
  const selectors = ['.multiplayer-gate', '.app-shell', '.multiplayer-roster', '#canvas-host', '#settings-dialog'];
  const observer = new MutationObserver(records => {
    for (const change of records) emit({ kind: 'state-mutation-delivered', target: selectors.find(selector => change.target.matches(selector)) ?? 'unavailable',
      attribute: change.attributeName, priorValue: change.oldValue, stateAtCallbackDelivery: gateState() });
  });
  let samples = 0;
  const timer = setInterval(() => {
    const now = performance.now(), timerGap = now - previousTimer; previousTimer = now;
    if (!watching) {
      const nodes = selectors.map(selector => document.querySelector(selector));
      if (nodes.every(Boolean)) {
        for (const node of nodes) observer.observe(node, { attributes: true, attributeOldValue: true, attributeFilter: ['hidden', 'inert', 'data-connected', 'data-multiplayer', 'data-player-ready', 'open'] });
        watching = true; emit({ kind: 'state-watch-start', ...gateState() });
      }
    }
    const button = document.querySelector('#settings-toggle'), rect = button?.getBoundingClientRect();
    emit({ kind: 'sample', frames, lastFrame, maxFrameGap, timerGap, visibility: document.visibilityState, ...gateState(),
      launcher: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, disabled: button.disabled,
        hit: document.elementsFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2).slice(0, 4).map(node => ({ tag: node.tagName,
          target: ['settings-toggle', 'settings-dialog', 'canvas-host'].includes(node.id) ? node.id : 'other', gate: node.classList.contains('multiplayer-gate') })) } : null });
    if (++samples >= 480) { clearInterval(timer); observer.disconnect(); emit({ kind: 'observation-bound-reached', emitted, samples }); }
  }, 500);
  for (const kind of ['pointerdown', 'click']) document.addEventListener(kind, event => { if (event.target.closest?.('#settings-toggle')) emit({ kind: `settings-${kind}`, ...gateState() }); }, true);
  document.addEventListener('visibilitychange', () => emit({ kind: 'visibility', value: document.visibilityState }));
}
