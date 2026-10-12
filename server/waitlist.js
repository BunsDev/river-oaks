import { mkdir, readFile, rename, writeFile, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { newInvite, visibleInvite, inviteDigest, validInviteCode, validInviteId, INVITE_TRANSACTION, INVITE_CAPACITY, INVITE_RETENTION } from './invitations.js';

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
// Requests waiting for a decision. A full list gives up its oldest pending
// request instead of refusing every new one, so a flood of sign-ups cannot lock
// out real people; approved and refused residents are never removed. Someone
// whose request gave way simply asks again the next time they sign in.
export const MAX_WAITLIST_REQUESTS = 10_000;
export async function createFileWaitlist(path, { admins = [], now = Date.now, autoApprove = false, maxRequests = MAX_WAITLIST_REQUESTS } = {}) {
  const adminIds = new Set(admins);
  let records = new Map(), invites = new Map(), audit = [], queue = Promise.resolve();
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
      if (data.invites !== undefined && !Array.isArray(data.invites)) throw new Error('Invalid invitation store');
      invites = new Map((data.invites ?? []).map(invite => [invite.id, invite]));
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const serialize = task => { const next = queue.then(task); queue = next.catch(() => {}); return next; };
  const persist = async (next, nextAudit = audit, nextInvites = invites) => {
    await writeFile(`${path}.tmp`, JSON.stringify({ records: [...next.values()], audit: nextAudit, invites: [...nextInvites.values()] }) + '\n', { mode: 0o600 });
    await rename(`${path}.tmp`, path);
    records = next; audit = nextAudit; invites = nextInvites;
  };
  const grant = (record, nextInvites, actorId) => {
    if (record.invitesGrantedAt) return;
    if (nextInvites.size + 2 > 50000) throw new Error('Invitation capacity reached');
    for (let i = 0; i < 2; i++) { const invite = newInvite(record.userId, actorId, now()); nextInvites.set(invite.id, invite); }
    record.invitesGrantedAt = new Date(now()).toISOString();
  };
  const approvedOwner = id => adminIds.has(id) || records.get(id)?.status === 'approved';
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
        const record = recordFor(identity, adminIds, now, autoApprove), next = new Map(records);
        while (next.size >= maxRequests) {
          const oldest = [...next.values()].filter(entry => entry.status === 'pending').reduce((a, b) => !a || b.requestedAt < a.requestedAt ? b : a, null);
          if (!oldest) throw new Error('Waitlist capacity reached');
          next.delete(oldest.userId);
        }
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
        const nextInvites = new Map(invites);
        if (approved) grant(record, nextInvites, actorId);
        else for (const [id, invite] of nextInvites) if (invite.ownerId === userId && invite.status === 'active') {
          nextInvites.set(id, { ...invite, status: 'revoked', revokedAt: record.decidedAt });
        }
        const next = new Map(records); next.set(userId, record);
        const entry = { userId, approved, actorId, at: record.decidedAt };
        await persist(next, [...audit, entry], nextInvites);
        // Preserve the legacy JSONL mirror, but the atomic store is authoritative.
        await appendFile(`${path}.audit.jsonl`, JSON.stringify(entry) + '\n', { mode: 0o600 }).catch(() => {});
        return record;
      });
    },
    async listInvites({ userId }) {
      if (!validId(userId)) throw new Error('Invalid identity');
      return [...invites.values()].filter(i => adminIds.has(userId) || (approvedOwner(userId) && i.ownerId === userId)).map(i => visibleInvite(i, now()));
    },
    async inviteOwner(code) { return validInviteCode(code) ? invites.get(inviteDigest(code))?.ownerId ?? null : null; },
    async revokeInvites({ userId, actorId }) {
      if (!validId(userId) || !validId(actorId)) throw new Error('Invalid identity');
      return serialize(async () => {
        const next = new Map(invites), at = new Date(now()).toISOString();
        for (const [id, invite] of next) if (invite.ownerId === userId && invite.status === 'active') next.set(id, { ...invite, status: 'revoked', revokedAt: at });
        await persist(records, [...audit, { action: 'invites-revoked', userId, actorId, at }], next);
        return true;
      });
    },
    async issueInvite({ actorId, ownerId, assignedUserId = null }) {
      if (!adminIds.has(actorId) || !validId(ownerId) || (assignedUserId !== null && !validId(assignedUserId))) throw new Error('Invalid invitation authority');
      return serialize(async () => {
        if (!approvedOwner(ownerId) || (assignedUserId !== null && !records.has(assignedUserId))) return null;
        if (invites.size >= 50000) throw new Error('Invitation capacity reached');
        const invite = newInvite(ownerId, actorId, now(), assignedUserId), next = new Map(invites); next.set(invite.id, invite);
        await persist(records, [...audit, { action: 'invite-issued', inviteId: invite.id, actorId, at: invite.createdAt }], next);
        return invite;
      });
    },
    async updateInvite({ actorId, id, assignedUserId = null, expire = false }) {
      if (!adminIds.has(actorId) || !validInviteId(id) || typeof expire !== 'boolean'
        || (assignedUserId !== null && !validId(assignedUserId))) throw new Error('Invalid invitation authority');
      return serialize(async () => {
        const old = invites.get(id);
        if (!old || old.status !== 'active' || old.expires <= now() || (!expire && assignedUserId !== null && !records.has(assignedUserId))) return null;
        const at = new Date(now()).toISOString();
        const invite = expire ? { ...old, status: 'revoked', revokedAt: at } : { ...old, assignedUserId };
        const next = new Map(invites); next.set(id, invite);
        await persist(records, [...audit, { action: expire ? 'invite-expired' : 'invite-assigned', inviteId: id, actorId, assignedUserId: invite.assignedUserId, at }], next);
        return invite;
      });
    },
    async redeemInvite({ identity, code }) {
      if (!validId(identity?.userId) || !validInviteCode(code)) return { ok: false };
      return serialize(async () => {
        const previous = records.get(identity.userId), invite = invites.get(inviteDigest(code));
        if (!previous || previous.status !== 'pending' || !invite || invite.status !== 'active' || invite.expires <= now()
          || invite.ownerId === identity.userId || !approvedOwner(invite.ownerId)
          || (invite.assignedUserId !== null && invite.assignedUserId !== identity.userId)) return { ok: false };
        const at = new Date(now()).toISOString();
        const record = { ...previous, status: 'approved', decidedAt: at, decidedBy: invite.ownerId, inviteId: invite.id };
        const next = new Map(records), nextInvites = new Map(invites);
        grant(record, nextInvites, identity.userId); next.set(record.userId, record);
        nextInvites.set(invite.id, { ...invite, status: 'redeemed', redeemedBy: record.userId, redeemedAt: at });
        await persist(next, [...audit, { action: 'invite-redeemed', inviteId: invite.id, userId: record.userId, actorId: record.userId, at }], nextInvites);
        return { ok: true };
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
local limit = tonumber(ARGV[4])
if redis.call('HLEN', KEYS[1]) >= limit and redis.call('EXISTS', KEYS[3]) == 0 then
  -- Once, the first time the list fills: index requests made before the
  -- pending index existed. They are the oldest, so they score 0 and go first;
  -- NX keeps the real request time of anything already indexed.
  local all = redis.call('HGETALL', KEYS[1])
  for i = 1, #all, 2 do
    if cjson.decode(all[i + 1]).status == 'pending' then redis.call('ZADD', KEYS[2], 'NX', 0, all[i]) end
  end
  redis.call('SET', KEYS[3], '1')
end
while redis.call('HLEN', KEYS[1]) >= limit do
  local oldest = redis.call('ZRANGE', KEYS[2], 0, 0)[1]
  if not oldest then return false end
  redis.call('ZREM', KEYS[2], oldest)
  -- Index entries for requests decided since are skipped, never evicted.
  local raw = redis.call('HGET', KEYS[1], oldest)
  if raw and cjson.decode(raw).status == 'pending' then redis.call('HDEL', KEYS[1], oldest) end
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
if cjson.decode(ARGV[2]).status == 'pending' then redis.call('ZADD', KEYS[2], tonumber(ARGV[3]), ARGV[1]) end
return ARGV[2]`;
export function createRedisWaitlist({ redis, prefix, admins = [], now = Date.now, maxRequests = MAX_WAITLIST_REQUESTS, inviteCapacity = INVITE_CAPACITY } = {}) {
  if (!redis?.eval || typeof prefix !== 'string' || !/^[A-Za-z0-9:{}_-]{1,160}$/.test(prefix)) throw new Error('Invalid waitlist configuration');
  const adminIds = new Set(admins), users = `${prefix}:waitlist:users`, audit = `${prefix}:waitlist:audit`;
  const invites = `${prefix}:waitlist:invites`, pending = `${prefix}:waitlist:pending`;
  const transaction = async payload => {
    const time = now();
    // The owner whose invite index this call may read or extend.
    const indexOwner = payload.op === 'issue' ? payload.invite.ownerId : payload.userId ?? null;
    const ownerIndex = `${prefix}:waitlist:invites:owner:${createHash('sha256').update(indexOwner ?? '').digest('base64url')}`;
    const raw = await redis.eval(INVITE_TRANSACTION, 5, users, audit, invites, ownerIndex, `${prefix}:waitlist:invites:pruned`, JSON.stringify({
      ...payload, indexOwner, capacity: inviteCapacity, retention: INVITE_RETENTION,
      now: time, at: new Date(time).toISOString(), admins: Object.fromEntries(admins.map(id => [id, true])),
      starter: payload.userId && payload.op !== 'list-owner' ? [newInvite(payload.userId, payload.actorId ?? payload.userId, time), newInvite(payload.userId, payload.actorId ?? payload.userId, time)] : [],
    }));
    return raw ? JSON.parse(raw) : null;
  };
  return {
    async request(identity) {
      if (!validId(identity?.userId)) throw new Error('Invalid waitlist identity');
      const record = recordFor(identity, adminIds, now);
      const raw = await redis.eval(REQUEST, 3, users, pending, `${prefix}:waitlist:pending-indexed`, record.userId, JSON.stringify(record), now(), maxRequests);
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
      return transaction({ op: 'decide', userId, approved, actorId });
    },
    async listInvites({ userId }) {
      if (!validId(userId)) throw new Error('Invalid identity');
      if (!adminIds.has(userId)) {
        const raw = await redis.hget(users, userId);
        if (!raw || JSON.parse(raw).status !== 'approved') return [];
      }
      // Administrators see every invite; an owner reads only their own index.
      const list = adminIds.has(userId) ? (await redis.hvals(invites)).map(raw => JSON.parse(raw)) : await transaction({ op: 'list-owner', userId });
      return list.map(i => visibleInvite(i, now()));
    },
    async issueInvite({ actorId, ownerId, assignedUserId = null }) {
      if (!adminIds.has(actorId) || !validId(ownerId) || (assignedUserId !== null && !validId(assignedUserId))) throw new Error('Invalid invitation authority');
      return transaction({ op: 'issue', actorId, invite: newInvite(ownerId, actorId, now(), assignedUserId) });
    },
    async inviteOwner(code) {
      if (!validInviteCode(code)) return null;
      const raw = await redis.hget(invites, inviteDigest(code));
      return raw ? JSON.parse(raw).ownerId : null;
    },
    async revokeInvites({ userId, actorId }) {
      if (!validId(userId) || !validId(actorId)) throw new Error('Invalid identity');
      return transaction({ op: 'revoke-owner', userId, actorId });
    },
    async updateInvite({ actorId, id, assignedUserId = null, expire = false }) {
      if (!adminIds.has(actorId) || !validInviteId(id) || typeof expire !== 'boolean'
        || (assignedUserId !== null && !validId(assignedUserId))) throw new Error('Invalid invitation authority');
      return transaction({ op: 'update', actorId, id, assignedUserId, expire });
    },
    async redeemInvite({ identity, code }) {
      if (!validId(identity?.userId) || !validInviteCode(code)) return { ok: false };
      return await transaction({ op: 'redeem', userId: identity.userId, id: inviteDigest(code) }) ?? { ok: false };
    },
  };
}
