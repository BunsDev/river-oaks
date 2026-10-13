// An in-memory stand-in for server/livekit-client.js. Tokens are plain strings
// that name their room and identity so tests can read what was minted; a
// toggle makes every call fail the way the real client does.
export function createFakeLiveKit({ now = Date.now, url = 'wss://fixture.livekit.cloud' } = {}) {
  const rooms = new Map(), calls = [];
  let failing = false;
  const guard = (name, ...args) => {
    calls.push([name, ...args]);
    if (failing) throw new Error('livekit_unavailable');
  };
  return {
    url, calls, rooms,
    fail(value = true) { failing = value; },
    async token({ room, identity, ttlSeconds }) { guard('token', room, identity); return `fake.${room}.${identity}.${ttlSeconds}`; },
    async listParticipants(room) {
      guard('listParticipants', room);
      return [...(rooms.get(room) ?? new Map())].map(([identity, joinedAt]) => ({ identity, joinedAt }));
    },
    async removeParticipant(room, identity) { guard('removeParticipant', room, identity); rooms.get(room)?.delete(identity); },
    async listRooms() { guard('listRooms'); return [...rooms].map(([name, members]) => ({ name, numParticipants: members.size })); },
    async deleteRoom(room) { guard('deleteRoom', room); rooms.delete(room); },
    simulateJoin(room, identity) { if (!rooms.has(room)) rooms.set(room, new Map()); rooms.get(room).set(identity, now()); },
    simulateLeave(room, identity) { rooms.get(room)?.delete(identity); },
    called: name => calls.filter(([called]) => called === name),
  };
}
