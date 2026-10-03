import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkOS } from '@workos-inc/node';
import { validWorkOSIssuer, logSessionRejection } from './workos-session.js';

const SESSION_COOKIE = 'river_oaks_session', STATE_COOKIE = 'river_oaks_auth_state';
const STATE_TTL = 20 * 60_000, SESSION_TTL = 7 * 24 * 60 * 60_000;
const REFRESH_LEASE = 30_000, COOKIE_GRACE = 30_000, REFRESH_WAIT = 25_000;
const token = () => randomBytes(32).toString('base64url');
const digest = value => createHash('sha256').update(value).digest('base64url');
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
const equal = (a, b) => typeof a === 'string' && typeof b === 'string'
  && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Five fixed keys share one Redis hash slot. Cookie digests are hash fields, so
// untrusted cookies cannot allocate keys. Admission, rotation and deletion are
// atomic; a deleted session can never be recreated by a delayed refresh commit.
const TRANSACTION = `
local p = cjson.decode(ARGV[1])
local time = p.now
local function removeSession(id, record)
  if record then
    redis.call('HDEL', KEYS[5], record.cookieHash)
    if record.previousHash then redis.call('HDEL', KEYS[5], record.previousHash) end
  end
  redis.call('HDEL', KEYS[3], id)
  redis.call('ZREM', KEYS[4], id)
end
for _, id in ipairs(redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', time)) do
  redis.call('HDEL', KEYS[1], id)
  redis.call('ZREM', KEYS[2], id)
end
for _, id in ipairs(redis.call('ZRANGEBYSCORE', KEYS[4], '-inf', time)) do
  local raw = redis.call('HGET', KEYS[3], id)
  removeSession(id, raw and cjson.decode(raw) or nil)
end
local function save(record)
  local raw = cjson.encode(record)
  redis.call('HSET', KEYS[3], record.sessionId, raw)
  return raw
end
local function allowedCookie(record, hash)
  return hash == record.cookieHash or (hash == record.previousHash and record.previousUntil > time)
end
if p.op == 'state-put' then
  if redis.call('HLEN', KEYS[1]) >= 1000 or redis.call('HEXISTS', KEYS[1], p.id) == 1 then return false end
  redis.call('HSET', KEYS[1], p.id, cjson.encode(p.record))
  redis.call('ZADD', KEYS[2], p.record.expiresAt, p.id)
  redis.call('PEXPIRE', KEYS[1], p.ttl)
  redis.call('PEXPIRE', KEYS[2], p.ttl)
  return 'ok'
elseif p.op == 'state-take' then
  local raw = redis.call('HGET', KEYS[1], p.id)
  redis.call('HDEL', KEYS[1], p.id)
  redis.call('ZREM', KEYS[2], p.id)
  return raw
elseif p.op == 'session-put' then
  if redis.call('HLEN', KEYS[3]) >= 10000 or redis.call('HEXISTS', KEYS[3], p.record.sessionId) == 1 then return false end
  save(p.record)
  redis.call('ZADD', KEYS[4], p.record.expiresAt, p.record.sessionId)
  redis.call('HSET', KEYS[5], p.record.cookieHash, p.record.sessionId)
  for i = 3, 5 do redis.call('PEXPIRE', KEYS[i], p.ttl) end
  return 'ok'
elseif p.op == 'cookie-get' then
  local id = redis.call('HGET', KEYS[5], p.hash)
  if not id then return false end
  local raw = redis.call('HGET', KEYS[3], id)
  if not raw then return false end
  local record = cjson.decode(raw)
  if record.expiresAt <= time or not allowedCookie(record, p.hash) then return false end
  return raw
end
local raw = redis.call('HGET', KEYS[3], p.sessionId)
if not raw then return false end
local record = cjson.decode(raw)
if record.expiresAt <= time or record.userId ~= p.userId or (p.generation and record.generation ~= p.generation) then return false end
if p.op == 'active' then
  if p.hash and not allowedCookie(record, p.hash) then return false end
  return 'ok'
elseif p.op == 'delete' then
  if not allowedCookie(record, p.hash) then return false end
  removeSession(record.sessionId, record)
  return 'ok'
elseif p.op == 'refresh-lock' then
  if record.cookieHash ~= p.hash then return 'changed' end
  if record.refreshOwner and record.refreshUntil > time then return 'busy' end
  record.refreshOwner = p.owner
  record.refreshUntil = time + p.lease
  save(record)
  return 'ok'
elseif p.op == 'refresh-release' then
  if record.refreshOwner ~= p.owner then return false end
  record.refreshOwner = nil
  record.refreshUntil = nil
  save(record)
  return 'ok'
elseif p.op == 'refresh-commit' then
  if record.refreshOwner ~= p.owner or record.refreshUntil <= time or record.cookieHash ~= p.hash then return false end
  if record.previousHash then redis.call('HDEL', KEYS[5], record.previousHash) end
  record.previousHash = record.cookieHash
  record.previousUntil = math.min(record.expiresAt, time + p.grace)
  record.cookieHash = p.nextHash
  record.sealedSession = p.sealedSession
  record.refreshOwner = nil
  record.refreshUntil = nil
  redis.call('HSET', KEYS[5], record.cookieHash, record.sessionId)
  return save(record)
end
return false
`;

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (typeof header !== 'string' || header.length > 16_384) return null;
  const values = header.split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  if (values.length !== 1) return null;
  try { return decodeURIComponent(values[0].slice(name.length + 1)); } catch { return null; }
}
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

/** Durable auth only. The caller owns Redis and cross-instance WS invalidation. */
export function createRedisAuth({ redis, prefix, apiKey, clientId, cookiePassword, origin, workos, now = Date.now, onLogout = () => {} } = {}) {
  let base;
  try {
    const parsed = new URL(origin), local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if ((parsed.protocol === 'https:' || parsed.protocol === 'http:' && local) && !parsed.username && !parsed.password
      && parsed.pathname === '/' && !parsed.search && !parsed.hash) base = parsed.origin;
  } catch { /* Invalid configuration is unavailable, never anonymous access. */ }
  let enabled = Boolean(redis?.eval && typeof prefix === 'string' && prefix.length > 0 && prefix.length <= 200
    && base && apiKey && clientId && typeof cookiePassword === 'string' && cookiePassword.length >= 32);
  const sdk = enabled ? workos ?? new WorkOS(apiKey, { clientId, timeout: 10_000, maxRetries: 1 }) : null;
  // Use a caller-provided hash tag unchanged; otherwise derive a stable safe tag.
  const namespace = typeof prefix === 'string' && /\{[^{}]+\}/.test(prefix) ? prefix : `{${digest(String(prefix))}}`;
  const keys = ['states', 'state-expiry', 'sessions', 'session-expiry', 'cookies'].map(suffix => `${namespace}:auth:${suffix}`);
  const transaction = data => redis.eval(TRANSACTION, keys.length, ...keys, JSON.stringify({ ...data, now: now() }));
  const decode = raw => raw ? JSON.parse(raw) : null;
  const binding = record => ({ sessionId: record.sessionId, userId: record.userId, generation: record.generation });
  const active = (record, hash) => transaction({ op: 'active', ...binding(record), hash });

  function setCookie(res, name, value, age) {
    const serialized = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${base.startsWith('https:') ? '; Secure' : ''}`;
    const previous = res.getHeader('Set-Cookie');
    res.setHeader('Set-Cookie', [...(Array.isArray(previous) ? previous : previous ? [previous] : []), serialized]);
  }
  function identity(result, record) {
    if (!result.authenticated || result.user?.emailVerified !== true || result.user.id !== record.userId || result.sessionId !== record.sessionId) return null;
    try {
      // SDK authentication has verified the seal and JWT signature before decode.
      const claims = JSON.parse(Buffer.from(result.accessToken.split('.')[1], 'base64url').toString());
      if (!Number.isFinite(claims.exp) || claims.sub !== record.userId || claims.sid !== record.sessionId
        || !validWorkOSIssuer(claims.iss)
        || claims.client_id !== clientId) return null;
      const expiresAt = Math.min(claims.exp * 1000, record.expiresAt);
      if (expiresAt <= now()) return null;
      const name = [result.user.firstName, result.user.lastName].filter(part => typeof part === 'string').join(' ').trim().slice(0, 60) || 'Resident';
      return { userId: record.userId, sessionId: record.sessionId, name, expiresAt, csrfToken: record.csrfToken };
    } catch { return null; }
  }

  async function authenticateRequest(req, res) {
    if (!enabled) return null;
    const presented = readCookie(req, SESSION_COOKIE);
    if (!presented) return null;
    const hash = digest(presented), deadline = Date.now() + REFRESH_WAIT;
    while (enabled) {
      const record = decode(await transaction({ op: 'cookie-get', hash }));
      if (!record) return null;
      // Only HTTP can adopt a concurrent refresh and deliver its new cookie.
      const sealed = res ? record.sealedSession : presented;
      const session = sdk.userManagement.loadSealedSession({ sessionData: sealed, cookiePassword });
      const verified = await session.authenticate();
      if (verified.authenticated) {
        const user = identity(verified, record);
        if (!user || !enabled || !await active(record, hash)) return null;
        if (res && sealed !== presented) setCookie(res, SESSION_COOKIE, sealed, Math.floor((record.expiresAt - now()) / 1000));
        return user;
      }
      if (!res || verified.reason !== 'invalid_jwt') return null;
      const owner = token();
      const acquired = await transaction({ op: 'refresh-lock', ...binding(record), hash: record.cookieHash, owner, lease: REFRESH_LEASE });
      if (!acquired) return null;
      if (acquired !== 'ok') {
        if (Date.now() >= deadline) throw new Error('Auth refresh is busy');
        await delay(100); continue;
      }
      try {
        const refreshed = await session.refresh();
        if (!refreshed.authenticated || typeof refreshed.sealedSession !== 'string') return null;
        const renewed = await session.authenticate(), user = identity(renewed, record);
        if (!user) return null;
        const committed = decode(await transaction({ op: 'refresh-commit', ...binding(record), hash: record.cookieHash, owner,
          nextHash: digest(refreshed.sealedSession), sealedSession: refreshed.sealedSession, grace: COOKIE_GRACE }));
        if (!committed || !enabled || !await active(committed, committed.cookieHash)) return null;
        setCookie(res, SESSION_COOKIE, refreshed.sealedSession, Math.floor((record.expiresAt - now()) / 1000));
        return user;
      } finally {
        await transaction({ op: 'refresh-release', ...binding(record), owner });
      }
    }
    return null;
  }

  async function handle(req, res) {
    const path = new URL(req.url, base || 'http://localhost').pathname;
    if (!['/auth/login', '/auth/callback', '/auth/session', '/auth/logout'].includes(path)) return false;
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    if (!enabled) { json(res, 503, { error: 'auth_unavailable' }); return true; }
    const method = path === '/auth/logout' ? 'POST' : 'GET';
    if (req.method !== method) { res.setHeader('Allow', method); json(res, 405, { error: 'method_not_allowed' }); return true; }
    let phase = path;
    try {
      if (path === '/auth/login') {
        const authorization = await sdk.userManagement.getAuthorizationUrlWithPKCE({ provider: 'authkit', clientId, redirectUri: `${base}/auth/callback` });
        if (!enabled || typeof authorization.state !== 'string' || authorization.state.length < 32 || authorization.state.length > 200
          || typeof authorization.codeVerifier !== 'string') throw new Error('Invalid authorization');
        const stored = await transaction({ op: 'state-put', id: digest(authorization.state), ttl: STATE_TTL,
          record: { codeVerifier: authorization.codeVerifier, expiresAt: now() + STATE_TTL } });
        if (!stored) { json(res, 503, { error: 'auth_busy' }); return true; }
        setCookie(res, STATE_COOKIE, authorization.state, STATE_TTL / 1000);
        res.writeHead(302, { Location: authorization.url }); res.end();
      } else if (path === '/auth/callback') {
        const query = new URL(req.url, base).searchParams, state = query.get('state'), code = query.get('code');
        setCookie(res, STATE_COOKIE, '', 0);
        if (!validId(state) || !equal(state, readCookie(req, STATE_COOKIE)) || !code || code.length > 4096 || query.get('error')) {
          json(res, 400, { error: 'invalid_auth_callback' }); return true;
        }
        const pending = decode(await transaction({ op: 'state-take', id: digest(state) }));
        if (!pending || pending.expiresAt <= now()) { json(res, 400, { error: 'invalid_auth_callback' }); return true; }
        phase = 'callback.exchange';
        const result = await sdk.userManagement.authenticateWithCode({ clientId, code, codeVerifier: pending.codeVerifier, session: { sealSession: true, cookiePassword } });
        if (typeof result.sealedSession !== 'string' || result.user?.emailVerified !== true) { json(res, 403, { error: 'verified_email_required' }); return true; }
        phase = 'callback.session';
        const session = sdk.userManagement.loadSealedSession({ sessionData: result.sealedSession, cookiePassword });
        const verified = await session.authenticate();
        if (!validId(verified.sessionId) || !validId(verified.user?.id)) {
          logSessionRejection(verified, {}, clientId, now());
          json(res, 403, { error: 'invalid_session' }); return true;
        }
        const record = { sessionId: verified.sessionId, userId: verified.user.id, generation: token(), csrfToken: token(),
          cookieHash: digest(result.sealedSession), sealedSession: result.sealedSession, expiresAt: now() + SESSION_TTL };
        if (!identity(verified, record)) {
          logSessionRejection(verified, record, clientId, now());
          json(res, 403, { error: 'invalid_session' }); return true;
        }
        if (!enabled) throw new Error('Auth closed');
        phase = 'callback.store';
        const stored = await transaction({ op: 'session-put', record, ttl: SESSION_TTL });
        if (!stored) { json(res, 503, { error: 'auth_busy' }); return true; }
        setCookie(res, SESSION_COOKIE, result.sealedSession, SESSION_TTL / 1000);
        res.writeHead(302, { Location: '/' }); res.end();
      } else if (path === '/auth/session') {
        const user = await authenticateRequest(req, res);
        json(res, 200, user ? { authenticated: true, user: { id: user.userId, name: user.name }, csrfToken: user.csrfToken } : { authenticated: false });
      } else {
        if (req.headers.origin !== base) { json(res, 403, { error: 'invalid_origin' }); return true; }
        const sealed = readCookie(req, SESSION_COOKIE), hash = sealed && digest(sealed);
        const record = hash && decode(await transaction({ op: 'cookie-get', hash }));
        if (!record) { json(res, 401, { error: 'unauthenticated' }); return true; }
        if (!equal(req.headers['x-csrf-token'], record.csrfToken)) { json(res, 403, { error: 'invalid_csrf' }); return true; }
        // Revocation does not wait for access-token refresh. Only an issued cookie
        // and its session-bound CSRF token can reach this atomic deletion.
        const removed = await transaction({ op: 'delete', ...binding(record), hash });
        if (!removed) { json(res, 401, { error: 'unauthenticated' }); return true; }
        setCookie(res, SESSION_COOKIE, '', 0);
        await onLogout(record.userId, record.sessionId);
        const url = sdk.userManagement.getLogoutUrl({ sessionId: record.sessionId, returnTo: `${base}/` });
        json(res, 200, { url });
      }
    } catch (error) {
      console.error('Authentication unavailable', {
        phase, name: error?.name, status: error?.status ?? error?.statusCode ?? error?.response?.status,
      });
      json(res, 503, { error: 'auth_unavailable' });
    }
    return true;
  }
  return {
    handle,
    async authenticate(req, { refresh = false } = {}) {
      try { return await authenticateRequest(req, refresh ? req.res : undefined); } catch { return null; }
    },
    async isSessionActive(userId, sessionId) {
      if (!enabled || !validId(userId) || !validId(sessionId)) return false;
      try { return Boolean(await transaction({ op: 'active', userId, sessionId })); } catch { return false; }
    },
    close() { enabled = false; },
  };
}
