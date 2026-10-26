import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// Player blocking (#292). Each account keeps the residents it blocked, with the
// name it saw, and a reverse index of who blocked it, so a block counts in both
// directions with one read and account erasure finds every mention. Twins share
// one contract: add(identity, peer) and remove(userId, peerId) → {ok} or
// {ok:false,reason}; list(userId) → [{id,name}]; between(a, b) → boolean;
// hidden(userId) → the ids hidden from userId either way; version(userId) → a number
// that changes whenever hidden(userId) may have; eraseUser(userId).
export const BLOCK_LIMIT = 200;
const MAX_NAME = 80;
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);
const nameOf = value => typeof value === 'string' && value.trim() ? [...value.trim()].slice(0, MAX_NAME).join('') : 'Resident';
const invalid = { ok: false, reason: 'invalid' };
const byName = (a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// What one viewer receives of a shared world snapshot: the chat lines, gestures and
// greetings of residents hidden from them drop out, and so do game invitations that
// involve one. An invitation stays in view for the resident who sent it, so a blocked
// sender sees it go unanswered. The residents themselves stay in the town.
const unseen = (hidden, invite, viewerId) => Boolean(invite) && invite.from !== viewerId && (hidden.has(invite.from) || hidden.has(invite.to));
export function viewFor(snapshot, hidden, viewerId = null) {
  if (!hidden?.size || !snapshot) return snapshot;
  const view = { ...snapshot };
  if (Array.isArray(snapshot.chat)) view.chat = snapshot.chat.filter(entry => !hidden.has(entry.authorId));
  // A greeting shows from neither side: the hidden resident's, or anyone's toward them,
  // whose snapshot also gives the greeting as their gesture.
  if (Array.isArray(snapshot.players)) view.players = snapshot.players.map(player => hidden.has(player.id) && (player.gesture || player.interaction)
    ? { ...player, gesture: null, interaction: null }
    : hidden.has(player.interaction?.peerId) ? { ...player, gesture: player.gesture === player.interaction.kind ? null : player.gesture, interaction: null } : player);
  if (Array.isArray(snapshot.interactions)) view.interactions = snapshot.interactions.filter(item => !hidden.has(item.fromId) && !hidden.has(item.toId));
  for (const key of ['tables', 'darts', 'axes']) if (Array.isArray(snapshot[key])) {
    view[key] = snapshot[key].map(item => unseen(hidden, item?.invite, viewerId) ? { ...item, invite: null } : item);
  }
  return view;
}

// World commands aimed at a blocked resident get the world's own answer for a
// resident who is not there, so nothing reveals the block. Greetings, darts and axe
// invitations and travel go on toward a resident who is never present, and the world
// refuses them in its usual order. Table games invite whoever sits across, so their
// invitations are hidden from the invited resident's view instead. Office and home invitations come only from Jevica's accounts: anyone else
// keeps the world's own refusal, and hers is refused as an invalid guest.
export const ABSENT_RESIDENT = 'resident-not-here';
const invitation = command => command.type === 'office' && command.action === 'invite' ? 'invalid_office_guest'
  : command.type === 'homeAccess' && command.action === 'grant' ? 'invalid_home_access' : null;
// A campus guest grant toward a blocked account names the actor instead. The world then
// answers after its own lease, tenant, status and version checks: a tenant naming
// themself is an invalid guest, and anyone else keeps the refusal they would get. A
// retry of a grant first sent before the block is answered as a conflicting operation.
export async function screenCommand(blocks, userId, command, isAdmin) {
  if (!blocks || typeof command?.peerId !== 'string') return { command };
  const aimed = command.type === 'travel' || ['interaction', 'darts', 'axes'].includes(command.type) && command.action === 'invite';
  const grant = command.type === 'campus' && command.action === 'grant';
  const refusal = invitation(command);
  if (!aimed && !grant && !(refusal && isAdmin(userId)) || !await blocks.between(userId, command.peerId)) return { command };
  if (grant) return { command: { ...command, peerId: userId } };
  return aimed ? { command: { ...command, peerId: ABSENT_RESIDENT } } : { refusal: { ok: false, error: refusal, message: refusal } };
}

// Access a command gives another account: a campus guest grant, or Jevica's office and
// home invitations. One checked just before a block was stored can land after the
// block's separation, so once it succeeds the server checks again and ends it.
export const grantedPeer = command => typeof command?.peerId === 'string'
  && (command.type === 'campus' && command.action === 'grant' || invitation(command)) ? command.peerId : null;

// A connection's hidden set follows its account's block version: a refresh reads the
// version first and reloads the set only when it changed, and a read that started
// earlier never replaces one that started later. A store error is thrown to the caller.
export async function loadHidden(blocks, holder, userId) {
  const asked = holder.hiddenAsked = (holder.hiddenAsked ?? 0) + 1;
  const version = await blocks.version(userId);
  if (version === holder.hiddenVersion) return;
  const hidden = await blocks.hidden(userId);
  if (holder.hiddenAsked === asked) { holder.hidden = hidden; holder.hiddenVersion = version; }
}

export function createMemoryBlocks(initial = []) {
  const blocked = new Map(), blockers = new Map(), versions = new Map();
  const drop = (map, id, peer) => { map.get(id)?.delete(peer); if (!map.get(id)?.size) map.delete(id); };
  const bump = (...ids) => { for (const id of ids) versions.set(id, (versions.get(id) ?? 0) + 1); };
  const store = {
    async list(userId) {
      if (!validId(userId)) throw new Error('Invalid account');
      return [...(blocked.get(userId) ?? [])].map(([id, name]) => ({ id, name })).sort(byName);
    },
    async add(userId, peer) {
      if (!validId(userId) || !validId(peer?.userId) || userId === peer.userId) return invalid;
      const mine = blocked.get(userId) ?? new Map();
      if (!mine.has(peer.userId) && mine.size >= BLOCK_LIMIT) return { ok: false, reason: 'limit' };
      mine.set(peer.userId, nameOf(peer.name)); blocked.set(userId, mine);
      if (!blockers.has(peer.userId)) blockers.set(peer.userId, new Set());
      blockers.get(peer.userId).add(userId); bump(userId, peer.userId);
      return { ok: true };
    },
    async remove(userId, peerId) {
      if (!validId(userId) || !validId(peerId)) return invalid;
      if (!blocked.get(userId)?.has(peerId)) return { ok: true };
      drop(blocked, userId, peerId); drop(blockers, peerId, userId); bump(userId, peerId);
      return { ok: true };
    },
    async between(a, b) { return validId(a) && validId(b) && Boolean(blocked.get(a)?.has(b) || blocked.get(b)?.has(a)); },
    async hidden(userId) {
      if (!validId(userId)) throw new Error('Invalid account');
      return new Set([...(blocked.get(userId)?.keys() ?? []), ...(blockers.get(userId) ?? [])]);
    },
    async version(userId) { return validId(userId) ? versions.get(userId) ?? 0 : 0; },
    // Account erasure: the account's list, and its place on everyone else's.
    async eraseUser(userId) {
      if (!validId(userId)) throw new Error('Invalid account');
      for (const peer of blocked.get(userId)?.keys() ?? []) { drop(blockers, peer, userId); bump(peer); }
      for (const blocker of blockers.get(userId) ?? []) { drop(blocked, blocker, userId); bump(blocker); }
      blocked.delete(userId); blockers.delete(userId); versions.delete(userId);
    },
    // Every list, as [userId, [[peerId, name], …]], for the standalone town's file.
    dump: () => [...blocked].map(([id, peers]) => [id, [...peers]]),
  };
  for (const [userId, peers] of Array.isArray(initial) ? initial : []) for (const [peerId, name] of Array.isArray(peers) ? peers : []) void store.add(userId, { userId: peerId, name });
  return store;
}

// The standalone town keeps blocks in a private file beside its waitlist and
// moderation files, written through a temporary file and an atomic rename, so a block
// outlasts a restart there too. A write that fails fails the request.
export async function createFileBlocks(path) {
  let initial = [];
  try {
    const data = JSON.parse(await readFile(path, 'utf8'));
    if (data?.version !== 1 || !Array.isArray(data.blocks)) throw new Error('Invalid block store');
    initial = data.blocks;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const memory = createMemoryBlocks(initial);
  let queue = Promise.resolve();
  // Each change is tried on a copy and written before the town applies it, so a failed
  // write changes nothing; a change that alters no list writes nothing.
  const saved = method => (...args) => {
    const next = queue.then(async () => {
      const before = JSON.stringify(memory.dump()), copy = createMemoryBlocks(memory.dump());
      const result = await copy[method](...args), after = JSON.stringify(copy.dump());
      if (after !== before) {
        await writeFile(`${path}.tmp`, JSON.stringify({ version: 1, blocks: copy.dump() }) + '\n', { mode: 0o600 });
        await rename(`${path}.tmp`, path);
      }
      return result?.ok === false ? result : memory[method](...args);
    });
    queue = next.catch(() => {});
    return next;
  };
  return { ...memory, add: saved('add'), remove: saved('remove'), eraseUser: saved('eraseUser') };
}

// KEYS: the actor's list (peer id → name), the peer's reverse index, then both
// accounts' versions. ARGV: peer, actor, name, limit.
const ADD = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 and redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[4]) then return 'limit' end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
redis.call('SADD', KEYS[2], ARGV[2])
redis.call('INCR', KEYS[3]) redis.call('INCR', KEYS[4])
return 'ok'`;
// Both the list entry and its reverse index go; only a removal that took one of them
// away changes either version.
const REMOVE = `if redis.call('HDEL', KEYS[1], ARGV[1]) + redis.call('SREM', KEYS[2], ARGV[2]) > 0 then redis.call('INCR', KEYS[3]) redis.call('INCR', KEYS[4]) end return 'ok'`;
const BETWEEN = `if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 or redis.call('HEXISTS', KEYS[2], ARGV[2]) == 1 then return 1 end return 0`;

export function createRedisBlocks({ redis, prefix } = {}) {
  if (!redis?.eval || typeof prefix !== 'string' || !/^\{[^{}]+\}$/.test(prefix)) throw new Error('Invalid block storage');
  const hash = id => createHash('sha256').update(id).digest('hex');
  const list = id => `${prefix}:blocks:v1:list:${hash(id)}`, by = id => `${prefix}:blocks:v1:by:${hash(id)}`;
  const ver = id => `${prefix}:blocks:v1:version:${hash(id)}`;
  return {
    async list(userId) {
      if (!validId(userId)) throw new Error('Invalid account');
      return Object.entries(await redis.hgetall(list(userId))).map(([id, name]) => ({ id, name })).sort(byName);
    },
    async add(userId, peer) {
      if (!validId(userId) || !validId(peer?.userId) || userId === peer.userId) return invalid;
      const reason = await redis.eval(ADD, 4, list(userId), by(peer.userId), ver(userId), ver(peer.userId), peer.userId, userId, nameOf(peer.name), BLOCK_LIMIT);
      return reason === 'ok' ? { ok: true } : { ok: false, reason };
    },
    async remove(userId, peerId) {
      if (!validId(userId) || !validId(peerId)) return invalid;
      await redis.eval(REMOVE, 4, list(userId), by(peerId), ver(userId), ver(peerId), peerId, userId);
      return { ok: true };
    },
    async between(a, b) { return validId(a) && validId(b) && await redis.eval(BETWEEN, 2, list(a), list(b), b, a) === 1; },
    async hidden(userId) {
      if (!validId(userId)) throw new Error('Invalid account');
      const [mine, theirs] = await Promise.all([redis.hkeys(list(userId)), redis.smembers(by(userId))]);
      return new Set([...mine, ...theirs]);
    },
    async version(userId) { return validId(userId) ? Number(await redis.get(ver(userId)) ?? 0) : 0; },
    // Erasure runs after the account's sessions are revoked, so nobody new can block it;
    // a block that was already in flight is caught by the second pass.
    async eraseUser(userId) {
      if (!validId(userId)) throw new Error('Invalid account');
      for (let pass = 0; pass < 2; pass++) {
        for (const peer of await redis.hkeys(list(userId))) { await redis.srem(by(peer), userId); await redis.incr(ver(peer)); }
        for (const blocker of await redis.smembers(by(userId))) { await redis.hdel(list(blocker), userId); await redis.incr(ver(blocker)); }
        await redis.del(list(userId), by(userId), ver(userId));
      }
    },
  };
}
