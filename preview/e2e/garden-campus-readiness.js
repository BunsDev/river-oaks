// Startup for the provider-free campus fixture, where planned socket rotation is off.
// An acknowledgement proves a round trip now, not future socket or render health.
export function createCampusStartupReadiness({ timeoutMs = 120000, log = record => console.log('Campus startup readiness', JSON.stringify(record)) } = {}) {
  const pages = new WeakMap();
  function track(page) {
    if (pages.has(page)) return;
    const state = { current: null, generation: 0, changed: new Set() };
    pages.set(page, state);
    const changed = () => { for (const notify of [...state.changed]) notify(); };
    page.on('websocket', socket => {
      if (new URL(socket.url()).pathname !== '/multiplayer') return;
      const connection = { socket, generation: ++state.generation, sent: new Map(), received: new Map() };
      state.current = connection;
      socket.on('framesent', frame => {
        try {
          const message = JSON.parse(frame.payload.toString());
          if (message.type === 'inventory' && message.action === 'list') connection.sent.set(message.requestId, Date.now());
        } catch { /* Other frames do not establish application readiness. */ }
      });
      socket.on('framereceived', frame => {
        try {
          const message = JSON.parse(frame.payload.toString());
          if (message.type === 'result' && connection.sent.has(message.requestId)) connection.received.set(message.requestId, { ok: message.ok, error: message.error });
        } catch { /* The client owns protocol parsing and rejection. */ }
      });
      socket.on('close', () => { log({ event: 'socket-close', generation: connection.generation, at: Date.now() }); changed(); });
      changed();
    });
  }
  async function joined(page) {
    const state = pages.get(page);
    if (!state) throw new Error('Track the page before its first navigation.');
    const started = Date.now(), deadline = started + timeoutMs;
    let checkpoint = started, attempts = 0;
    const remaining = () => {
      const value = deadline - Date.now();
      if (value <= 0) throw new Error(`Town startup exceeded its ${timeoutMs}ms deadline.`);
      return value;
    };
    const bounded = async operation => {
      let timer;
      try {
        return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Town startup exceeded its ${timeoutMs}ms deadline.`)), remaining()); })]);
      } finally { clearTimeout(timer); }
    };
    const waitForChange = async connection => {
      if (state.current !== connection) return;
      let notify;
      try {
        await bounded(new Promise(resolve => { notify = () => resolve(); state.changed.add(notify); }));
      } finally { state.changed.delete(notify); }
    };
    for (;;) {
      await bounded(page.waitForFunction(afterReady => {
        const m = window.__riverMultiplayer?.();
        return m?.connected && m.snapshot?.serverTimeMs >= afterReady && m.snapshot?.players?.some(p => p.id === m.selfId);
      }, checkpoint, { timeout: remaining() }));
      const connection = state.current;
      if (!connection || connection.socket.isClosed()) { await waitForChange(connection); continue; }
      const probeStarted = Date.now(); attempts++;
      const result = await bounded(page.evaluate(async () => {
        try {
          const response = await window.__riverMultiplayerCommand({ type: 'inventory', action: 'list' });
          return { type: response.type, requestId: response.requestId, ok: response.ok, error: response.error, message: response.message };
        } catch (error) {
          if (['Disconnected. Your action was not confirmed.', 'The town did not confirm this action. Please try again.'].includes(error.message)) return { transportFailure: error.message };
          throw error;
        }
      }));
      if (result.transportFailure) {
        log({ event: 'probe-transport-loss', generation: connection.generation, attempts, elapsedMs: Date.now() - started });
        await waitForChange(connection); checkpoint = Date.now(); continue;
      }
      if (result.type !== 'result' || typeof result.requestId !== 'string') {
        if (result.message !== 'Reconnect before taking an action.') throw new Error('Startup probe did not return a correlated server result.');
        log({ event: 'probe-reconnect', generation: connection.generation, attempts, elapsedMs: Date.now() - started });
        await waitForChange(connection); checkpoint = Date.now(); continue;
      }
      const ack = connection.received.get(result.requestId);
      if (!ack || connection.sent.get(result.requestId) < probeStarted) throw new Error('Startup acknowledgement did not match this socket and probe.');
      if (ack.ok !== true && ack.error !== 'admin_only') throw new Error(`Unexpected startup response: ${ack.error ?? 'refused'}`);
      const connected = await bounded(page.evaluate(() => { const m = window.__riverMultiplayer?.(); return Boolean(m?.connected && m.snapshot?.players?.some(p => p.id === m.selfId)); }));
      if (!connected || state.current !== connection || connection.socket.isClosed()) {
        log({ event: 'probe-socket-changed', generation: connection.generation, attempts, elapsedMs: Date.now() - started });
        checkpoint = Date.now(); continue;
      }
      remaining();
      log({ event: 'ready', generation: connection.generation, attempts, elapsedMs: Date.now() - started });
      return;
    }
  }
  return { track, joined };
}

// The local prompt can lead the 200ms pose publication. Wait for the town's
// source-level pose before the journey presses F once; never retry the action.
export function waitForCampusLift(page, portalPosition, { timeoutMs = 30000 } = {}) {
  return page.waitForFunction(([east, north]) => {
    const m = window.__riverMultiplayer?.(), self = m?.snapshot?.players.find(player => player.id === m.selfId);
    const prompt = document.querySelector('#walking-enter');
    return Boolean(m?.connected && self && (self.levelId ?? null) === null && Array.isArray(self.position)
      && Math.hypot(self.position[0] - east, self.position[1] - north) <= 1.3
      && prompt && !prompt.hidden && !prompt.disabled && /Take the lift up/.test(prompt.textContent));
  }, portalPosition, { timeout: timeoutMs });
}
