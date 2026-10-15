import { createHash, randomBytes } from 'node:crypto';
import { validateWorldId } from '../preview/src/world-contract.js';
import { createLiveKitClient, livekitConfigured } from './livekit-client.js';

// Shared voice: a player's audio belongs to one LiveKit room per deployment
// namespace, world and interior ("space"). The transport derives the space from
// the authoritative world; a client never names a room or an identity. A lease
// ties the random participant identity to the player's current game connection
// so a stale tab cannot renew or release its successor's voice.
export const VOICE_LEASE_TTL_MS = 45_000, VOICE_RENEW_MS = 15_000, VOICE_TOKEN_TTL_S = 60;
export const VOICE_MAX_PER_SPACE = 32, VOICE_MAX_LEASES = 256, VOICE_DAILY_JOINS = 5000;
// A page moving to a fresh town socket (server/connection-close.js) moves its lease to the new
// connection within moments. Until then a lease naming another connection is kept; after this
// long (another tab took over, or the page died) it is revoked.
export const VOICE_MOVE_GRACE_MS = 3_000;
export const OUTDOOR_SPACE = 'outdoor';
const FAILURES_BEFORE_PAUSE = 3, PAUSE_MS = 60_000, MAX_READ = 64;
// A player must sit in another space for this many reconciles (600 ms on the
// hosted 200 ms tick) before the old room's lease ends, so a doorway does not
// flap. Removals run behind the tick; past this many in flight the sweep takes over.
const SPACE_CHANGE_TICKS = 3, MAX_REMOVALS_IN_FLIGHT = 8;
const NAMESPACE = /^[A-Za-z0-9:_-]{1,120}$/, SAFE_SPACE = /^[A-Za-z0-9_-]{1,64}$/, ROOM = /^[A-Za-z0-9._-]{1,200}$/, PARTICIPANT = /^[A-Za-z0-9_-]{1,64}$/;
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);
const clamp = (value, fallback, min, max) => Math.min(max, Math.max(min, Number.parseInt(value ?? '', 10) || fallback));
export const voiceDailyLimit = env => clamp(env.VOICE_DAILY_JOINS, VOICE_DAILY_JOINS, 1, 50_000);
export const voiceMaxLeases = env => clamp(env.VOICE_MAX_LEASES, VOICE_MAX_LEASES, 1, 1024);

// Rooms of one namespace share a prefix, so a sweep can tell its own rooms
// from another deployment's in the same LiveKit project.
export function voiceRoomPrefix(namespace) {
  if (typeof namespace !== 'string' || !NAMESPACE.test(namespace)) throw new Error('Invalid voice namespace');
  return namespace.replaceAll(':', '.') + '.';
}
export function voiceSpaceName({ namespace, worldId, space }) {
  const prefix = voiceRoomPrefix(namespace);
  validateWorldId(worldId);
  if (typeof space !== 'string' || !space) throw new Error('Invalid voice space');
  const safe = SAFE_SPACE.test(space) ? space : createHash('sha256').update(space).digest('hex').slice(0, 16);
  const name = `${prefix}${worldId}.${safe}`;
  if (!ROOM.test(name)) throw new Error('Invalid voice room');
  return name;
}

const validLease = value => value !== null && typeof value === 'object' && validId(value.userId) && validId(value.connectionId)
  && typeof value.worldId === 'string' && typeof value.space === 'string' && typeof value.room === 'string' && ROOM.test(value.room)
  && typeof value.participantIdentity === 'string' && PARTICIPANT.test(value.participantIdentity)
  && Number.isFinite(value.issuedAt) && Number.isFinite(value.expiresAt) && Number.isSafeInteger(value.revision) && value.revision >= 0;
const copyLease = lease => ({ userId: lease.userId, worldId: lease.worldId, space: lease.space, room: lease.room, participantIdentity: lease.participantIdentity,
  connectionId: lease.connectionId, issuedAt: lease.issuedAt, expiresAt: lease.expiresAt, revision: lease.revision });
const member = lease => ({ userId: lease.userId, participantIdentity: lease.participantIdentity, connectionId: lease.connectionId, expiresAt: lease.expiresAt });
const idsForRead = ids => {
  if (!Array.isArray(ids) || ids.length > MAX_READ || ids.some(id => !validId(id))) throw new Error('Invalid voice lookup');
  return [...new Set(ids)];
};
const fenced = (lease, connectionId) => validId(lease?.userId) && validId(connectionId);

export function createMemoryVoiceLeases({ now = Date.now } = {}) {
  const records = new Map();
  const current = userId => {
    const record = records.get(userId);
    if (record && record.expiresAt <= now()) { records.delete(userId); return null; }
    return record ?? null;
  };
  const prune = () => { for (const userId of [...records.keys()]) current(userId); };
  return {
    async issue(lease, { maxLeases = VOICE_MAX_LEASES } = {}) {
      if (!validLease(lease)) throw new Error('Invalid voice lease');
      prune();
      const replaced = current(lease.userId);
      if (!replaced && records.size >= maxLeases) return { status: 'capacity', replaced: null };
      records.set(lease.userId, copyLease(lease));
      return { status: 'ok', replaced: replaced ? copyLease(replaced) : null };
    },
    async touch(userId, connectionId, expiresAt) {
      if (!validId(userId) || !validId(connectionId) || !Number.isFinite(expiresAt)) throw new Error('Invalid voice lease');
      const record = current(userId);
      if (!record || record.connectionId !== connectionId) return null;
      record.expiresAt = expiresAt; record.revision += 1;
      return copyLease(record);
    },
    async release(userId, connectionId) {
      if (!validId(userId) || !validId(connectionId)) throw new Error('Invalid voice lease');
      const record = current(userId);
      if (!record || record.connectionId !== connectionId) return null;
      records.delete(userId);
      return copyLease(record);
    },
    async move(userId, fromConnectionId, toConnectionId) {
      if (!validId(userId) || !validId(fromConnectionId) || !validId(toConnectionId)) throw new Error('Invalid voice lease');
      const record = current(userId);
      if (!record || record.connectionId !== fromConnectionId) return null;
      record.connectionId = toConnectionId; record.revision += 1;
      return copyLease(record);
    },
    async revoke(userId) {
      if (!validId(userId)) throw new Error('Invalid voice lease');
      const record = current(userId);
      if (!record) return null;
      records.delete(userId);
      return copyLease(record);
    },
    async getMany(ids) {
      const result = new Map();
      for (const userId of idsForRead(ids)) { const record = current(userId); if (record) result.set(userId, copyLease(record)); }
      return result;
    },
    async rooms() { prune(); return [...new Set([...records.values()].map(record => record.room))]; },
    async members(room) { prune(); return [...records.values()].filter(record => record.room === room).map(member); },
  };
}

// Redis: one lease per account under a hashed key, plus one sorted set of live
// leases scored by expiry for the capacity check and the room listings. Every
// mutation is one script, fenced by the stored connection id like presence.js.
const ISSUE = `
local now = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
local old = redis.call('GET', KEYS[1])
if old and tonumber(cjson.decode(old).expiresAt) <= now then old = false end
if not old and redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[4]) then return {0, false} end
redis.call('SET', KEYS[1], ARGV[2], 'PX', tonumber(ARGV[3]))
redis.call('ZADD', KEYS[2], tonumber(ARGV[5]), ARGV[6])
return {1, old or false}
`;
const TOUCH = `
local old = redis.call('GET', KEYS[1])
if not old then return false end
local lease = cjson.decode(old)
if lease.connectionId ~= ARGV[1] or tonumber(lease.expiresAt) <= tonumber(ARGV[2]) then return false end
lease.expiresAt = tonumber(ARGV[3])
lease.revision = lease.revision + 1
local encoded = cjson.encode(lease)
redis.call('SET', KEYS[1], encoded, 'PX', tonumber(ARGV[4]))
redis.call('ZADD', KEYS[2], tonumber(ARGV[3]), ARGV[5])
return encoded
`;
// Moves a live lease to the connection its page moved to, fenced by the one it left.
const MOVE = `
local old = redis.call('GET', KEYS[1])
if not old then return false end
local lease = cjson.decode(old)
if lease.connectionId ~= ARGV[1] or tonumber(lease.expiresAt) <= tonumber(ARGV[3]) then return false end
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return false end
lease.connectionId = ARGV[2]
lease.revision = lease.revision + 1
local encoded = cjson.encode(lease)
redis.call('SET', KEYS[1], encoded, 'PX', ttl)
return encoded
`;
const RELEASE = `
local old = redis.call('GET', KEYS[1])
if not old then return false end
local lease = cjson.decode(old)
if ARGV[1] ~= '' and lease.connectionId ~= ARGV[1] then return false end
redis.call('DEL', KEYS[1])
redis.call('ZREM', KEYS[2], ARGV[3])
if tonumber(lease.expiresAt) <= tonumber(ARGV[2]) then return false end
return old
`;

export function createRedisVoiceLeases({ redis, prefix, now = Date.now } = {}) {
  if (!redis?.eval || !redis?.mget || typeof prefix !== 'string' || !/^\{[^{}]+\}$/.test(prefix)) throw new Error('Invalid voice lease storage');
  const hash = userId => createHash('sha256').update(userId).digest('hex');
  const key = userId => `${prefix}:voice:v1:lease:${hash(userId)}`;
  const keyOfHash = digest => `${prefix}:voice:v1:lease:${digest}`;
  const all = `${prefix}:voice:v1:all`;
  const decode = raw => {
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!validLease(value)) throw new Error('Invalid voice lease record');
    return value.expiresAt <= now() ? null : copyLease(value);
  };
  const ttl = lease => Math.max(1, Math.round(lease.expiresAt - now()));
  async function liveLeases() {
    const digests = await redis.zrangebyscore(all, `(${now()}`, '+inf');
    if (!digests.length) return [];
    const values = await redis.mget(...digests.map(keyOfHash));
    return values.map(decode).filter(Boolean);
  }
  return {
    async issue(lease, { maxLeases = VOICE_MAX_LEASES } = {}) {
      if (!validLease(lease)) throw new Error('Invalid voice lease');
      const [issued, old] = await redis.eval(ISSUE, 2, key(lease.userId), all, now(), JSON.stringify(copyLease(lease)), ttl(lease), maxLeases, lease.expiresAt, hash(lease.userId));
      if (issued !== 1) return { status: 'capacity', replaced: null };
      return { status: 'ok', replaced: decode(old) };
    },
    async touch(userId, connectionId, expiresAt) {
      if (!validId(userId) || !validId(connectionId) || !Number.isFinite(expiresAt)) throw new Error('Invalid voice lease');
      return decode(await redis.eval(TOUCH, 2, key(userId), all, connectionId, now(), expiresAt, Math.max(1, Math.round(expiresAt - now())), hash(userId)));
    },
    async release(userId, connectionId) {
      if (!validId(userId) || !validId(connectionId)) throw new Error('Invalid voice lease');
      return decode(await redis.eval(RELEASE, 2, key(userId), all, connectionId, now(), hash(userId)));
    },
    async revoke(userId) {
      if (!validId(userId)) throw new Error('Invalid voice lease');
      return decode(await redis.eval(RELEASE, 2, key(userId), all, '', now(), hash(userId)));
    },
    async move(userId, fromConnectionId, toConnectionId) {
      if (!validId(userId) || !validId(fromConnectionId) || !validId(toConnectionId)) throw new Error('Invalid voice lease');
      return decode(await redis.eval(MOVE, 1, key(userId), fromConnectionId, toConnectionId, now()));
    },
    async getMany(ids) {
      const unique = idsForRead(ids);
      if (!unique.length) return new Map();
      const values = await redis.mget(...unique.map(key));
      const result = new Map();
      values.forEach((raw, index) => { const lease = decode(raw); if (lease) result.set(unique[index], lease); });
      return result;
    },
    async rooms() { return [...new Set((await liveLeases()).map(lease => lease.room))]; },
    async members(room) { return (await liveLeases()).filter(lease => lease.room === room).map(member); },
  };
}

export function createVoiceService({ leases, livekit, namespace, allow, now = Date.now, monotonic = () => performance.now(), dailyLimit = VOICE_DAILY_JOINS, maxPerSpace = VOICE_MAX_PER_SPACE,
  maxLeases = VOICE_MAX_LEASES, leaseTtlMs = VOICE_LEASE_TTL_MS, renewMs = VOICE_RENEW_MS, tokenTtlSeconds = VOICE_TOKEN_TTL_S, log = console } = {}) {
  if (!leases || !livekit || typeof allow !== 'function') throw new Error('Invalid voice configuration');
  const roomPrefix = voiceRoomPrefix(namespace);
  // Spend and failure control as in chauffeur.js: a global daily join budget,
  // and a pause after three provider failures in a row. While paused, no token
  // is minted and status reports voice unavailable.
  let failures = 0, pausedUntil = 0;
  const paused = () => now() < pausedUntil;
  const unavailable = () => ({ ok: false, reason: 'voice_unavailable' });
  const warn = event => log.warn?.(JSON.stringify({ event }));
  async function provider(call) {
    if (paused()) throw new Error('livekit_unavailable');
    try { const result = await call(); failures = 0; return result; }
    catch {
      if (++failures >= FAILURES_BEFORE_PAUSE) { failures = 0; pausedUntil = now() + PAUSE_MS; warn('voice_provider_paused'); }
      throw new Error('livekit_unavailable');
    }
  }
  const remove = (room, identity) => provider(() => livekit.removeParticipant(room, identity)).then(() => true, () => false);
  const deleteRoom = room => provider(() => livekit.deleteRoom(room)).then(() => true, () => false);
  // Removals behind a world tick never wait for the provider; a removal that
  // does not fit is left to the sweep, which lists every room's participants.
  const inFlight = new Set();
  const removeLater = (room, identity) => {
    if (inFlight.size >= MAX_REMOVALS_IN_FLIGHT) return;
    const task = remove(room, identity).finally(() => inFlight.delete(task));
    inFlight.add(task);
  };
  const mismatches = new Map(), moving = new Map();
  let sweepTimer = null;
  async function join({ userId, worldId, connectionId, space }) {
    if (!validId(userId) || !validId(connectionId)) return { ok: false, reason: 'stale_connection' };
    if (space === null || space === undefined) return { ok: false, reason: 'no_space' };
    try {
      if (paused()) return unavailable();
      const room = voiceSpaceName({ namespace, worldId, space });
      if (!await allow('voice_daily', 'global', dailyLimit, 86_400_000)) return { ok: false, reason: 'budget_exhausted' };
      const members = await leases.members(room);
      if (members.filter(item => item.userId !== userId).length >= maxPerSpace) return { ok: false, reason: 'space_full' };
      const time = now(), participantIdentity = randomBytes(18).toString('base64url');
      const lease = { userId, worldId, space, room, participantIdentity, connectionId, issuedAt: time, expiresAt: time + leaseTtlMs, revision: 0 };
      const issued = await leases.issue(lease, { maxLeases });
      if (issued.status !== 'ok') return { ok: false, reason: issued.status };
      if (issued.replaced) void remove(issued.replaced.room, issued.replaced.participantIdentity);
      let token;
      try { token = await provider(() => livekit.token({ room, identity: participantIdentity, ttlSeconds: tokenTtlSeconds })); }
      catch { await leases.release(userId, connectionId).catch(() => null); return unavailable(); }
      return { ok: true, url: livekit.url, token, space, participantIdentity, expiresAt: lease.expiresAt, renewMs };
    } catch { warn('voice_storage_unavailable'); return unavailable(); }
  }
  async function renew({ userId, worldId, connectionId, space, participantIdentity }) {
    if (!validId(userId) || !validId(connectionId)) return { ok: false, reason: 'stale_connection' };
    try {
      const lease = (await leases.getMany([userId])).get(userId);
      if (!lease) return { ok: false, reason: 'no_lease' };
      if (lease.connectionId !== connectionId || lease.participantIdentity !== participantIdentity || lease.worldId !== worldId) return { ok: false, reason: 'stale_connection' };
      if ((space ?? null) !== lease.space) {
        // Audio for the old room stops before any token for a new one exists.
        await leases.release(userId, connectionId);
        await remove(lease.room, lease.participantIdentity);
        return { ok: false, reason: 'space_changed', space: space ?? null };
      }
      if (paused()) return unavailable();
      const touched = await leases.touch(userId, connectionId, now() + leaseTtlMs);
      if (!touched) return { ok: false, reason: 'no_lease' };
      let token;
      try { token = await provider(() => livekit.token({ room: lease.room, identity: lease.participantIdentity, ttlSeconds: tokenTtlSeconds })); }
      catch { return unavailable(); }
      return { ok: true, token, expiresAt: touched.expiresAt, renewMs, space: lease.space };
    } catch { warn('voice_storage_unavailable'); return unavailable(); }
  }
  async function leave({ userId, connectionId = null, participantIdentity }) {
    if (!validId(userId)) return { ok: true, left: false };
    try {
      const lease = (await leases.getMany([userId])).get(userId);
      if (!lease || lease.participantIdentity !== participantIdentity || (connectionId && lease.connectionId !== connectionId)) return { ok: true, left: false };
      // Without a live connection (a closing tab) the lease is stale by definition.
      const released = connectionId ? await leases.release(userId, connectionId) : await leases.revoke(userId);
      if (!released) return { ok: true, left: false };
      await remove(released.room, released.participantIdentity);
      return { ok: true, left: true };
    } catch { warn('voice_storage_unavailable'); return { ok: true, left: false }; }
  }
  // The page moved to a fresh town socket and named the connection it left (only that page
  // knows it): its lease follows, so voice carries on without rejoining. Fenced like every
  // other lease mutation by the stored connection id.
  async function continueConnection({ userId, from, to }) {
    if (!validId(userId) || !validId(from) || !validId(to) || from === to) return false;
    try { moving.delete(userId); return Boolean(await leases.move(userId, from, to)); }
    catch { warn('voice_storage_unavailable'); return false; }
  }
  async function revokeUser(userId) {
    if (!validId(userId)) return false;
    try {
      const lease = await leases.revoke(userId);
      if (!lease) return false;
      await remove(lease.room, lease.participantIdentity);
      return true;
    } catch { warn('voice_storage_unavailable'); return false; }
  }
  // Called by whoever owns a world's authoritative presence (the hosted room's
  // lease holder each tick, the standalone town each second). `present` is every
  // live connection with its current space; `removed` is everyone that tick
  // took out of the world. Answers each present player's participant identity,
  // or null, for the snapshot. Storage errors propagate so the caller can log
  // and try again next tick.
  async function reconcileWorld({ worldId, present, removed = [] }) {
    if (!Array.isArray(present) || !Array.isArray(removed) || present.some(item => !validId(item?.userId) || !validId(item?.connectionId))) throw new Error('Invalid voice presence');
    for (const userId of removed) {
      mismatches.delete(userId); moving.delete(userId);
      if (!validId(userId)) continue;
      const lease = await leases.revoke(userId);
      if (lease) removeLater(lease.room, lease.participantIdentity);
    }
    const ids = [...new Set(present.map(item => item.userId))], found = new Map();
    for (let index = 0; index < ids.length; index += MAX_READ) for (const [userId, lease] of await leases.getMany(ids.slice(index, index + MAX_READ))) found.set(userId, lease);
    const result = new Map();
    for (const { userId, connectionId, space } of present) {
      const lease = found.get(userId);
      if (!lease) { mismatches.delete(userId); moving.delete(userId); result.set(userId, null); continue; }
      let revoke = lease.worldId !== worldId || space === null || space === undefined;
      // A lease naming another connection: a page mid hand-over is moving it here; anything
      // else (another tab, a page that died) is revoked once the grace runs out.
      if (!revoke && lease.connectionId !== connectionId) {
        const since = moving.get(userId) ?? now();
        moving.set(userId, since);
        if (now() - since < VOICE_MOVE_GRACE_MS) { result.set(userId, lease.participantIdentity); continue; }
        revoke = true;
      } else moving.delete(userId);
      if (!revoke && space !== lease.space) {
        const count = (mismatches.get(userId) ?? 0) + 1;
        if (count >= SPACE_CHANGE_TICKS) revoke = true; else mismatches.set(userId, count);
      } else if (!revoke) mismatches.delete(userId);
      if (!revoke) { result.set(userId, lease.participantIdentity); continue; }
      mismatches.delete(userId); moving.delete(userId);
      const gone = await leases.revoke(userId);
      if (gone) removeLater(gone.room, gone.participantIdentity);
      result.set(userId, null);
    }
    return result;
  }
  // Removes every participant of this namespace's rooms that has no live lease
  // (expired, revoked while the provider was down, or never ours), and deletes
  // rooms nobody holds a lease for. Idempotent; any instance may run it. Rooms of
  // other namespaces in the same LiveKit project are never touched.
  async function sweep({ budgetMs = 20_000 } = {}) {
    const result = { ok: true, rooms: 0, removed: 0, deletedRooms: 0, failures: 0, complete: false };
    const started = monotonic(), within = () => monotonic() - started < budgetMs;
    try {
      const rooms = await leases.rooms(), known = new Set(rooms);
      for (const name of rooms) {
        if (!within()) return result;
        const held = new Set((await leases.members(name)).map(item => item.participantIdentity));
        let participants;
        try { participants = await provider(() => livekit.listParticipants(name)); } catch { result.failures++; return result; }
        result.rooms++;
        for (const participant of participants) {
          if (held.has(participant.identity)) continue;
          if (await remove(name, participant.identity)) result.removed++;
          else { result.failures++; if (paused()) return result; }
        }
        if (!held.size) { if (await deleteRoom(name)) result.deletedRooms++; else result.failures++; }
      }
      if (!within()) return result;
      let listed;
      try { listed = await provider(() => livekit.listRooms()); } catch { result.failures++; return result; }
      for (const { name } of listed) {
        if (!name.startsWith(roomPrefix) || known.has(name)) continue;
        if (!within()) return result;
        if (await deleteRoom(name)) result.deletedRooms++; else result.failures++;
      }
      result.complete = true;
      return result;
    } catch { warn('voice_storage_unavailable'); result.ok = false; return result; }
  }
  // Long-lived hosts sweep on a timer; on Vercel the per-minute cron calls sweep().
  function sweepEvery(ms) {
    if (sweepTimer) clearInterval(sweepTimer);
    sweepTimer = setInterval(() => { void sweep().catch(() => {}); }, ms);
    sweepTimer.unref?.();
  }
  return {
    join, renew, leave, revokeUser, continueConnection, reconcileWorld, sweep, sweepEvery,
    status: () => ({ enabled: true, available: !paused(), renewMs }),
    close() { if (sweepTimer) clearInterval(sweepTimer); sweepTimer = null; },
  };
}

// Builds the service from the environment, or nothing: off unless
// RIVER_OAKS_VOICE=on, and off with a warning when LiveKit is not configured.
export function configureVoice({ env = process.env, leases, allow, namespace, sweepMs = 0, log = console } = {}) {
  if (env.RIVER_OAKS_VOICE !== 'on') return null;
  if (!livekitConfigured(env)) { log.warn?.(JSON.stringify({ event: 'voice_not_configured' })); return null; }
  const voice = createVoiceService({ leases, allow, log, namespace: env.RIVER_OAKS_VOICE_NAMESPACE || namespace,
    livekit: createLiveKitClient({ url: env.LIVEKIT_URL, apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET }),
    dailyLimit: voiceDailyLimit(env), maxLeases: voiceMaxLeases(env) });
  if (sweepMs > 0) voice.sweepEvery(sweepMs);
  return voice;
}
