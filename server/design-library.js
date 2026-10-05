import { createHash, randomUUID } from 'node:crypto';
import { buildFinish, buildGeometry, MAX_SAVED_DESIGNS } from '../preview/src/shared-build.js';
import { validateWorldId } from '../preview/src/world-contract.js';

const MAX_ACCOUNTS = 10000;
const designId = value => typeof value === 'string' && /^design-global-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const accountId = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => structuredClone(value);
const empty = () => ({ version: 0, items: [] });
const messages = { invalid_inventory: 'Choose a valid design.', inventory_limit: 'Your account design library is full.',
  unknown_design: 'That design is no longer in your account library.', library_busy: 'The design library is busy. Try again.' };
const rejected = error => ({ ok: false, error, message: messages[error] ?? error });

function validSource(source) {
  if (!record(source) || Object.keys(source).sort().join(',') !== 'designId,worldId'
    || typeof source.designId !== 'string' || !/^design-[1-9]\d*$/.test(source.designId)) return false;
  try { validateWorldId(source.worldId); return true; } catch { return false; }
}
function validItem(item) {
  return record(item) && Object.keys(item).every(key => ['id', 'kind', 'finish', 'assembly', 'createdAt', 'source'].includes(key))
    && designId(item.id) && buildGeometry(item) && buildFinish(item.finish)
    && Number.isSafeInteger(item.createdAt) && item.createdAt >= 0
    && (item.source === undefined || validSource(item.source));
}
function decode(raw) {
  if (raw === null) return empty();
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!record(value) || Object.keys(value).sort().join(',') !== 'items,version'
    || !Number.isSafeInteger(value.version) || value.version < 1 || value.version > 1000000
    || !Array.isArray(value.items) || value.items.length > MAX_SAVED_DESIGNS
    || !value.items.every(validItem) || new Set(value.items.map(item => item.id)).size !== value.items.length
    || new Set(value.items.filter(item => item.source).map(item => `${item.source.worldId}:${item.source.designId}`)).size
      !== value.items.filter(item => item.source).length) throw new Error('Invalid design library record');
  return value;
}
function proposal(value) {
  if (!record(value) || Object.keys(value).some(key => !['kind', 'finish', 'assembly', 'source'].includes(key))
    || !buildGeometry(value) || !buildFinish(value.finish)
    || value.source !== undefined && !validSource(value.source)) return null;
  return { kind: value.kind, finish: value.finish, ...(value.assembly ? {assembly:clone(value.assembly)} : {}), ...(value.source ? { source: clone(value.source) } : {}) };
}
function sourceMatch(items, source) {
  return source && items.find(item => item.source?.worldId === source.worldId && item.source.designId === source.designId);
}
function newItem(fields, now) {
  const createdAt = now();
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) throw new Error('Invalid design clock');
  return { id: `design-global-${randomUUID()}`, ...fields, createdAt };
}

export function createMemoryDesignLibrary({ now = Date.now } = {}) {
  const records = new Map();
  return {
    async list(userId) {
      if (!accountId(userId)) throw new Error('Invalid account');
      return clone(records.get(userId)?.items ?? []);
    },
    async get(userId, id) { return (await this.list(userId)).find(item => item.id === id) ?? null; },
    async save(userId, value) {
      const fields = proposal(value);
      if (!accountId(userId) || !fields) return rejected('invalid_inventory');
      const current = records.get(userId) ?? empty(), existing = sourceMatch(current.items, fields.source);
      if (existing) return { ok: true, item: clone(existing), items: clone(current.items) };
      if (current.items.length >= MAX_SAVED_DESIGNS || !records.has(userId) && records.size >= MAX_ACCOUNTS) return rejected('inventory_limit');
      const item = newItem(fields, now), items = [...current.items, item];
      records.set(userId, { version: current.version + 1, items });
      return { ok: true, item: clone(item), items: clone(items) };
    },
    async remove(userId, id) {
      if (!accountId(userId) || !designId(id)) return rejected('invalid_inventory');
      const current = records.get(userId) ?? empty(), items = current.items.filter(item => item.id !== id);
      if (items.length === current.items.length) return rejected('unknown_design');
      records.set(userId, { version: current.version + 1, items });
      return { ok: true, items: clone(items) };
    },
  };
}

const COMPARE_SET = `
  local old=redis.call('HGET',KEYS[1],ARGV[1])
  local version=old and cjson.decode(old).version or 0
  if version ~= tonumber(ARGV[2]) then return 'conflict' end
  if not old and redis.call('HLEN',KEYS[1]) >= tonumber(ARGV[4]) then return 'capacity' end
  redis.call('HSET',KEYS[1],ARGV[1],ARGV[3])
  return 'ok'
`;
export function createRedisDesignLibrary({ redis, prefix, now = Date.now } = {}) {
  if (!redis?.eval || typeof prefix !== 'string' || !/^\{[^{}]+\}$/.test(prefix)) throw new Error('Invalid design library storage');
  const key = `${prefix}:design-library:v1`;
  const field = userId => createHash('sha256').update(userId).digest('hex');
  const read = async userId => {
    if (!accountId(userId)) throw new Error('Invalid account');
    return decode(await redis.hget(key, field(userId)));
  };
  const write = async (userId, current, items) => redis.eval(COMPARE_SET, 1, key, field(userId), current.version,
    JSON.stringify({ version: current.version + 1, items }), MAX_ACCOUNTS);
  return {
    async list(userId) { return clone((await read(userId)).items); },
    async get(userId, id) { return (await this.list(userId)).find(item => item.id === id) ?? null; },
    async save(userId, value) {
      const fields = proposal(value);
      if (!accountId(userId) || !fields) return rejected('invalid_inventory');
      const item = newItem(fields, now);
      for (let attempt = 0; attempt < 64; attempt++) {
        const current = await read(userId), existing = sourceMatch(current.items, fields.source);
        if (existing) return { ok: true, item: clone(existing), items: clone(current.items) };
        if (current.items.length >= MAX_SAVED_DESIGNS) return rejected('inventory_limit');
        const items = [...current.items, item], result = await write(userId, current, items);
        if (result === 'ok') return { ok: true, item: clone(item), items: clone(items) };
        if (result === 'capacity') return rejected('inventory_limit');
        if (result !== 'conflict') throw new Error('Invalid design library response');
      }
      return rejected('library_busy');
    },
    async remove(userId, id) {
      if (!accountId(userId) || !designId(id)) return rejected('invalid_inventory');
      for (let attempt = 0; attempt < 64; attempt++) {
        const current = await read(userId), items = current.items.filter(item => item.id !== id);
        if (items.length === current.items.length) return rejected('unknown_design');
        const result = await write(userId, current, items);
        if (result === 'ok') return { ok: true, items: clone(items) };
        if (result !== 'conflict') throw new Error('Invalid design library response');
      }
      return rejected('library_busy');
    },
  };
}
