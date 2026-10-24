// Optional addInitScript probe for the owning diagnostic's NEXT run only.
// Do not replace/restart an existing queued run to install it.
// await context.addInitScript(installInputAuthorityTrace);
// Collect: await page.evaluate(() => window.__commonsInputAuthorityTrace.stop());
export function installInputAuthorityTrace() {
  if (window.__commonsInputAuthorityTrace) return;
  const lifetime = new AbortController(), events = [], requests = new Map();
  let stopped = false;
  const coordinateFrames = {
    local: { position: '[east, eyeY, south] metres', north: '-south', height: 'eyeY includes seat/eye and altitude offsets; do not compare directly with groundZ' },
    authoritative: { position: '[east, north, groundZ] metres', height: 'groundZ; altitude is separate' },
    clientCommand: { position: '[east, north, groundZ] metres', height: 'groundZ; altitude is separate' },
  };
  const trace = { schemaVersion: 1, timeOrigin: performance.timeOrigin, coordinateFrames, events, dropped: 0 };
  const record = (kind, detail = {}) => {
    if (stopped) return;
    if (events.length >= 6000) { events.splice(500, 1000); trace.dropped += 1000; }
    events.push({ kind, epochMs: performance.timeOrigin + performance.now(), ...detail });
  };
  const element = node => node instanceof Element ? { tag: node.tagName, id: node.id, walkKey: node.closest('[data-walk-key]')?.dataset.walkKey ?? null } : null;
  const finite = value => Number.isFinite(value) ? value : null;
  const pose = player => player ? {
    position: player.position?.map(finite), yaw: finite(player.yaw), altitude: finite(player.altitude),
    sitting: player.sitting ? { buildId: player.sitting.buildId, slot: player.sitting.slot } : null,
  } : null;
  const state = () => {
    const town = window.__riverMultiplayer?.(), local = window.__riverCarriage?.()?.pose;
    return {
      focused: document.hasFocus(), hidden: document.hidden, active: element(document.activeElement),
      inert: Boolean(document.querySelector('.app-shell[inert]')),
      dialogue: Boolean(document.querySelector('#community-dialogue:not([hidden])')),
      boardOpen: Boolean(document.querySelector('#table-game-panel[open]')),
      local: local ? { ...pose(local), speed: finite(local.speed), velocity: local.velocity?.map(finite) } : null,
      authoritative: pose(town?.snapshot?.players.find(player => player.id === town.selfId)),
      connected: Boolean(town?.connected), traveling: Boolean(town?.traveling),
    };
  };
  const listen = (target, kind, handler, capture = true) => target.addEventListener(kind, handler, { capture, signal: lifetime.signal });
  for (const kind of ['keydown', 'keyup']) listen(document, kind, event => {
    if (!/^(Key[WASDZX]|Arrow(Left|Right|Up|Down)|Shift(Left|Right))$/.test(event.code)) return;
    // Capture context only; this observer does not establish handler acceptance.
    queueMicrotask(() => record(kind, { code: event.code, repeat: event.repeat, target: element(event.target), ...state() }));
  });
  for (const kind of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture']) listen(document, kind, event => {
    if (kind === 'pointermove' && !event.buttons) return;
    const host = document.querySelector('#canvas-host');
    record(kind, { pointerId: event.pointerId, primary: event.isPrimary, pointerType: event.pointerType,
      button: event.button, buttons: event.buttons, x: event.clientX, y: event.clientY,
      capturedByHost: Boolean(host?.hasPointerCapture(event.pointerId)), target: element(event.target),
      hit: element(document.elementFromPoint(event.clientX, event.clientY)), ...state() });
  });
  for (const kind of ['focusin', 'focusout']) listen(document, kind, event => record(kind, { target: element(event.target), related: element(event.relatedTarget), ...state() }));
  for (const kind of ['focus', 'blur']) listen(window, kind, () => record(`window-${kind}`, state()));
  listen(document, 'visibilitychange', () => record('visibility', state()));

  // Observe only movement and seating on /multiplayer. Never store URLs, tickets,
  // cookies, authentication payloads, raw messages, chat or other player data.
  const NativeSocket = window.WebSocket;
  let socketSequence = 0;
  const sockets = new WeakMap();
  class TracedSocket extends NativeSocket {
    constructor(...args) {
      super(...args);
      if (new URL(args[0], location.href).pathname !== '/multiplayer') return;
      const socket = ++socketSequence; sockets.set(this, socket);
      this.addEventListener('message', event => {
        try {
          if (typeof event.data !== 'string') return;
          const data = JSON.parse(event.data);
          if (data.type === 'snapshot') {
            const id = data.selfId ?? window.__riverMultiplayer?.()?.selfId;
            record('authority-snapshot', { socket, player: pose(data.players?.find(player => player.id === id)) });
          } else if (data.type === 'result') {
            const key = `${socket}:${data.requestId}`, command = requests.get(key);
            if (!command && !data.correction) return;
            requests.delete(key);
            record('authority-result', { socket, requestId: data.requestId, command: command ?? null,
              ok: data.ok, code: data.code, player: pose(data.player), correction: pose(data.correction) });
          }
        } catch { record('probe-decode-failed'); }
      }, { signal: lifetime.signal });
    }
    send(payload) {
      const socket = sockets.get(this);
      if (socket && !stopped) {
        try {
          const data = typeof payload === 'string' ? JSON.parse(payload) : null;
          if (data && ['pose', 'sit', 'stand'].includes(data.type)) {
            if (data.requestId !== undefined) {
              if (requests.size >= 128) requests.delete(requests.keys().next().value);
              requests.set(`${socket}:${data.requestId}`, data.type);
            }
            record('client-command', { socket, command: data.type, requestId: data.requestId,
              position: data.position?.map(finite), yaw: finite(data.yaw), altitude: finite(data.altitude),
              buildId: data.type === 'sit' ? data.buildId : undefined, slot: data.type === 'sit' ? data.slot : undefined });
          }
        } catch { record('probe-decode-failed'); }
      }
      return super.send(payload);
    }
  }
  window.WebSocket = TracedSocket;
  const timer = setInterval(() => record('sample', state()), 250);
  trace.stop = () => {
    if (!stopped) {
      clearInterval(timer); lifetime.abort(); requests.clear();
      if (window.WebSocket === TracedSocket) window.WebSocket = NativeSocket;
      record('probe-stopped'); stopped = true;
    }
    return { schemaVersion: trace.schemaVersion, timeOrigin: trace.timeOrigin, coordinateFrames, dropped: trace.dropped, events };
  };
  window.__commonsInputAuthorityTrace = trace;
  record('probe-installed');
}

// Collect both pages before the journey closes its peer. Evidence failures must
// never replace the original journey error or prevent the other capture.
export async function captureInputAuthorityEvidence(tabs) {
  return Promise.all(tabs.map(async ([name, page]) => {
    const result = { name };
    try { result.trace = await page.evaluate(() => window.__commonsInputAuthorityTrace?.stop() ?? null); }
    catch (error) { result.traceError = error.message; }
    try { await page.screenshot({ path: `output/playwright/experience-east-garden-commons-${name}-failure.png` }); }
    catch (error) { result.screenshotError = error.message; }
    return result;
  }));
}
