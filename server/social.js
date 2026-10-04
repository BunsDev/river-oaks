import { createHash, randomUUID } from 'node:crypto';

const LIMIT = 50;
const MESSAGE_LIMIT = 40;
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);
const cleanName = value => typeof value === 'string' ? value.trim().slice(0, 60) || 'Resident' : 'Resident';
const cleanText = value => typeof value === 'string' ? value.trim() : '';
const pairIds = (a, b) => [a, b].sort();
const pairKey = (a, b) => pairIds(a, b).join('\u0000');
const history = record => Array.isArray(record.messages) ? record.messages : [];
const ordered = items => items.sort((a, b) => a.peer.name.localeCompare(b.peer.name) || a.peer.id.localeCompare(b.peer.id));
const view = (record, userId) => ({
  peer: { id: record.ids.find(id => id !== userId), name: record.names[record.ids.findIndex(id => id !== userId)] },
  status: record.status, direction: record.requester === userId ? 'outgoing' : 'incoming',
  latest: history(record).at(-1) ?? null,
});
const invalid = { ok: false, reason: 'invalid' };

export function createMemorySocial({ now = Date.now, createId = randomUUID } = {}) {
  const records = new Map(), indexes = new Map();
  const peers = id => indexes.get(id) ?? new Set();
  return {
    async list(userId) {
      if (!validId(userId)) throw new Error('Invalid account');
      return ordered([...peers(userId)].map(peer => view(records.get(pairKey(userId, peer)), userId)));
    },
    async request(actor, target) {
      if (!validId(actor?.userId) || !validId(target?.userId) || actor.userId === target.userId) return invalid;
      const ids = pairIds(actor.userId, target.userId), key = pairKey(...ids);
      if (records.has(key)) return { ok: false, reason: 'existing' };
      if (peers(actor.userId).size >= LIMIT || peers(target.userId).size >= LIMIT) return { ok: false, reason: 'limit' };
      records.set(key, { ids, names: ids.map(id => cleanName(id === actor.userId ? actor.name : target.name)), status: 'pending', requester: actor.userId, messages: [] });
      for (const [id, peer] of [[actor.userId, target.userId], [target.userId, actor.userId]]) {
        if (!indexes.has(id)) indexes.set(id, new Set());
        indexes.get(id).add(peer);
      }
      return { ok: true };
    },
    async accept(userId, peerId) {
      if (!validId(userId) || !validId(peerId)) return invalid;
      const record = records.get(pairKey(userId, peerId));
      if (!record || record.status !== 'pending' || record.requester !== peerId) return { ok: false, reason: 'missing' };
      record.status = 'accepted'; return { ok: true };
    },
    async remove(userId, peerId) {
      if (!validId(userId) || !validId(peerId)) return invalid;
      const key = pairKey(userId, peerId);
      if (!records.has(key)) return { ok: false, reason: 'missing' };
      records.delete(key); peers(userId).delete(peerId); peers(peerId).delete(userId);
      return { ok: true };
    },
    async messages(userId, peerId) {
      if (!validId(userId) || !validId(peerId)) return null;
      const record = records.get(pairKey(userId, peerId));
      return record?.status === 'accepted' ? structuredClone(record.messages) : null;
    },
    async send(actor, peerId, text) {
      const messageText = cleanText(text);
      if (!validId(actor?.userId) || !validId(peerId) || !messageText || messageText.length > 280 || /[\u0000-\u001f\u007f]/.test(messageText)) return invalid;
      const record = records.get(pairKey(actor.userId, peerId));
      if (record?.status !== 'accepted') return { ok: false, reason: 'missing' };
      const message = { id: createId(), authorId: actor.userId, authorName: cleanName(actor.name), text: messageText, at: now() };
      record.messages.push(message); if (record.messages.length > MESSAGE_LIMIT) record.messages.shift();
      record.names[record.ids.indexOf(actor.userId)] = cleanName(actor.name);
      return { ok: true, message };
    },
  };
}

const CHANGE = `
local raw = redis.call('GET', KEYS[1])
local action = ARGV[1]
if action == 'request' then
  if raw then return 'existing' end
  if redis.call('SCARD', KEYS[2]) >= 50 or redis.call('SCARD', KEYS[3]) >= 50 then return 'limit' end
  redis.call('SET', KEYS[1], ARGV[6])
  redis.call('SADD', KEYS[2], ARGV[3])
  redis.call('SADD', KEYS[3], ARGV[2])
  return 'ok'
end
if not raw then return 'missing' end
local record = cjson.decode(raw)
if action == 'accept' then
  if record.status ~= 'pending' or record.requester ~= ARGV[3] then return 'missing' end
  record.status = 'accepted'
elseif action == 'remove' then
  redis.call('DEL', KEYS[1])
  redis.call('SREM', KEYS[2], ARGV[3])
  redis.call('SREM', KEYS[3], ARGV[2])
  return 'ok'
elseif action == 'send' then
  if record.status ~= 'accepted' then return 'missing' end
  local message = cjson.decode(ARGV[6])
  table.insert(record.messages, message)
  if #record.messages > 40 then table.remove(record.messages, 1) end
  for i, id in ipairs(record.ids) do
    if id == ARGV[2] then record.names[i] = message.authorName end
  end
else return 'invalid' end
redis.call('SET', KEYS[1], cjson.encode(record))
return 'ok'
`;

export function createRedisSocial({ redis, prefix, now = Date.now, createId = randomUUID } = {}) {
  if (!redis?.eval || typeof prefix !== 'string' || !/^\{[^{}]+\}$/.test(prefix)) throw new Error('Invalid social storage');
  const hash = value => createHash('sha256').update(value).digest('hex');
  const key = (a, b) => `${prefix}:social:pair:${hash(pairKey(a, b))}`;
  const index = id => `${prefix}:social:index:${hash(id)}`;
  const change = async (action, a, b, payload = '') => {
    const reason = await redis.eval(CHANGE, 3, key(a, b), index(a), index(b), action, a, b, '', '', payload);
    return { ok: reason === 'ok', ...reason === 'ok' ? {} : { reason } };
  };
  return {
    async list(userId) {
      if (!validId(userId)) throw new Error('Invalid account');
      const ids = await redis.smembers(index(userId));
      if (ids.length > LIMIT) throw new Error('Invalid social index');
      if (!ids.length) return [];
      const records = await redis.mget(...ids.map(id => key(userId, id)));
      return ordered(records.filter(Boolean).map(raw => view(JSON.parse(raw), userId)));
    },
    async request(actor, target) {
      if (!validId(actor?.userId) || !validId(target?.userId) || actor.userId === target.userId) return invalid;
      const ids = pairIds(actor.userId, target.userId);
      return change('request', actor.userId, target.userId, JSON.stringify({ ids, names: ids.map(id => cleanName(id === actor.userId ? actor.name : target.name)), status: 'pending', requester: actor.userId, messages: [] }));
    },
    async accept(userId, peerId) { return validId(userId) && validId(peerId) ? change('accept', userId, peerId) : invalid; },
    async remove(userId, peerId) { return validId(userId) && validId(peerId) ? change('remove', userId, peerId) : invalid; },
    async messages(userId, peerId) {
      if (!validId(userId) || !validId(peerId)) return null;
      const raw = await redis.get(key(userId, peerId)), record = raw && JSON.parse(raw);
      return record?.status === 'accepted' ? history(record) : null;
    },
    async send(actor, peerId, text) {
      const messageText = cleanText(text);
      if (!validId(actor?.userId) || !validId(peerId) || !messageText || messageText.length > 280 || /[\u0000-\u001f\u007f]/.test(messageText)) return invalid;
      const message = { id: createId(), authorId: actor.userId, authorName: cleanName(actor.name), text: messageText, at: now() };
      const result = await change('send', actor.userId, peerId, JSON.stringify(message));
      return result.ok ? { ok: true, message } : result;
    },
  };
}
