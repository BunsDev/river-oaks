import { createHash, randomBytes } from 'node:crypto';
import { createTurnstileVerifier } from './turnstile.js';
import { CLIENT_ADDRESS } from './client-address.js';

const COOKIE = 'river_oaks_magic_state';
const TTL = 10 * 60_000, COOLDOWN = 60_000, DAY = 86_400_000;
// Every admitted email sign-in makes WorkOS send mail. A global daily budget
// caps that spend (and mail reputation) per UTC day across all servers; past
// it, email sign-in pauses until the next day and GitHub sign-in still works.
export const EMAIL_SIGNIN_DAILY_LIMIT = 2000;
export const emailSignInDailyLimit = env => Math.min(100_000, Math.max(1, Number.parseInt(env.EMAIL_SIGNIN_DAILY_LIMIT ?? '', 10) || EMAIL_SIGNIN_DAILY_LIMIT));
// Each client address gets its own small share of the day's sends, so a few
// addresses cannot spend the whole budget and pause email sign-in for everyone.
export const EMAIL_SIGNIN_PER_ADDRESS = 10;
export const emailSignInPerAddress = env => Math.min(1000, Math.max(1, Number.parseInt(env.EMAIL_SIGNIN_DAILY_PER_ADDRESS ?? '', 10) || EMAIL_SIGNIN_PER_ADDRESS));
// Email sign-in guards read from the environment, shared by both servers.
export function magicOptions(env, origin = null) {
  if (env.TURNSTILE_SECRET_KEY && !env.VITE_TURNSTILE_SITE_KEY) console.warn('TURNSTILE_SECRET_KEY is set without VITE_TURNSTILE_SITE_KEY: email sign-in refuses every request until the site key is built into the page.');
  return { dailySends: emailSignInDailyLimit(env), addressSends: emailSignInPerAddress(env),
    verifyHuman: env.TURNSTILE_SECRET_KEY ? createTurnstileVerifier({ secret: env.TURNSTILE_SECRET_KEY, hostname: origin ? new URL(origin).hostname : null }) : null };
}
const token = () => randomBytes(32).toString('base64url');
const digest = value => createHash('sha256').update(value).digest('base64url');
export const normalizeAuthEmail = value => typeof value === 'string' && value.trim().length <= 254
  && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : null;

// Admission, cooldown, attempt reservation and consumption are each atomic.
// An exchange holds its state until failure or consumption, so peers cannot
// create two sessions even if the upstream provider accepts a code twice.
const SCRIPT = `
local p = cjson.decode(ARGV[1])
for _, id in ipairs(redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', p.now)) do
  redis.call('HDEL', KEYS[1], id)
  redis.call('ZREM', KEYS[2], id)
end
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', p.now)
if p.op == 'start' then
  if redis.call('ZSCORE', KEYS[3], p.emailHash) then return 'cooldown' end
  if tonumber(redis.call('GET', KEYS[4]) or '0') >= p.dailySends then return 'budget' end
  local addressed = p.addressHash ~= nil and p.addressHash ~= cjson.null
  if addressed and tonumber(redis.call('GET', KEYS[5]) or '0') >= p.addressSends then return 'address' end
  -- Full tables give up their oldest entries instead of refusing every new
  -- sign-in, so a flood of distinct addresses cannot lock everyone out.
  while redis.call('HLEN', KEYS[1]) >= p.maxStates do
    local oldest = redis.call('ZRANGE', KEYS[2], 0, 0)[1]
    if not oldest then return 'full' end
    redis.call('HDEL', KEYS[1], oldest)
    redis.call('ZREM', KEYS[2], oldest)
  end
  while redis.call('ZCARD', KEYS[3]) >= p.maxStates do redis.call('ZPOPMIN', KEYS[3]) end
  redis.call('HSET', KEYS[1], p.id, cjson.encode(p.record))
  redis.call('ZADD', KEYS[2], p.record.expiresAt, p.id)
  redis.call('ZADD', KEYS[3], p.now + p.cooldown, p.emailHash)
  for i = 1, 3 do redis.call('PEXPIRE', KEYS[i], p.ttl) end
  redis.call('INCR', KEYS[4])
  redis.call('PEXPIRE', KEYS[4], 2 * p.day)
  if addressed then
    redis.call('INCR', KEYS[5])
    redis.call('PEXPIRE', KEYS[5], 2 * p.day)
  end
  return 'ok'
end
local raw = redis.call('HGET', KEYS[1], p.id)
if not raw then return false end
local record = cjson.decode(raw)
if p.op == 'attempt' then
  if record.owner or record.attempts >= 5 then return 'limited' end
  record.attempts = record.attempts + 1
  record.owner = p.owner
  redis.call('HSET', KEYS[1], p.id, cjson.encode(record))
  return cjson.encode(record)
elseif p.op == 'release' then
  if record.owner ~= p.owner then return false end
  record.owner = nil
  redis.call('HSET', KEYS[1], p.id, cjson.encode(record))
  return 'ok'
elseif p.op == 'consume' then
  if record.owner ~= p.owner then return false end
  redis.call('HDEL', KEYS[1], p.id)
  redis.call('ZREM', KEYS[2], p.id)
  return 'ok'
end
return false
`;

export function createMagicStore({ redis, namespace, now = Date.now, maxStates = 20_000, dailySends = EMAIL_SIGNIN_DAILY_LIMIT, addressSends = EMAIL_SIGNIN_PER_ADDRESS } = {}) {
  const states = new Map(), cooldowns = new Map(), sends = new Map(), addressCounts = new Map();
  const keys = ['magic-states', 'magic-expiry', 'magic-cooldown'].map(s => `${namespace}:auth:${s}`);
  async function transaction(p) {
    const time = now(), day = Math.floor(time / DAY);
    if (redis) return redis.eval(SCRIPT, keys.length + 2, ...keys, `${namespace}:auth:magic-sends:${day}`, `${namespace}:auth:magic-sends:${day}:${p.addressHash ?? '-'}`,
      JSON.stringify({ ...p, now: time, ttl: TTL, cooldown: COOLDOWN, maxStates, dailySends, addressSends, day: DAY }));
    for (const [id, record] of states) if (record.expiresAt <= time) states.delete(id);
    for (const [id, expiresAt] of cooldowns) if (expiresAt <= time) cooldowns.delete(id);
    for (const key of sends.keys()) if (key !== day) sends.delete(key);
    for (const key of addressCounts.keys()) if (!key.startsWith(`${day}:`)) addressCounts.delete(key);
    const addressKey = p.addressHash ? `${day}:${p.addressHash}` : null;
    if (p.op === 'start') {
      if (cooldowns.has(p.emailHash)) return 'cooldown';
      if ((sends.get(day) ?? 0) >= dailySends) return 'budget';
      if (addressKey && (addressCounts.get(addressKey) ?? 0) >= addressSends) return 'address';
      // As in Redis: the oldest entries give way instead of refusing every sign-in.
      const oldest = map => [...map].reduce((a, b) => (b[1].expiresAt ?? b[1]) < (a[1].expiresAt ?? a[1]) ? b : a)[0];
      while (states.size >= maxStates) states.delete(oldest(states));
      while (cooldowns.size >= maxStates) cooldowns.delete(oldest(cooldowns));
      states.set(p.id, p.record); cooldowns.set(p.emailHash, time + COOLDOWN); sends.set(day, (sends.get(day) ?? 0) + 1);
      if (addressKey) addressCounts.set(addressKey, (addressCounts.get(addressKey) ?? 0) + 1);
      return 'ok';
    }
    const record = states.get(p.id);
    if (!record) return null;
    if (p.op === 'attempt') {
      if (record.owner || record.attempts >= 5) return 'limited';
      record.attempts++; record.owner = p.owner; return JSON.stringify(record);
    }
    if (record.owner !== p.owner) return null;
    if (p.op === 'consume') states.delete(p.id);
    else if (p.op === 'release') delete record.owner;
    return 'ok';
  }
  return { transaction, close() { states.clear(); cooldowns.clear(); sends.clear(); addressCounts.clear(); } };
}

export function createMagicAuth({ sdk, clientId, cookiePassword, base, setCookie, readCookie, json, finishSignIn, store, now = Date.now, verifyHuman = null }) {
  return async function handleMagic(req, res, path) {
    if (req.headers.origin !== base) { json(res, 403, { error: 'invalid_origin' }); return; }
    if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') { json(res, 415, { error: 'unsupported_media_type' }); return; }
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 4096) { json(res, 413, { error: 'request_too_large' }); return; } chunks.push(chunk); }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* Invalid JSON. */ }
    if (!body || typeof body !== 'object' || Array.isArray(body)) { json(res, 400, { error: 'invalid_request' }); return; }
    if (path === '/auth/email/start') {
      const email = normalizeAuthEmail(body.email);
      if (!email) { json(res, 400, { error: 'invalid_email' }); return; }
      // With Turnstile on, only a verified browser may spend the email budget.
      if (verifyHuman && !await verifyHuman(body.turnstileToken)) { json(res, 403, { error: 'challenge_failed' }); return; }
      const state = token();
      const address = req[CLIENT_ADDRESS];
      const admission = await store.transaction({ op: 'start', id: digest(state), emailHash: digest(email), addressHash: typeof address === 'string' && address ? digest(address) : null,
        record: { email, attempts: 0, expiresAt: now() + TTL } });
      // A throttled request has not sent mail or created browser state. Keep
      // any existing state cookie so an already-open verification can finish.
      if (admission === 'cooldown') { json(res, 200, { sent: false, retryAfter: COOLDOWN / 1000 }); return; }
      if (admission === 'full') { json(res, 503, { error: 'auth_busy' }); return; }
      if (admission === 'budget') { json(res, 503, { error: 'email_paused' }); return; }
      if (admission === 'address') { json(res, 429, { error: 'email_limited' }); return; }
      if (admission === 'ok') {
        // Keep codes and provider responses entirely server-side. WorkOS sends
        // the email; a valid address receives the same response regardless of
        // account existence or an upstream account-level rejection.
        setCookie(res, COOKIE, state, TTL / 1000);
        try { await sdk.userManagement.createMagicAuth({ email }); }
        catch (error) {
          const status = error?.status ?? error?.statusCode ?? error?.response?.status;
          if (!(status >= 400 && status < 500)) throw error;
        }
      }
      json(res, 200, { sent: true }); return;
    }
    if (typeof body.code !== 'string' || !/^[0-9]{6}$/.test(body.code)) { json(res, 400, { error: 'invalid_code' }); return; }
    const state = readCookie(req, COOKIE);
    if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) { json(res, 400, { error: 'verification_expired' }); return; }
    const id = digest(state), owner = token();
    const raw = await store.transaction({ op: 'attempt', id, owner });
    if (!raw) { setCookie(res, COOKIE, '', 0); json(res, 400, { error: 'verification_expired' }); return; }
    if (raw === 'limited') { json(res, 429, { error: 'verification_attempts_exceeded' }); return; }
    const pending = JSON.parse(raw);
    let result;
    try {
      result = await sdk.userManagement.authenticateWithMagicAuth({ clientId, email: pending.email, code: body.code, session: { sealSession: true, cookiePassword } });
    } catch (error) {
      await store.transaction({ op: 'release', id, owner });
      const status = error?.status ?? error?.statusCode ?? error?.response?.status;
      if (status >= 400 && status < 500) { json(res, 400, { error: 'invalid_code' }); return; }
      throw error;
    }
    // The state must still exist (not expired) and be owned by this exchange.
    if (!await store.transaction({ op: 'consume', id, owner })) { json(res, 400, { error: 'verification_expired' }); return; }
    setCookie(res, COOKIE, '', 0);
    if (normalizeAuthEmail(result.user?.email) !== pending.email) { json(res, 403, { error: 'invalid_session' }); return; }
    await finishSignIn(result, 'MagicAuth', res, true);
  };
}
