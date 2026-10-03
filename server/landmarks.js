import { createHash, randomUUID } from 'node:crypto';
import { LANDMARK_LIMIT, cleanName } from '../preview/src/places.js';

const copy = value => structuredClone(value);
const validUser = userId => typeof userId === 'string' && userId.length > 0 && userId.length <= 160;
const validPosition = position => Array.isArray(position) && position.length === 2 && position.every(Number.isFinite);
const prepare = ({ name, position, yaw = 0 } = {}) => {
  if (typeof name !== 'string' || !cleanName(name)) return { ok: false, reason: 'name' };
  if (!validPosition(position) || !Number.isFinite(yaw)) return { ok: false, reason: 'position' };
  return { ok: true, name: cleanName(name), position: [...position], yaw };
};
const makeLandmark = (value, now, createId) => ({
  id: createId(), name: value.name, position: value.position, yaw: value.yaw, createdAt: now(),
});

export function createMemoryLandmarks({ now = Date.now, createId = () => `lm-${randomUUID()}` } = {}) {
  const byUser = new Map();
  return {
    async list(userId) {
      if (!validUser(userId)) throw new Error('Invalid account');
      return copy(byUser.get(userId) ?? []);
    },
    async add(userId, input) {
      if (!validUser(userId)) throw new Error('Invalid account');
      const value = prepare(input);
      if (!value.ok) return value;
      const items = byUser.get(userId) ?? [];
      if (items.length >= LANDMARK_LIMIT) return { ok: false, reason: 'limit' };
      const landmark = makeLandmark(value, now, createId);
      items.push(landmark); byUser.set(userId, items);
      return { ok: true, landmark: copy(landmark) };
    },
    async remove(userId, id) {
      if (!validUser(userId)) throw new Error('Invalid account');
      const items = byUser.get(userId) ?? [], index = items.findIndex(item => item.id === id);
      if (index < 0) return false;
      items.splice(index, 1);
      return true;
    },
  };
}

const ADD = `
  if redis.call('LLEN', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end
  redis.call('RPUSH', KEYS[1], ARGV[1])
  return 1
`;
const REMOVE = `
  local items = redis.call('LRANGE', KEYS[1], 0, -1)
  for i = 1, #items do
    if cjson.decode(items[i]).id == ARGV[1] then
      redis.call('LREM', KEYS[1], 1, items[i])
      return 1
    end
  end
  return 0
`;

export function createRedisLandmarks({ redis, prefix, now = Date.now, createId = () => `lm-${randomUUID()}` } = {}) {
  if (!redis?.eval || typeof prefix !== 'string' || !/^\{[^{}]+\}$/.test(prefix)) throw new Error('Invalid landmark storage');
  const keyOf = userId => {
    if (!validUser(userId)) throw new Error('Invalid account');
    return `${prefix}:landmarks:${createHash('sha256').update(userId).digest('hex')}`;
  };
  return {
    async list(userId) {
      const items = (await redis.lrange(keyOf(userId), 0, -1)).map(raw => JSON.parse(raw));
      if (items.length > LANDMARK_LIMIT || items.some(item =>
        !item || typeof item.id !== 'string' || typeof item.name !== 'string' || !cleanName(item.name)
        || !validPosition(item.position) || !Number.isFinite(item.yaw) || !Number.isFinite(item.createdAt))) throw new Error('Invalid landmark record');
      return items;
    },
    async add(userId, input) {
      const key = keyOf(userId), value = prepare(input);
      if (!value.ok) return value;
      const landmark = makeLandmark(value, now, createId);
      const added = await redis.eval(ADD, 1, key, JSON.stringify(landmark), LANDMARK_LIMIT);
      return added === 1 ? { ok: true, landmark } : { ok: false, reason: 'limit' };
    },
    async remove(userId, id) {
      if (typeof id !== 'string' || id.length > 80) return false;
      return await redis.eval(REMOVE, 1, keyOf(userId), id) === 1;
    },
  };
}
