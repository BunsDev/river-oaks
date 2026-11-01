import { mkdir, readFile, rename, writeFile, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { newInvite, visibleInvite, inviteDigest, validInviteCode, validInviteId, INVITE_TRANSACTION, INVITE_CAPACITY, INVITE_RETENTION } from './invitations.js';
import { usernameChoiceProblem, usernameKey, usernameProblem, validNewUsername, validUsername } from '../preview/src/resident-names.js';
import { generatedUsername } from '../preview/src/generated-username.js';
import { defaultContentFilter, screenText } from './content-filter.js';

// The username offered first: the verified GitHub login when it can be chosen now
// (including the 4-letter minimum), otherwise a generated name. `attempt` moves past
// names already taken.
export const suggestedUsername = ({ login = null, userId, attempt = 0 }) =>
  attempt === 0 && validNewUsername(login) ? login : generatedUsername(`${userId}:${attempt}`);

const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
const recordFor = (identity, admins, now, autoApprove = false) => ({
  userId: identity.userId,
  name: String(identity.name ?? 'Resident').slice(0, 80),
  email: typeof identity.email === 'string' ? identity.email.slice(0, 254) : '',
  status: admins.has(identity.userId) || autoApprove ? 'approved' : 'pending',
  requestedAt: new Date(now()).toISOString(),
});
const compare = (a, b) => a.requestedAt.localeCompare(b.requestedAt);
// Account erasure leaves this in place of a deleted account named by someone
// else's record (an approver, an inviter, an admin's audit entry).
export const ERASED_ACCOUNT = 'erased-account';
const erasedInvite = (invite, userId, at) => {
  let next = invite;
  if (invite.assignedUserId === userId) next = { ...next, assignedUserId: null, ...(next.status === 'active' ? { status: 'revoked', revokedAt: at } : {}) };
  if (invite.redeemedBy === userId) next = { ...next, redeemedBy: null };
  if (invite.createdBy === userId) next = { ...next, createdBy: ERASED_ACCOUNT };
  return next;
};
const erasedAudit = (entries, userId) => entries.filter(entry => entry?.userId !== userId).map(entry =>
  entry.actorId === userId || entry.assignedUserId === userId
    ? { ...entry, ...(entry.actorId === userId ? { actorId: ERASED_ACCOUNT } : {}), ...(entry.assignedUserId === userId ? { assignedUserId: null } : {}) } : entry);

// Usernames (resident-names.js). A waiting resident has one from their first request:
// their GitHub login unless someone already holds a name that reads the same, else a
// generated name. They may change it while they wait, and an approver may change it
// until the request is approved; an approved username names the resident in town.
// A GitHub login is also held for its owner (`nameKey`), so nobody can choose it.
const loginOf = identity => validUsername(identity?.name) ? identity.name : null;
function defaultCandidates(identity) {
  const seen = new Set(), out = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    const username = suggestedUsername({ login: loginOf(identity), userId: identity.userId, attempt }), key = usernameKey(username);
    if (validNewUsername(username) && !seen.has(key)) { seen.add(key); out.push({ username, key }); }
  }
  return out;
}
// A username is screened by the content filter too (#292); a name that reads as a filtered term is refused like a reserved one.
const usernameRequest = ({ userId, username, actorId }, adminIds, contentFilter) => {
  if (!validId(userId) || !validId(actorId) || (actorId !== userId && !adminIds.has(actorId))) throw new Error('Invalid username authority');
  const problem = usernameProblem(username);
  if (problem) return problem;
  const screened = screenText(contentFilter, 'username', username);
  return screened.ok ? null : screened.message;
};

/** Approval is independent of the town checkpoint and survives process restarts. */
// Requests waiting for a decision. A full list gives up its oldest pending
// request instead of refusing every new one, so a flood of sign-ups cannot lock
// out real people; approved and refused residents are never removed. Someone
// whose request gave way simply asks again the next time they sign in.
export const MAX_WAITLIST_REQUESTS = 10_000;
export async function createFileWaitlist(path, { admins = [], now = Date.now, autoApprove = false, maxRequests = MAX_WAITLIST_REQUESTS, contentFilter = defaultContentFilter() } = {}) {
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
  // Starter invitations go to accounts approved from the waitlist. An account that joined with an
  // invitation code (record.inviteId) gets none, then or on a later re-approval: the referral decay.
  const grant = (record, nextInvites, actorId) => {
    if (record.invitesGrantedAt || record.inviteId) return;
    if (nextInvites.size + 2 > 50000) throw new Error('Invitation capacity reached');
    for (let i = 0; i < 2; i++) { const invite = newInvite(record.userId, actorId, now()); nextInvites.set(invite.id, invite); }
    record.invitesGrantedAt = new Date(now()).toISOString();
  };
  const approvedOwner = id => adminIds.has(id) || records.get(id)?.status === 'approved';
  // Who else holds a name that reads like `key`, as a username or a GitHub login.
  const holder = (key, except, rows = records) => {
    for (const record of rows.values()) if (record.userId !== except && (record.usernameKey === key || record.nameKey === key)) return record.userId;
    return null;
  };
  // Hold the owner's GitHub login, and give a waiting request its default username.
  const settle = (record, identity, rows) => {
    const login = loginOf(identity), loginKey = login && usernameKey(login);
    if (loginKey && record.nameKey !== loginKey && !holder(loginKey, record.userId, rows)) record.nameKey = loginKey;
    if (record.status === 'pending' && !validUsername(record.username)) {
      const pick = defaultCandidates(identity).find(candidate => !holder(candidate.key, record.userId, rows));
      if (pick) Object.assign(record, { username: pick.username, usernameKey: pick.key, usernameBy: 'default' });
    }
    return record;
  };
  return {
    request(identity) {
      if (!validId(identity?.userId)) throw new Error('Invalid waitlist identity');
      return serialize(async () => {
        let existing = records.get(identity.userId);
        // A request keeps the name its owner currently signs in with, so the
        // approval list shows GitHub usernames rather than an older name.
        const name = recordFor(identity, adminIds, now).name;
        if (existing) {
          const updated = settle({ ...existing, name }, identity, records);
          if (JSON.stringify(updated) !== JSON.stringify(existing)) {
            existing = updated;
            const next = new Map(records); next.set(existing.userId, existing); await persist(next);
          }
        }
        if (existing) return adminIds.has(identity.userId) || autoApprove ? { ...existing, status: 'approved' } : existing;
        const record = recordFor(identity, adminIds, now, autoApprove), next = new Map(records);
        while (next.size >= maxRequests) {
          const oldest = [...next.values()].filter(entry => entry.status === 'pending').reduce((a, b) => !a || b.requestedAt < a.requestedAt ? b : a, null);
          if (!oldest) throw new Error('Waitlist capacity reached');
          next.delete(oldest.userId);
        }
        settle(record, identity, next);
        next.set(record.userId, record); await persist(next);
        return record;
      });
    },
    async setUsername({ userId, username, actorId }) {
      const problem = usernameRequest({ userId, username, actorId }, adminIds, contentFilter), admin = adminIds.has(actorId);
      if (problem) return { ok: false, reason: 'invalid', message: problem };
      const key = usernameKey(username);
      return serialize(async () => {
        const previous = records.get(userId);
        if (!previous) return { ok: false, reason: 'missing' };
        if (previous.username === username) return { ok: true, record: previous };
        if (previous.status === 'approved' || (!admin && previous.status !== 'pending')) return { ok: false, reason: 'locked' };
        // A new choice meets the 4-letter minimum; re-saving a kept shorter name returned above.
        const choice = usernameChoiceProblem(username);
        if (choice) return { ok: false, reason: 'invalid', message: choice };
        if (holder(key, userId)) return { ok: false, reason: 'taken' };
        const record = { ...previous, username, usernameKey: key, usernameBy: admin ? 'admin' : 'self' };
        const next = new Map(records); next.set(userId, record);
        await persist(next, admin ? [...audit, { action: 'username', userId, actorId, username, at: new Date(now()).toISOString() }] : audit);
        return { ok: true, record };
      });
    },
    async usernameOf(userId) {
      const record = records.get(userId);
      return record?.status === 'approved' && validUsername(record.username) ? record.username : null;
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
        next.set(record.userId, record);
        nextInvites.set(invite.id, { ...invite, status: 'redeemed', redeemedBy: record.userId, redeemedAt: at });
        await persist(next, [...audit, { action: 'invite-redeemed', inviteId: invite.id, userId: record.userId, actorId: record.userId, at }], nextInvites);
        return { ok: true };
      });
    },
    // Account erasure: the request (name, email, username holds), the account's
    // invites, its audit entries and every mention of it in other records.
    eraseUser(userId) {
      // An id the waitlist would refuse can have no records here.
      if (!validId(userId)) return Promise.resolve();
      return serialize(async () => {
        const at = new Date(now()).toISOString(), next = new Map(records), nextInvites = new Map();
        next.delete(userId);
        for (const [id, record] of next) if (record.decidedBy === userId) next.set(id, { ...record, decidedBy: ERASED_ACCOUNT });
        for (const [id, invite] of invites) if (invite.ownerId !== userId) nextInvites.set(id, erasedInvite(invite, userId, at));
        await persist(next, erasedAudit(audit, userId), nextInvites);
        // The legacy mirror is rewritten too; a missing one stays missing.
        const legacy = `${path}.audit.jsonl`;
        let lines;
        try { lines = (await readFile(legacy, 'utf8')).split('\n').filter(Boolean); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
        const kept = erasedAudit(lines.map(line => JSON.parse(line)), userId).map(entry => JSON.stringify(entry) + '\n').join('');
        await writeFile(`${legacy}.tmp`, kept, { mode: 0o600 });
        await rename(`${legacy}.tmp`, legacy);
      });
    },
  };
}

const REQUEST = `
-- KEYS[4] maps how a name reads (usernameKey) to the account that holds it.
local function heldByOther(key, userId)
  local owner = redis.call('HGET', KEYS[4], key)
  return owner and owner ~= userId
end
-- Hold the owner's GitHub login, and give a waiting request its default username.
local function settle(record)
  local changed = false
  if ARGV[6] ~= '' and record.nameKey ~= ARGV[6] and not heldByOther(ARGV[6], record.userId) then
    redis.call('HSET', KEYS[4], ARGV[6], record.userId)
    record.nameKey = ARGV[6]
    changed = true
  end
  if record.status == 'pending' and type(record.username) ~= 'string' then
    for _, candidate in ipairs(cjson.decode(ARGV[5])) do
      if not heldByOther(candidate.key, record.userId) then
        redis.call('HSET', KEYS[4], candidate.key, record.userId)
        record.username = candidate.username
        record.usernameKey = candidate.key
        record.usernameBy = 'default'
        changed = true
        break
      end
    end
  end
  return changed
end
local function release(record, userId)
  for _, key in ipairs({ record.usernameKey or false, record.nameKey or false }) do
    if key and redis.call('HGET', KEYS[4], key) == userId then redis.call('HDEL', KEYS[4], key) end
  end
end
local existing = redis.call('HGET', KEYS[1], ARGV[1])
if existing then
  local record = cjson.decode(existing)
  local name = cjson.decode(ARGV[2]).name
  local changed = record.name ~= name
  record.name = name
  if settle(record) then changed = true end
  if not changed then return existing end
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
  if raw then
    local evicted = cjson.decode(raw)
    if evicted.status == 'pending' then release(evicted, oldest); redis.call('HDEL', KEYS[1], oldest) end
  end
end
local record = cjson.decode(ARGV[2])
settle(record)
local encoded = cjson.encode(record)
redis.call('HSET', KEYS[1], ARGV[1], encoded)
if record.status == 'pending' then redis.call('ZADD', KEYS[2], tonumber(ARGV[3]), ARGV[1]) end
return encoded`;
// One username change, checked and claimed atomically. KEYS: users, usernames, audit.
// ARGV: userId, username, key, '1' for an approver, actorId, time.
const SET_USERNAME = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return cjson.encode({ reason = 'missing' }) end
local record = cjson.decode(raw)
local admin = ARGV[4] == '1'
if record.username == ARGV[2] then return cjson.encode({ record = record }) end
if record.status == 'approved' or (not admin and record.status ~= 'pending') then return cjson.encode({ reason = 'locked' }) end
local owner = redis.call('HGET', KEYS[2], ARGV[3])
if owner and owner ~= ARGV[1] then return cjson.encode({ reason = 'taken' }) end
if record.usernameKey and record.usernameKey ~= ARGV[3] and record.usernameKey ~= record.nameKey
  and redis.call('HGET', KEYS[2], record.usernameKey) == ARGV[1] then redis.call('HDEL', KEYS[2], record.usernameKey) end
redis.call('HSET', KEYS[2], ARGV[3], ARGV[1])
record.username = ARGV[2]
record.usernameKey = ARGV[3]
record.usernameBy = admin and 'admin' or 'self'
redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(record))
if admin then
  redis.call('LPUSH', KEYS[3], cjson.encode({ action = 'username', userId = ARGV[1], actorId = ARGV[5], username = ARGV[2], at = ARGV[6] }))
  redis.call('LTRIM', KEYS[3], 0, 9999)
end
return cjson.encode({ record = record })`;
// Account erasure, in the access namespace's one slot. The account's own request
// and holds go atomically (KEYS: users, pending, usernames, its invite index;
// ARGV: userId). Mentions elsewhere go in bounded batches of named fields, each
// re-read inside its script (KEYS: the hash; ARGV: userId, then the batch's own
// arguments and fields), so no script holds Redis for a whole table.
const ERASE_OWN = `
local id = ARGV[1]
local raw = redis.call('HGET', KEYS[1], id)
if raw then
  local record = cjson.decode(raw)
  for _, key in ipairs({ record.usernameKey or false, record.nameKey or false }) do
    if key and redis.call('HGET', KEYS[3], key) == id then redis.call('HDEL', KEYS[3], key) end
  end
  redis.call('HDEL', KEYS[1], id)
end
redis.call('ZREM', KEYS[2], id)
redis.call('DEL', KEYS[4])
return 1`;
// ARGV: userId, marker, fields.
const ERASE_DECIDERS = `
for i = 3, #ARGV do
  local raw = redis.call('HGET', KEYS[1], ARGV[i])
  if raw then
    local record = cjson.decode(raw)
    if record.decidedBy == ARGV[1] then record.decidedBy = ARGV[2]; redis.call('HSET', KEYS[1], ARGV[i], cjson.encode(record)) end
  end
end
return 1`;
// ARGV: userId, name keys. A hold left by an earlier login is released too.
const ERASE_HOLDS = `
for i = 2, #ARGV do if redis.call('HGET', KEYS[1], ARGV[i]) == ARGV[1] then redis.call('HDEL', KEYS[1], ARGV[i]) end end
return 1`;
// ARGV: userId, marker, time, invite ids.
const ERASE_INVITES = `
local id, erased, at = ARGV[1], ARGV[2], ARGV[3]
for i = 4, #ARGV do
  local value = redis.call('HGET', KEYS[1], ARGV[i])
  if value then
    local invite = cjson.decode(value)
    if invite.ownerId == id then redis.call('HDEL', KEYS[1], ARGV[i])
    else
      local changed = false
      if invite.assignedUserId == id then
        invite.assignedUserId = cjson.null; changed = true
        if invite.status == 'active' then invite.status = 'revoked'; invite.revokedAt = at end
      end
      if invite.redeemedBy == id then invite.redeemedBy = cjson.null; changed = true end
      if invite.createdBy == id then invite.createdBy = erased; changed = true end
      if changed then redis.call('HSET', KEYS[1], ARGV[i], cjson.encode(invite)) end
    end
  end
end
return 1`;
// The audit list is capped at 10,000 entries, so it is rewritten in one script. ARGV: userId, marker.
const ERASE_AUDIT = `
local id, erased = ARGV[1], ARGV[2]
local kept, changed = {}, false
for _, value in ipairs(redis.call('LRANGE', KEYS[1], 0, -1)) do
  local entry = cjson.decode(value)
  if entry.userId == id then changed = true
  else
    if entry.actorId == id or entry.assignedUserId == id then
      if entry.actorId == id then entry.actorId = erased end
      if entry.assignedUserId == id then entry.assignedUserId = cjson.null end
      value = cjson.encode(entry); changed = true
    end
    table.insert(kept, value)
  end
end
if changed then
  redis.call('DEL', KEYS[1])
  for i = 1, #kept, 500 do redis.call('RPUSH', KEYS[1], unpack(kept, i, math.min(i + 499, #kept))) end
end
return 1`;
export function createRedisWaitlist({ redis, prefix, admins = [], now = Date.now, maxRequests = MAX_WAITLIST_REQUESTS, inviteCapacity = INVITE_CAPACITY, contentFilter = defaultContentFilter() } = {}) {
  if (!redis?.eval || typeof prefix !== 'string' || !/^[A-Za-z0-9:{}_-]{1,160}$/.test(prefix)) throw new Error('Invalid waitlist configuration');
  const adminIds = new Set(admins), users = `${prefix}:waitlist:users`, audit = `${prefix}:waitlist:audit`;
  const invites = `${prefix}:waitlist:invites`, pending = `${prefix}:waitlist:pending`, usernames = `${prefix}:waitlist:usernames`;
  const transaction = async payload => {
    const time = now();
    // The owner whose invite index this call may read or extend.
    const indexOwner = payload.op === 'issue' ? payload.invite.ownerId : payload.userId ?? null;
    const ownerIndex = `${prefix}:waitlist:invites:owner:${createHash('sha256').update(indexOwner ?? '').digest('base64url')}`;
    const raw = await redis.eval(INVITE_TRANSACTION, 5, users, audit, invites, ownerIndex, `${prefix}:waitlist:invites:pruned`, JSON.stringify({
      ...payload, indexOwner, capacity: inviteCapacity, retention: INVITE_RETENTION,
      now: time, at: new Date(time).toISOString(), admins: Object.fromEntries(admins.map(id => [id, true])),
      // Only an approval can grant starter codes (never a redeem: the referral decay).
      starter: payload.op === 'decide' && payload.approved ? [newInvite(payload.userId, payload.actorId ?? payload.userId, time), newInvite(payload.userId, payload.actorId ?? payload.userId, time)] : [],
    }));
    return raw ? JSON.parse(raw) : null;
  };
  return {
    async request(identity) {
      if (!validId(identity?.userId)) throw new Error('Invalid waitlist identity');
      const record = recordFor(identity, adminIds, now), login = loginOf(identity);
      const raw = await redis.eval(REQUEST, 4, users, pending, `${prefix}:waitlist:pending-indexed`, usernames, record.userId, JSON.stringify(record), now(), maxRequests,
        JSON.stringify(defaultCandidates(identity)), login ? usernameKey(login) : '');
      if (!raw) throw new Error('Waitlist capacity reached');
      const existing = JSON.parse(raw);
      return adminIds.has(identity.userId) ? { ...existing, status: 'approved' } : existing;
    },
    async setUsername({ userId, username, actorId }) {
      const problem = usernameRequest({ userId, username, actorId }, adminIds, contentFilter), admin = adminIds.has(actorId);
      if (problem) return { ok: false, reason: 'invalid', message: problem };
      // As in the file store: only a real new choice on a changeable request meets the
      // 4-letter minimum; the script still decides missing, unchanged, locked and taken.
      const current = JSON.parse(await redis.hget(users, userId) ?? 'null');
      const changeable = current && current.username !== username && current.status !== 'approved' && (admin || current.status === 'pending');
      const choice = changeable && usernameChoiceProblem(username);
      if (choice) return { ok: false, reason: 'invalid', message: choice };
      const time = now(), result = JSON.parse(await redis.eval(SET_USERNAME, 3, users, usernames, audit, userId, username, usernameKey(username),
        admin ? '1' : '0', actorId, new Date(time).toISOString()));
      return result.record ? { ok: true, record: result.record } : { ok: false, reason: result.reason };
    },
    async usernameOf(userId) {
      if (!validId(userId)) return null;
      const raw = await redis.hget(users, userId), record = raw ? JSON.parse(raw) : null;
      return record?.status === 'approved' && validUsername(record.username) ? record.username : null;
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
    async eraseUser(userId) {
      if (!validId(userId)) return;
      const ownerIndex = `${prefix}:waitlist:invites:owner:${createHash('sha256').update(userId).digest('base64url')}`;
      await redis.eval(ERASE_OWN, 4, users, pending, usernames, ownerIndex, userId);
      const read = value => { try { return JSON.parse(value); } catch { return null; } };
      const passes = [
        [users, ERASE_DECIDERS, [ERASED_ACCOUNT], value => read(value)?.decidedBy === userId],
        [usernames, ERASE_HOLDS, [], value => value === userId],
        [invites, ERASE_INVITES, [ERASED_ACCOUNT, new Date(now()).toISOString()], value => {
          const invite = read(value);
          return Boolean(invite) && [invite.ownerId, invite.assignedUserId, invite.redeemedBy, invite.createdBy].includes(userId);
        }],
      ];
      for (const [key, script, extra, mentions] of passes) {
        let cursor = '0';
        do {
          const [next, entries] = await redis.hscan(key, cursor, 'COUNT', 250);
          const fields = [];
          for (let index = 0; index < entries.length; index += 2) if (mentions(entries[index + 1])) fields.push(entries[index]);
          if (fields.length) await redis.eval(script, 1, key, userId, ...extra, ...fields);
          cursor = next;
        } while (cursor !== '0');
      }
      await redis.eval(ERASE_AUDIT, 1, audit, userId, ERASED_ACCOUNT);
    },
  };
}
