// A deterministic stand-in for TypeSafe Computer's embed mode (#486), on its own loopback
// origin. It has its own top-level sign-in cookie, an account gate on every frame instance,
// a per-account note store that acknowledges saves, and the five lifecycle messages.
// Synthetic data only; it is not Computer and proves nothing about Computer's hosting or auth.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const here = new URL('./', import.meta.url);
export const FIXTURE_ACCOUNTS = { ada: 'Ada Fixture', ben: 'Ben Fixture', cy: 'Cy Fixture' };
const escape = text => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export async function startComputerFixture() {
  const sessions = new Map(), notes = new Map(), log = [];
  // save: ok | fail | slow. close: normal | hang | attention | cancel. frame: allow | deny.
  const mode = { save: 'ok', close: 'normal', frame: 'allow' };
  let parentOrigin = null;
  const send = (res, status, body, headers = {}) => { res.writeHead(status, { 'Cache-Control': 'no-store', ...headers }); res.end(body); };
  const json = (res, status, data, headers) => send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json', ...headers });
  const body = async req => { let text = ''; for await (const chunk of req) text += chunk; return text ? JSON.parse(text) : {}; };
  const session = req => sessions.get(req.headers.cookie?.match(/(?:^|; )computer_session=([\w-]+)/)?.[1]);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://fixture'), s = session(req);
      log.push(`${req.method} ${url.pathname}`);
      if (req.method === 'GET' && url.pathname === '/') {
        const html = (await readFile(new URL('index.html', here), 'utf8')).replace('__PARENT_ORIGIN__', JSON.stringify(parentOrigin));
        // Computer's framing policy: only the reviewed Place origin may embed it.
        return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `frame-ancestors ${mode.frame === 'deny' || !parentOrigin ? "'none'" : parentOrigin}` });
      }
      if (req.method === 'GET' && url.pathname === '/child.js') return send(res, 200, await readFile(new URL('child.js', here)), { 'Content-Type': 'text/javascript' });
      // Top-level sign-in: a provider-style chooser, never inside the frame.
      if (url.pathname === '/api/auth/login' && req.method === 'GET') {
        const choices = Object.entries(FIXTURE_ACCOUNTS).map(([id, name]) => `<button name="account" value="${id}">${escape(name)}</button>`).join('');
        return send(res, 200, `<!doctype html><meta charset="utf-8"><title>Sign in · Computer fixture</title><h1>Sign in to the Computer fixture</h1><form method="post">${choices}</form>`, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "frame-ancestors 'none'" });
      }
      if (url.pathname === '/api/auth/login' && req.method === 'POST') {
        let text = ''; for await (const chunk of req) text += chunk;
        const account = new URLSearchParams(text).get('account');
        if (!FIXTURE_ACCOUNTS[account]) return send(res, 400, 'unknown account');
        const id = randomUUID(); sessions.set(id, { account });
        return send(res, 303, '', { Location: '/', 'Set-Cookie': `computer_session=${id}; Path=/; HttpOnly; SameSite=Lax` });
      }
      if (url.pathname === '/api/me') return s ? json(res, 200, { account: s.account, name: FIXTURE_ACCOUNTS[s.account] }) : json(res, 401, { user: null });
      if (url.pathname === '/api/account' && req.method === 'POST') {
        const { account } = await body(req);
        if (!s || !FIXTURE_ACCOUNTS[account]) return json(res, 401, { error: 'sign_in' });
        s.account = account; return json(res, 200, { account, name: FIXTURE_ACCOUNTS[account] });
      }
      if (url.pathname === '/api/state') {
        if (!s) return json(res, 401, { error: 'Sign in to sync.' });
        if (req.method === 'GET') return json(res, 200, { note: notes.get(s.account) ?? '' });
        const { note } = await body(req);
        if (mode.save === 'fail') return json(res, 503, { error: 'unavailable' });
        if (mode.save === 'slow') await new Promise(resolve => setTimeout(resolve, 1500));
        notes.set(s.account, String(note).slice(0, 2000)); return json(res, 200, { ok: true });
      }
      // Test control, called by the journey from the child frame.
      if (url.pathname === '/api/fixture') {
        if (req.method === 'POST') Object.assign(mode, await body(req));
        return json(res, 200, { ...mode });
      }
      send(res, 404, 'not found');
    } catch (error) { send(res, 500, error.message); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin, log, notes,
    setParentOrigin(value) { parentOrigin = value; },
    close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(() => resolve()); }),
  };
}
