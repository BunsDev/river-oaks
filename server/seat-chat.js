// Seat chat (#825 slice 3, Val's decision 3). Sitting shares nothing and never marks anyone as
// available. Text flows only after both people act: one asks someone seated in the same cluster,
// the other accepts. Standing ends it, and a block overrides it. The sender always sees who will
// receive the message. Nothing here reaches the shared snapshot: each account reads only its own
// view (viewFor), so a third player cannot learn that anyone asked, answered or is talking.
//
// A refused or lapsed request looks the same to the person who asked, and a request toward
// someone who is not there, or who has blocked them, gets the same answer as any other refusal.
export const SEAT_CHAT_RULES = Object.freeze({ inviteMs: 60000, retryMs: 60000, inviteGapMs: 2000, inboxLimit: 3, messages: 30, sessionsLimit: 32 });
const UNAVAILABLE = { ok: false, error: 'seat_chat_unavailable', message: 'That person is not available to talk here.' };
const refuse = (error, message) => ({ ok: false, error, message });
const pairKey = (from, to) => `${from}\n${to}`;
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 160;

// clusterOf(userId): the cluster that account is seated in, or null. nameOf(userId): its display name.
export function createSeatChat({ clusterOf, nameOf = id => id }) {
  let invites = [], sessions = [], retries = new Map(), asked = new Map(), nextSession = 1, nextMessage = 1;
  const sessionOf = userId => sessions.find(session => session.a === userId || session.b === userId) ?? null;
  const shared = (a, b) => { const cluster = clusterOf(a); return cluster && cluster === clusterOf(b) ? cluster : null; };

  // Everything is checked against where people sit now, so every way of leaving a seat counts:
  // standing, travel, a knockdown, a restore, disconnecting past the grace, account erasure.
  function reconcile(time) {
    const before = invites.length + sessions.length;
    invites = invites.filter(invite => invite.expiresAt > time && shared(invite.from, invite.to));
    sessions = sessions.filter(session => shared(session.a, session.b));
    for (const [key, until] of retries) if (until <= time) retries.delete(key);
    for (const [key, at] of asked) if (time - at >= SEAT_CHAT_RULES.inviteGapMs) asked.delete(key);
    return invites.length + sessions.length !== before;
  }

  function invite(userId, peerId, time) {
    if (!validId(peerId) || peerId === userId || !shared(userId, peerId)) return UNAVAILABLE;
    if (sessionOf(userId)) return refuse('seat_chat_busy', 'Leave this conversation first.');
    if (invites.some(item => item.from === userId)) return refuse('seat_chat_pending', 'You already asked someone. Cancel that first.');
    if (asked.has(userId)) return refuse('seat_chat_cooldown', 'Wait a moment before asking again.');
    // Declining and lapsing both end in this quiet wait, so nobody can be asked over and over.
    if (retries.has(pairKey(userId, peerId)) || invites.filter(item => item.to === peerId).length >= SEAT_CHAT_RULES.inboxLimit) return UNAVAILABLE;
    // Two people asking each other have both acted.
    const crossing = invites.find(item => item.from === peerId && item.to === userId);
    if (crossing) return accept(userId, peerId, time);
    invites.push({ from: userId, to: peerId, at: time, expiresAt: time + SEAT_CHAT_RULES.inviteMs });
    asked.set(userId, time);
    return { ok: true };
  }

  function accept(userId, peerId, time) {
    const found = invites.find(item => item.from === peerId && item.to === userId);
    if (!found) return UNAVAILABLE;
    if (sessionOf(userId) || sessionOf(peerId) || sessions.length >= SEAT_CHAT_RULES.sessionsLimit) return refuse('seat_chat_busy', 'That conversation cannot start right now.');
    const session = { id: nextSession++, a: peerId, b: userId, startedAt: time, messages: [] };
    sessions.push(session);
    invites = invites.filter(item => ![peerId, userId].includes(item.from) && ![peerId, userId].includes(item.to));
    return { ok: true, sessionId: session.id };
  }

  function dropInvite(from, to, time) {
    const before = invites.length;
    invites = invites.filter(item => !(item.from === from && item.to === to));
    if (invites.length === before) return false;
    retries.set(pairKey(from, to), time + SEAT_CHAT_RULES.retryMs);
    return true;
  }

  function send(userId, sessionId, text, time) {
    const session = sessionOf(userId);
    // A line typed for one conversation never lands in a later one.
    if (!session || session.id !== sessionId) return refuse('seat_chat_ended', 'That conversation has ended.');
    const entry = { id: nextMessage++, authorId: userId, text, at: time };
    session.messages.push(entry);
    if (session.messages.length > SEAT_CHAT_RULES.messages) session.messages.shift();
    return { ok: true, id: entry.id, to: session.a === userId ? session.b : session.a };
  }

  // action: invite|cancel|accept|decline|send|leave. `text` is already validated by the caller.
  function command(userId, message, time) {
    reconcile(time);
    const { action, peerId } = message;
    if (!clusterOf(userId)) return UNAVAILABLE;
    if (action === 'invite') return invite(userId, peerId, time);
    if (action === 'accept') return accept(userId, peerId, time);
    if (action === 'decline') return dropInvite(peerId, userId, time) ? { ok: true } : UNAVAILABLE;
    if (action === 'cancel') {
      const mine = invites.find(item => item.from === userId);
      if (!mine) return UNAVAILABLE;
      dropInvite(userId, mine.to, time);
      return { ok: true };
    }
    if (action === 'send') return send(userId, message.sessionId, message.text, time);
    if (action === 'leave') {
      const session = sessionOf(userId);
      if (!session) return refuse('seat_chat_ended', 'That conversation has ended.');
      sessions = sessions.filter(item => item !== session);
      // Whoever left is not asked straight back by the person they left.
      retries.set(pairKey(session.a === userId ? session.b : session.a, userId), time + SEAT_CHAT_RULES.retryMs);
      return { ok: true };
    }
    return refuse('invalid_seat_chat', 'Invalid conversation request.');
  }

  function viewFor(userId, time) {
    const session = sessionOf(userId);
    const incoming = invites.filter(item => item.to === userId && item.expiresAt > time);
    const outgoing = invites.find(item => item.from === userId && item.expiresAt > time);
    if (!session && !incoming.length && !outgoing) return null;
    const peerOf = id => ({ id, name: nameOf(id) });
    return {
      invites: incoming.map(item => ({ from: peerOf(item.from), expiresAt: item.expiresAt })),
      outgoing: outgoing ? { to: peerOf(outgoing.to), expiresAt: outgoing.expiresAt } : null,
      session: session ? { id: session.id, peer: peerOf(session.a === userId ? session.b : session.a),
        messages: session.messages.map(entry => ({ ...entry, authorName: nameOf(entry.authorId) })) } : null,
    };
  }

  function views(time) {
    const out = {};
    for (const id of new Set([...invites.flatMap(item => [item.from, item.to]), ...sessions.flatMap(item => [item.a, item.b])])) {
      const view = viewFor(id, time);
      if (view) out[id] = view;
    }
    return out;
  }

  // A block ends everything between the two, whichever way it stands.
  function separate(a, b) {
    const before = invites.length + sessions.length;
    invites = invites.filter(item => !([a, b].includes(item.from) && [a, b].includes(item.to)));
    sessions = sessions.filter(item => !([a, b].includes(item.a) && [a, b].includes(item.b)));
    return invites.length + sessions.length !== before;
  }

  function forget(userId) {
    invites = invites.filter(item => item.from !== userId && item.to !== userId);
    sessions = sessions.filter(item => item.a !== userId && item.b !== userId);
    for (const key of retries.keys()) if (key.split('\n').includes(userId)) retries.delete(key);
    asked.delete(userId);
  }

  // Saved only while something is live, so an idle town's checkpoint is byte-for-byte unchanged
  // and an older build that ignores the field just ends any conversation on rollback.
  function checkpoint() {
    if (!invites.length && !sessions.length && !retries.size) return null;
    return JSON.parse(JSON.stringify({ invites, sessions, retries: [...retries], nextSession, nextMessage }));
  }

  // Conversations are not worth refusing a town over: anything malformed starts clean.
  function restore(saved) {
    invites = []; sessions = []; retries = new Map(); asked = new Map(); nextSession = 1; nextMessage = 1;
    if (saved === undefined || saved === null) return;
    const number = value => Number.isFinite(value);
    const inviteOk = item => validId(item?.from) && validId(item?.to) && number(item?.at) && number(item?.expiresAt);
    const messageOk = item => number(item?.id) && validId(item?.authorId) && typeof item?.text === 'string' && number(item?.at);
    const sessionOk = item => number(item?.id) && validId(item?.a) && validId(item?.b) && number(item?.startedAt) && Array.isArray(item?.messages)
      && item.messages.length <= SEAT_CHAT_RULES.messages && item.messages.every(messageOk);
    if (!Array.isArray(saved.invites) || !saved.invites.every(inviteOk) || !Array.isArray(saved.sessions) || !saved.sessions.every(sessionOk)
      || !Array.isArray(saved.retries) || !number(saved.nextSession) || !number(saved.nextMessage)) return;
    invites = saved.invites.map(item => ({ ...item })); sessions = saved.sessions.map(item => ({ ...item, messages: item.messages.map(entry => ({ ...entry })) }));
    retries = new Map(saved.retries.filter(entry => Array.isArray(entry) && typeof entry[0] === 'string' && number(entry[1])));
    nextSession = saved.nextSession; nextMessage = saved.nextMessage;
  }

  const clear = () => restore(null);
  const live = () => invites.length + sessions.length + retries.size + asked.size > 0;
  // The lines an account could already read, for a report it files about the other person.
  const linesFor = userId => (sessionOf(userId)?.messages ?? []).map(entry => ({ ...entry }));
  return { command, reconcile, viewFor, views, separate, forget, checkpoint, restore, clear, live, linesFor };
}
