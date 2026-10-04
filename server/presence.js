import { createHash } from 'node:crypto';
import { validateWorldId } from '../preview/src/world-contract.js';

const TTL_SECONDS = 90;
const MAX_PRESENT = 10000;
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);
const validToken = value => typeof value === 'string' && value.length > 0 && value.length <= 160;
function place(world) {
  const worldId = validateWorldId(world?.id);
  const title = world?.title;
  if (typeof title !== 'string' || !title || title !== title.trim() || [...title].length > 64
    || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(title)) throw new Error('Invalid presence world');
  return { worldId, title };
}
function idsForRead(ids) {
  if (!Array.isArray(ids) || ids.length > 50 || ids.some(id => !validId(id))) throw new Error('Invalid presence lookup');
  return [...new Set(ids)];
}
function entry(raw) {
  if (!raw) return null;
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!validToken(value?.token)) throw new Error('Invalid presence record');
  const { worldId, title } = place({ id: value.worldId, title: value.title });
  return { token: value.token, worldId, title };
}

export function createMemoryPresence({ now = Date.now } = {}) {
  const records = new Map();
  const current = userId => {
    const record = records.get(userId);
    if (record && record.until <= now()) { records.delete(userId); return null; }
    return record ?? null;
  };
  return {
    async join(userId, world, token) {
      if (!validId(userId) || !validToken(token)) throw new Error('Invalid presence');
      const location = place(world);
      if (!records.has(userId) && records.size >= MAX_PRESENT) {
        for (const id of records.keys()) current(id);
        if (records.size >= MAX_PRESENT) throw new Error('Presence capacity exceeded');
      }
      records.set(userId, { ...location, token, until: now() + TTL_SECONDS * 1000 });
    },
    async touch(userId, token) {
      if (!validId(userId) || !validToken(token)) throw new Error('Invalid presence');
      const record = current(userId);
      if (record?.token !== token) return false;
      record.until = now() + TTL_SECONDS * 1000;
      return true;
    },
    async leave(userId, token) {
      if (!validId(userId) || !validToken(token)) throw new Error('Invalid presence');
      if (current(userId)?.token !== token) return false;
      records.delete(userId);
      return true;
    },
    async getMany(ids) {
      const result = new Map();
      for (const id of idsForRead(ids)) {
        const record = current(id);
        if (record) result.set(id, { worldId: record.worldId, title: record.title });
      }
      return result;
    },
  };
}

const TOUCH = `
local old = redis.call('GET', KEYS[1])
if not old or cjson.decode(old).token ~= ARGV[1] then return 0 end
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
return 1
`;
const LEAVE = `
local old = redis.call('GET', KEYS[1])
if not old or cjson.decode(old).token ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
return 1
`;

export function createRedisPresence({ redis, prefix } = {}) {
  if (!redis?.eval || !redis?.mget || typeof prefix !== 'string' || !/^\{[^{}]+\}$/.test(prefix)) throw new Error('Invalid presence storage');
  const key = userId => {
    if (!validId(userId)) throw new Error('Invalid account');
    return `${prefix}:presence:v1:${createHash('sha256').update(userId).digest('hex')}`;
  };
  return {
    async join(userId, world, token) {
      if (!validToken(token)) throw new Error('Invalid presence');
      const location = place(world);
      await redis.set(key(userId), JSON.stringify({ ...location, token }), 'EX', TTL_SECONDS);
    },
    async touch(userId, token) {
      if (!validToken(token)) throw new Error('Invalid presence');
      return Boolean(await redis.eval(TOUCH, 1, key(userId), token, TTL_SECONDS));
    },
    async leave(userId, token) {
      if (!validToken(token)) throw new Error('Invalid presence');
      return Boolean(await redis.eval(LEAVE, 1, key(userId), token));
    },
    async getMany(ids) {
      const unique = idsForRead(ids);
      if (!unique.length) return new Map();
      const values = await redis.mget(...unique.map(key));
      const result = new Map();
      values.forEach((raw, index) => {
        const record = entry(raw);
        if (record) result.set(unique[index], { worldId: record.worldId, title: record.title });
      });
      return result;
    },
  };
}
