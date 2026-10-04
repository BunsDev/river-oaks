import { randomBytes } from 'node:crypto';
import { DEFAULT_WORLD_ID, validateWorldId } from '../preview/src/world-contract.js';

const LIMIT = `
local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ARGV[2])
for _, key in ipairs(expired) do redis.call('HDEL', KEYS[1], key) end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[2])
local count = redis.call('HGET', KEYS[1], ARGV[1])
if not count and redis.call('HLEN', KEYS[1]) >= 4096 then return 0 end
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[4]) * 2)
redis.call('PEXPIRE', KEYS[2], tonumber(ARGV[4]) * 2)
if count and tonumber(count) >= tonumber(ARGV[3]) then return 0 end
if not count then redis.call('ZADD', KEYS[2], tonumber(ARGV[2]) + tonumber(ARGV[4]), ARGV[1]) end
redis.call('HINCRBY', KEYS[1], ARGV[1], 1)
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[4]) * 2)
redis.call('PEXPIRE', KEYS[2], tonumber(ARGV[4]) * 2)
return 1`;

const ISSUE = `
local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ARGV[1])
for _, key in ipairs(expired) do redis.call('HDEL', KEYS[1], key) end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[1])
if redis.call('HEXISTS', KEYS[3], ARGV[4]) == 1 or redis.call('HLEN', KEYS[1]) >= 512 then return 0 end
redis.call('HSET', KEYS[1], ARGV[2], ARGV[3])
redis.call('ZADD', KEYS[2], tonumber(ARGV[1]) + 15000, ARGV[2])
redis.call('PEXPIRE', KEYS[1], 15000)
redis.call('PEXPIRE', KEYS[2], 15000)
return 1`;

const CONSUME = `
local value = redis.call('HGET', KEYS[1], ARGV[1])
local expires = redis.call('ZSCORE', KEYS[2], ARGV[1])
if not value then return 0 end
if not expires or tonumber(expires) <= tonumber(ARGV[2]) then
  redis.call('HDEL', KEYS[1], ARGV[1]); redis.call('ZREM', KEYS[2], ARGV[1]); return 0
end
local user = cjson.decode(value)
if user.userId ~= ARGV[3] or user.sessionId ~= ARGV[4] or (user.worldId or 'river-oaks') ~= ARGV[5] or redis.call('HEXISTS', KEYS[3], ARGV[3]) == 1 then return 0 end
redis.call('HDEL', KEYS[1], ARGV[1]); redis.call('ZREM', KEYS[2], ARGV[1])
return 1`;

const BAN = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 and redis.call('HLEN', KEYS[1]) >= 10000 then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
local tickets = redis.call('HGETALL', KEYS[3])
for i = 1, #tickets, 2 do
  if cjson.decode(tickets[i + 1]).userId == ARGV[1] then
    redis.call('HDEL', KEYS[3], tickets[i]); redis.call('ZREM', KEYS[4], tickets[i])
  end
end
redis.call('LPUSH', KEYS[2], ARGV[2]); redis.call('LTRIM', KEYS[2], 0, 9999)
return 1`;

const UNBAN = `
local removed = redis.call('HDEL', KEYS[1], ARGV[1])
if removed == 0 then return 0 end
redis.call('LPUSH', KEYS[2], ARGV[2]); redis.call('LTRIM', KEYS[2], 0, 9999)
return 1`;

const AUDIT = `redis.call('LPUSH', KEYS[1], ARGV[1]); redis.call('LTRIM', KEYS[1], 0, 9999); return 1`;
const text = (value, max = 100) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const identity = user => user && text(user.userId) && text(user.sessionId);

/** Shared security state. The caller owns the Redis connection and authenticates moderators. */
export function createRedisSecurity({ redis, prefix, now = Date.now }) {
  if (!redis || typeof redis.eval !== 'function' || typeof prefix !== 'string' || !/^[A-Za-z0-9:{}_-]{1,160}$/.test(prefix)) throw new Error('Invalid Redis security configuration');
  const key = suffix => `${prefix}:${suffix}`;
  const execute = (script, keys, args) => redis.eval(script, keys.length, ...keys.map(key), ...args);
  const limited = async (scope, id, limit, windowMs) => {
    if (!text(id, 256) || !Number.isInteger(limit) || limit < 1 || limit > 10000 || !Number.isInteger(windowMs) || windowMs < 1 || windowMs > 3600000) return false;
    return await execute(LIMIT, [`limit:${scope}:counts`, `limit:${scope}:expiry`], [id, now(), limit, windowMs]) === 1;
  };
  const event = (kind, record) => {
    if (!text(kind, 32) || !/^[a-z][a-z0-9_-]*$/.test(kind) || !record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid audit event');
    const serialized = JSON.stringify({ ...record, kind, at: new Date(now()).toISOString() });
    if (Buffer.byteLength(serialized) > 2048) throw new Error('Audit event too large');
    return serialized;
  };
  return {
    async allow(scope, id, limit, windowMs) {
      if (!['access', 'frames', 'social', 'groups', 'profile'].includes(scope)) return false;
      return limited(scope, id, limit, windowMs);
    },
    async issueTicket(user, worldId = DEFAULT_WORLD_ID) {
      try { validateWorldId(worldId); } catch { return null; }
      if (!identity(user) || !await limited('tickets', user.userId, 10, 60000)) return null;
      const ticket = randomBytes(32).toString('base64url');
      const issued = await execute(ISSUE, ['tickets:values', 'tickets:expiry', 'bans'], [now(), ticket, JSON.stringify({ userId: user.userId, sessionId: user.sessionId, worldId }), user.userId]);
      return issued === 1 ? ticket : null;
    },
    async consumeTicket(ticket, user, worldId = DEFAULT_WORLD_ID) {
      try { validateWorldId(worldId); } catch { return false; }
      if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ticket) || !identity(user)) return false;
      return await execute(CONSUME, ['tickets:values', 'tickets:expiry', 'bans'], [ticket, now(), user.userId, user.sessionId, worldId]) === 1;
    },
    async isBanned(userId) {
      if (!text(userId)) return false;
      return await redis.hexists(key('bans'), userId) === 1;
    },
    async ban({ userId, reason, actorId } = {}) {
      if (!text(userId) || !text(actorId) || !text(reason, 320)) return false;
      return await execute(BAN, ['bans', 'audit', 'tickets:values', 'tickets:expiry'], [userId, event('ban', { userId, reason, actorId })]) === 1;
    },
    async unban({ userId, actorId } = {}) {
      if (!text(userId) || !text(actorId)) return false;
      return await execute(UNBAN, ['bans', 'audit'], [userId, event('unban', { userId, actorId })]) === 1;
    },
    async report({ reporterId, targetId, reason } = {}) {
      if (!text(reporterId) || !text(targetId) || reporterId === targetId || !['disruption', 'harassment', 'cheating'].includes(reason)) return false;
      if (!await limited('reports', reporterId, 3, 60000)) return false;
      await execute(AUDIT, ['audit'], [event('report', { reporterId, targetId, reason })]);
      return true;
    },
    async audit(kind, record) { await execute(AUDIT, ['audit'], [event(kind, record)]); },
    close() { /* No owned connection or ephemeral process resources. */ },
  };
}
