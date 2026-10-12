import { createHash, randomBytes } from 'node:crypto';

export const INVITE_LIFETIME = 30 * 86400000;
// The invite table's size, and how long an invite is kept past its expiry
// before a full table may forget it.
export const INVITE_CAPACITY = 50_000, INVITE_RETENTION = 90 * 86400000;
export const inviteDigest = code => createHash('sha256').update(code).digest('hex');
export const validInviteCode = code => typeof code === 'string' && /^[A-Za-z0-9_-]{32}$/.test(code);
export const validInviteId = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
export function newInvite(ownerId, actorId, time, assignedUserId = null) {
  const code = randomBytes(24).toString('base64url');
  return { id: inviteDigest(code), code, ownerId, createdBy: actorId, assignedUserId,
    createdAt: new Date(time).toISOString(), expiresAt: new Date(time + INVITE_LIFETIME).toISOString(),
    expires: time + INVITE_LIFETIME, status: 'active' };
}
export const visibleInvite = (invite, time) => ({ ...invite,
  status: invite.status === 'active' && invite.expires <= time ? 'expired' : invite.status });

// Admission and one-time starter grants share the same Redis transaction and
// hash slot as approval. A competing server can never spend a code twice.
export const INVITE_TRANSACTION = `
local p = cjson.decode(ARGV[1])
local function user(id)
  local raw = redis.call('HGET', KEYS[1], id)
  return raw and cjson.decode(raw) or nil
end
local function approved(id)
  return p.admins[id] == true or (user(id) and user(id).status == 'approved')
end
-- KEYS[4] indexes one owner's invites (p.indexOwner), so listing or revoking
-- them never reads the whole table. '*' marks an index that is complete; an
-- owner from before the index existed is indexed by a one-time scan.
local function saveInvite(invite)
  redis.call('HSET', KEYS[3], invite.id, cjson.encode(invite))
  if p.indexOwner ~= nil and p.indexOwner ~= cjson.null and invite.ownerId == p.indexOwner then redis.call('SADD', KEYS[4], invite.id) end
end
local function ownedInvites()
  local found = {}
  if redis.call('SISMEMBER', KEYS[4], '*') == 1 then
    for _, id in ipairs(redis.call('SMEMBERS', KEYS[4])) do
      if id ~= '*' then
        local raw = redis.call('HGET', KEYS[3], id)
        if raw then table.insert(found, cjson.decode(raw)) end
      end
    end
  else
    for _, raw in ipairs(redis.call('HVALS', KEYS[3])) do
      local invite = cjson.decode(raw)
      if invite.ownerId == p.indexOwner then table.insert(found, invite); redis.call('SADD', KEYS[4], invite.id) end
    end
    redis.call('SADD', KEYS[4], '*')
  end
  return found
end
-- A full table forgets invites long past their expiry (used, revoked or lapsed)
-- before it refuses a new one.
local function makeRoom(needed)
  if redis.call('HLEN', KEYS[3]) + needed <= p.capacity then return true end
  for _, raw in ipairs(redis.call('HVALS', KEYS[3])) do
    local invite = cjson.decode(raw)
    if invite.expires <= p.now - p.retention then redis.call('HDEL', KEYS[3], invite.id) end
  end
  return redis.call('HLEN', KEYS[3]) + needed <= p.capacity
end
local function audit(event)
  redis.call('LPUSH', KEYS[2], cjson.encode(event))
  redis.call('LTRIM', KEYS[2], 0, 9999)
end
local function grant(record)
  if not record.invitesGrantedAt then
    if not makeRoom(2) then return false end
    for _, invite in ipairs(p.starter) do saveInvite(invite) end
    record.invitesGrantedAt = p.at
  end
  return true
end
if p.op == 'list-owner' then
  local found = ownedInvites()
  return #found == 0 and '[]' or cjson.encode(found)
elseif p.op == 'revoke-owner' then
  for _, invite in ipairs(ownedInvites()) do
    if invite.status == 'active' then
      invite.status = 'revoked'; invite.revokedAt = p.at; saveInvite(invite)
    end
  end
  audit({action='invites-revoked', userId=p.userId, actorId=p.actorId, at=p.at})
  return 'true'
elseif p.op == 'decide' then
  local record = user(p.userId)
  if not record then return false end
  if p.approved and not grant(record) then return redis.error_reply('Invitation capacity reached') end
  record.status = p.approved and 'approved' or 'rejected'
  record.decidedAt = p.at
  record.decidedBy = p.actorId
  if not p.approved then
    for _, invite in ipairs(ownedInvites()) do
      if invite.status == 'active' then
        invite.status = 'revoked'; invite.revokedAt = p.at; saveInvite(invite)
      end
    end
  end
  redis.call('HSET', KEYS[1], p.userId, cjson.encode(record))
  audit({userId=p.userId, status=record.status, at=p.at, actorId=p.actorId})
  return cjson.encode(record)
elseif p.op == 'issue' then
  if not approved(p.invite.ownerId) then return false end
  if not makeRoom(1) then return redis.error_reply('Invitation capacity reached') end
  if p.invite.assignedUserId ~= cjson.null and not user(p.invite.assignedUserId) then return false end
  saveInvite(p.invite)
  audit({action='invite-issued', inviteId=p.invite.id, actorId=p.actorId, at=p.at})
  return cjson.encode(p.invite)
elseif p.op == 'update' then
  local raw = redis.call('HGET', KEYS[3], p.id)
  if not raw then return false end
  local invite = cjson.decode(raw)
  if invite.status ~= 'active' or invite.expires <= p.now then return false end
  if p.expire then
    invite.status = 'revoked'; invite.revokedAt = p.at
  else
    if p.assignedUserId ~= cjson.null and not user(p.assignedUserId) then return false end
    invite.assignedUserId = p.assignedUserId
  end
  saveInvite(invite)
  audit({action=p.expire and 'invite-expired' or 'invite-assigned', inviteId=p.id, actorId=p.actorId, assignedUserId=invite.assignedUserId, at=p.at})
  return cjson.encode(invite)
elseif p.op == 'redeem' then
  local record = user(p.userId)
  local raw = redis.call('HGET', KEYS[3], p.id)
  if not record or record.status ~= 'pending' or not raw then return false end
  local invite = cjson.decode(raw)
  if invite.status ~= 'active' or invite.expires <= p.now or invite.ownerId == p.userId
    or not approved(invite.ownerId)
    or (invite.assignedUserId ~= cjson.null and invite.assignedUserId ~= p.userId) then return false end
  if not grant(record) then return redis.error_reply('Invitation capacity reached') end
  invite.status = 'redeemed'; invite.redeemedBy = p.userId; invite.redeemedAt = p.at
  saveInvite(invite)
  record.status = 'approved'; record.decidedAt = p.at; record.decidedBy = invite.ownerId; record.inviteId = invite.id
  redis.call('HSET', KEYS[1], p.userId, cjson.encode(record))
  audit({action='invite-redeemed', inviteId=invite.id, userId=p.userId, actorId=p.userId, at=p.at})
  return cjson.encode({ok=true})
end
return false`;
