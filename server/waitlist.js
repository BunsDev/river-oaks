import { mkdir, readFile, rename, writeFile, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
const recordFor = (identity, admins, now, autoApprove = false) => ({
  userId: identity.userId,
  name: String(identity.name ?? 'Resident').slice(0, 80),
  email: typeof identity.email === 'string' ? identity.email.slice(0, 254) : '',
  status: admins.has(identity.userId) || autoApprove ? 'approved' : 'pending',
  requestedAt: new Date(now()).toISOString(),
});
const compare = (a, b) => a.requestedAt.localeCompare(b.requestedAt);

/** Approval is independent of the town checkpoint and survives process restarts. */
export async function createFileWaitlist(path, { admins = [], now = Date.now, autoApprove = false } = {}) {
  const adminIds = new Set(admins);
  let records = new Map(), audit = [], queue = Promise.resolve();
  try {
    const data = JSON.parse(await readFile(path, 'utf8'));
    const rows = Array.isArray(data) ? data : data.records;
    if (!Array.isArray(rows) || rows.some(record => !validId(record.userId)
      || !['pending', 'approved', 'rejected'].includes(record.status))) throw new Error('Invalid waitlist store');
    records = new Map(rows.map(record => [record.userId, record]));
    if (Array.isArray(data)) {
      // Migrate the old separate journal into the atomic store on the next write.
      try { audit = (await readFile(`${path}.audit.jsonl`, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    } else {
      if (!Array.isArray(data.audit)) throw new Error('Invalid waitlist audit');
      audit = data.audit;
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const serialize = task => { const next = queue.then(task); queue = next.catch(() => {}); return next; };
  const persist = async (next, nextAudit = audit) => {
    await writeFile(`${path}.tmp`, JSON.stringify({ records: [...next.values()], audit: nextAudit }) + '\n', { mode: 0o600 });
    await rename(`${path}.tmp`, path);
    records = next; audit = nextAudit;
  };
  return {
    request(identity) {
      if (!validId(identity?.userId)) throw new Error('Invalid waitlist identity');
      return serialize(async () => {
        let existing = records.get(identity.userId);
        // A request keeps the name its owner currently signs in with, so the
        // approval list shows GitHub usernames rather than an older name.
        const name = recordFor(identity, adminIds, now).name;
        if (existing && existing.name !== name) {
          existing = { ...existing, name };
          const next = new Map(records); next.set(existing.userId, existing); await persist(next);
        }
        if (existing) return adminIds.has(identity.userId) || autoApprove ? { ...existing, status: 'approved' } : existing;
        if (records.size >= 10000) throw new Error('Waitlist capacity reached');
        const record = recordFor(identity, adminIds, now, autoApprove), next = new Map(records);
        next.set(record.userId, record); await persist(next);
        return record;
      });
    },
    async isApproved(userId) { return autoApprove || adminIds.has(userId) || records.get(userId)?.status === 'approved'; },
    async list() { return [...records.values()].map(record => adminIds.has(record.userId) ? { ...record, status: 'approved' } : record).sort(compare); },
    decide({ userId, approved, actorId }) {
      if (!validId(userId) || !validId(actorId) || typeof approved !== 'boolean' || adminIds.has(userId)) throw new Error('Invalid waitlist decision');
      return serialize(async () => {
        const previous = records.get(userId);
        if (!previous) return null;
        const record = { ...previous, status: approved ? 'approved' : 'rejected', decidedAt: new Date(now()).toISOString(), decidedBy: actorId };
        const next = new Map(records); next.set(userId, record);
        const entry = { userId, approved, actorId, at: record.decidedAt };
        await persist(next, [...audit, entry]);
        // Preserve the legacy JSONL mirror, but the atomic store is authoritative.
        await appendFile(`${path}.audit.jsonl`, JSON.stringify(entry) + '\n', { mode: 0o600 }).catch(() => {});
        return record;
      });
    },
  };
}

const REQUEST = `
local existing = redis.call('HGET', KEYS[1], ARGV[1])
if existing then
  local record = cjson.decode(existing)
  local name = cjson.decode(ARGV[2]).name
  if record.name == name then return existing end
  record.name = name
  local updated = cjson.encode(record)
  redis.call('HSET', KEYS[1], ARGV[1], updated)
  return updated
end
if redis.call('HLEN', KEYS[1]) >= 10000 then return false end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return ARGV[2]`;
const DECIDE = `
local existing = redis.call('HGET', KEYS[1], ARGV[1])
if not existing then return false end
local record = cjson.decode(existing)
record.status = ARGV[2]
record.decidedAt = ARGV[3]
record.decidedBy = ARGV[4]
local result = cjson.encode(record)
redis.call('HSET', KEYS[1], ARGV[1], result)
redis.call('LPUSH', KEYS[2], cjson.encode({userId=ARGV[1], status=ARGV[2], at=ARGV[3], actorId=ARGV[4]}))
redis.call('LTRIM', KEYS[2], 0, 9999)
return result`;

export function createRedisWaitlist({ redis, prefix, admins = [], now = Date.now } = {}) {
  if (!redis?.eval || typeof prefix !== 'string' || !/^[A-Za-z0-9:{}_-]{1,160}$/.test(prefix)) throw new Error('Invalid waitlist configuration');
  const adminIds = new Set(admins), users = `${prefix}:waitlist:users`, audit = `${prefix}:waitlist:audit`;
  return {
    async request(identity) {
      if (!validId(identity?.userId)) throw new Error('Invalid waitlist identity');
      const record = recordFor(identity, adminIds, now);
      const raw = await redis.eval(REQUEST, 1, users, record.userId, JSON.stringify(record));
      if (!raw) throw new Error('Waitlist capacity reached');
      const existing = JSON.parse(raw);
      return adminIds.has(identity.userId) ? { ...existing, status: 'approved' } : existing;
    },
    async isApproved(userId) {
      if (!validId(userId)) return false;
      if (adminIds.has(userId)) return true;
      const raw = await redis.hget(users, userId);
      return raw ? JSON.parse(raw).status === 'approved' : false;
    },
    async list() {
      const rows = await redis.hvals(users);
      return rows.map(raw => JSON.parse(raw)).map(record => adminIds.has(record.userId) ? { ...record, status: 'approved' } : record).sort(compare);
    },
    async decide({ userId, approved, actorId }) {
      if (!validId(userId) || !validId(actorId) || typeof approved !== 'boolean' || adminIds.has(userId)) throw new Error('Invalid waitlist decision');
      const raw = await redis.eval(DECIDE, 2, users, audit, userId, approved ? 'approved' : 'rejected', new Date(now()).toISOString(), actorId);
      return raw ? JSON.parse(raw) : null;
    },
  };
}
