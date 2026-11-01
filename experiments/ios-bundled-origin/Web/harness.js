// The checks a bundled play client's origin has to pass, run identically from the
// hosted origin and from `capacitor://localhost` (#286 bundled-origin experiment).
// Every check records what happened; none changes the page or the server. The
// witness is a loopback server that answers with the headers it received, so the
// results show exactly what the WebView sent (Origin, cookies by name, Sec-Fetch-*)
// without reading any credential value. The fixture town answers with its real
// verdicts: the same origin and CSRF checks the deployed server runs.
(function () {
  const results = { checks: {}, violations: [] };
  addEventListener('securitypolicyviolation', event => {
    results.violations.push({ directive: event.violatedDirective, blocked: String(event.blockedURI).slice(0, 120) });
  });
  const record = (name, value) => { results.checks[name] = value; };
  const failure = error => ({ ok: false, error: `${error?.name ?? 'Error'}: ${String(error?.message ?? error).slice(0, 160)}` });
  const timeout = (ms, what) => new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} did not finish in ${ms} ms`)), ms));

  async function fetchJSON(url, options) {
    const response = await Promise.race([fetch(url, options), timeout(8000, 'fetch')]);
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    return { ok: true, status: response.status, body };
  }

  function socket(url, what) {
    return new Promise(resolve => {
      let settled = false;
      const done = value => { if (!settled) { settled = true; resolve(value); } };
      let ws;
      try { ws = new WebSocket(url); } catch (error) { done(failure(error)); return; }
      const echo = [];
      ws.addEventListener('open', () => echo.push('open'));
      ws.addEventListener('message', event => { try { done({ ok: true, open: true, echo: JSON.parse(event.data) }); } catch { done({ ok: true, open: true, echo: String(event.data).slice(0, 200) }); } ws.close(); });
      ws.addEventListener('error', () => {});
      ws.addEventListener('close', event => done({ ok: true, open: echo.includes('open'), closeCode: event.code, wasClean: event.wasClean }));
      setTimeout(() => { done({ ok: false, error: `${what} neither opened nor closed in 8000 ms` }); try { ws.close(); } catch {} }, 8000);
    });
  }

  async function run(config) {
    const api = config.api.replace(/\/$/, ''), witness = config.witness.replace(/\/$/, '');
    const same = { credentials: 'same-origin' }, include = { credentials: 'include' };
    record('hostCaptureID', config.captureID);
    record('page', { origin: location.origin, href: location.href, protocol: location.protocol, readyState: document.readyState, csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? null });

    // Storage on this origin: a packaged client keeps settings and the returning mark here.
    try { localStorage.setItem('bundled-origin', '1'); record('storage.local', { ok: localStorage.getItem('bundled-origin') === '1' }); localStorage.removeItem('bundled-origin'); } catch (error) { record('storage.local', failure(error)); }
    try {
      const opened = await Promise.race([new Promise((resolve, reject) => { const request = indexedDB.open('bundled-origin', 1); request.onsuccess = () => { request.result.close(); resolve(true); }; request.onerror = () => reject(request.error); }), timeout(5000, 'indexedDB')]);
      record('storage.indexedDB', { ok: opened === true });
      indexedDB.deleteDatabase('bundled-origin');
    } catch (error) { record('storage.indexedDB', failure(error)); }
    try { document.cookie = 'bundled_origin=1; path=/'; record('storage.cookie', { ok: /bundled_origin=1/.test(document.cookie) }); document.cookie = 'bundled_origin=; path=/; max-age=0'; } catch (error) { record('storage.cookie', failure(error)); }

    // What the WebView sends from this origin, as the witness saw it.
    for (const [name, options] of [['witness.get.sameOrigin', same], ['witness.get.include', include]]) {
      try { record(name, await fetchJSON(`${witness}/witness/get`, { ...options, cache: 'no-store' })); } catch (error) { record(name, failure(error)); }
    }
    try {
      record('witness.post.include', await fetchJSON(`${witness}/witness/post`, { ...include, method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'fixture-bob' }, body: '{}' }));
    } catch (error) { record('witness.post.include', failure(error)); }
    record('witness.socket', await socket(`${witness.replace(/^http/, 'ws')}/witness/socket`, 'witness socket'));

    // The real town's verdicts, over the same paths the client uses (relative on the
    // deployed site; here spelled against the fixture origin so both modes ask the same server).
    try { record('town.session.sameOrigin', await fetchJSON(`${api}/auth/session`, { ...same, cache: 'no-store' })); } catch (error) { record('town.session.sameOrigin', failure(error)); }
    try { record('town.session.include', await fetchJSON(`${api}/auth/session`, { ...include, cache: 'no-store' })); } catch (error) { record('town.session.include', failure(error)); }
    try { record('town.status.include', await fetchJSON(`${api}/api/waitlist/status`, { ...include, cache: 'no-store' })); } catch (error) { record('town.status.include', failure(error)); }
    let ticket = null;
    try {
      const response = await fetchJSON(`${api}/api/multiplayer/ticket?world=river-oaks`, { ...include, method: 'POST', cache: 'no-store', headers: { 'X-CSRF-Token': 'fixture-bob' } });
      ticket = response.body?.ticket ? response.body : null;
      record('town.ticket.include', { ok: true, status: response.status, issued: Boolean(ticket), error: response.body?.error ?? null });
    } catch (error) { record('town.ticket.include', failure(error)); }
    if (ticket) {
      const url = new URL('/multiplayer', api); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('ticket', ticket.ticket); url.searchParams.set('world', ticket.worldId ?? 'river-oaks'); url.searchParams.set('protocol', String(ticket.protocolVersion ?? 3));
      const result = await socket(url.href, 'town socket');
      record('town.socket', { ...result, echo: result.echo ? 'snapshot received' : undefined });
    } else record('town.socket', { ok: false, error: 'no ticket, so no socket attempt' });

    // A same-origin module worker, as the game's route and table-game workers are loaded.
    if (config.workerPath) {
      record('worker.sameOrigin', await new Promise(resolve => {
        let worker;
        try { worker = new Worker(new URL(config.workerPath, location.href), { type: 'module' }); } catch (error) { resolve(failure(error)); return; }
        const timer = setTimeout(() => { resolve({ ok: true, noErrorObserved: true, startupVerified: false, windowMs: 3000 }); worker.terminate(); }, 3000);
        worker.addEventListener('error', event => { clearTimeout(timer); resolve({ ok: false, error: String(event.message ?? 'worker error').slice(0, 160) }); worker.terminate(); });
      }));
    }
    // Relative URLs, as the client spells every API, auth and socket URL.
    record('relative', { api: new URL('/api/waitlist/status', location.href).href, socket: (() => { const u = new URL('/multiplayer', location.href); u.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'; return u.href; })() });
    return results;
  }

  globalThis.BundledOriginHarness = {
    start(config) {
      const begin = () => setTimeout(() => run(config).catch(error => ({ ...results, error: String(error) })).then(value => {
        globalThis.__typeSafeBundledOriginResult = JSON.stringify(value);
      }), 1500);
      if (document.readyState === 'loading') addEventListener('DOMContentLoaded', begin, { once: true }); else begin();
    },
    run,
  };
})();
