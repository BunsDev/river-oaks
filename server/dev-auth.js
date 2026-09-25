import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Local development identity for the standalone server, so the shared town runs
// without WorkOS credentials. Each browser gets its own resident, and a second
// browser profile is a second player. It is never used by the Vercel function
// or the Redis backend, and refuses any origin that is not plain-HTTP loopback.
const COOKIE = 'river_oaks_dev_session';
const SESSION_TTL = 7 * 24 * 60 * 60_000;
const MAX_SESSIONS = 256;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const NAMES = ['Wren', 'Juniper', 'Marlow', 'Sage', 'Rowan', 'Indigo', 'Tamsin', 'Ellis', 'Briar', 'Linden'];

export function devAuthAllowed({ origin, env = process.env } = {}) {
  let url;
  try { url = new URL(origin); } catch { return false; }
  return url.protocol === 'http:' && LOOPBACK.has(url.hostname) && url.origin === origin
    && env.NODE_ENV !== 'production' && !env.VERCEL && env.RIVER_OAKS_DEV_AUTH !== 'off';
}

function readCookie(req) {
  const header = req.headers.cookie;
  if (typeof header !== 'string' || header.length > 16_384) return null;
  const values = header.split(';').map(part => part.trim()).filter(part => part.startsWith(`${COOKIE}=`));
  return values.length === 1 ? values[0].slice(COOKIE.length + 1) : null;
}
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

export function createDevAuth({ origin, now = Date.now, onLogout = () => {} } = {}) {
  if (!devAuthAllowed({ origin })) throw new Error('Development sign-in only runs on a loopback http origin outside production.');
  const sessions = new Map();
  const issue = res => {
    for (const [key, record] of sessions) if (record.expiresAt <= now()) sessions.delete(key);
    if (sessions.size >= MAX_SESSIONS) return null;
    const cookie = randomBytes(24).toString('base64url');
    const userId = `dev-${createHash('sha256').update(cookie).digest('hex').slice(0, 12)}`;
    const name = `${NAMES[sessions.size % NAMES.length]} (dev)`;
    const record = { userId, name, sessionId: userId, csrfToken: randomBytes(24).toString('base64url'), expiresAt: now() + SESSION_TTL };
    sessions.set(cookie, record);
    res.setHeader('Set-Cookie', `${COOKIE}=${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}`);
    return record;
  };
  const current = req => {
    const record = sessions.get(readCookie(req));
    if (!record || record.expiresAt <= now()) return null;
    return { ...record };
  };
  return {
    development: true,
    authenticate: async req => current(req),
    async handle(req, res) {
      const path = new URL(req.url, origin).pathname;
      if (!['/auth/login', '/auth/callback', '/auth/session', '/auth/logout'].includes(path)) return false;
      res.setHeader('Referrer-Policy', 'no-referrer');
      if (path === '/auth/session') {
        // Development joins without a sign-in step: the first visit issues an identity.
        const user = current(req) ?? issue(res);
        json(res, 200, user ? { authenticated: true, development: true, user: { id: user.userId, name: user.name }, csrfToken: user.csrfToken } : { authenticated: false });
      } else if (path === '/auth/logout') {
        if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); json(res, 405, { error: 'method_not_allowed' }); return true; }
        const user = current(req);
        if (req.headers.origin !== origin) { json(res, 403, { error: 'invalid_origin' }); return true; }
        if (!user) { json(res, 401, { error: 'unauthenticated' }); return true; }
        if (!equal(req.headers['x-csrf-token'], user.csrfToken)) { json(res, 403, { error: 'invalid_csrf' }); return true; }
        sessions.delete(readCookie(req));
        res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
        await onLogout(user.userId, user.sessionId);
        json(res, 200, { url: '/' });
      } else {
        // Login and callback simply return home; the session endpoint issues the identity.
        res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' }); res.end();
      }
      return true;
    },
    close() { sessions.clear(); },
  };
}
