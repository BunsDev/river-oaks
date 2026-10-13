// The only module that loads livekit-server-sdk. It mints room-scoped,
// microphone-only tokens and makes the few admin calls the voice controller
// needs. Every provider failure becomes one fixed error: the SDK's own messages
// can carry the host, the key or a response body, and none of that may reach a
// log or a client.
const URL_PATTERN = /^wss:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?\/?$/;

export function livekitConfigured(env = {}) {
  return Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET) && URL_PATTERN.test(env.LIVEKIT_URL);
}

export function createLiveKitClient({ url, apiKey, apiSecret, timeoutMs = 2500, load = () => import('livekit-server-sdk') } = {}) {
  if (!URL_PATTERN.test(url ?? '') || typeof apiKey !== 'string' || !apiKey || typeof apiSecret !== 'string' || !apiSecret) throw new Error('Invalid LiveKit configuration');
  const host = url.replace(/^wss:/, 'https:').replace(/\/$/, '');
  const unavailable = () => new Error('livekit_unavailable');
  let sdk = null;
  const module = async () => {
    try { return sdk ??= await load(); } catch { throw unavailable(); }
  };
  const bounded = promise => {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(unavailable()), timeoutMs); timer.unref?.(); })])
      .finally(() => clearTimeout(timer));
  };
  async function admin(call) {
    const { RoomServiceClient } = await module();
    try { return await bounded(call(new RoomServiceClient(host, apiKey, apiSecret))); } catch { throw unavailable(); }
  }
  return {
    url,
    async token({ room, identity, ttlSeconds }) {
      const { AccessToken, TrackSource } = await module();
      try {
        const token = new AccessToken(apiKey, apiSecret, { identity, ttl: ttlSeconds });
        token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: false, canUpdateOwnMetadata: false, canPublishSources: [TrackSource.MICROPHONE] });
        return await token.toJwt();
      } catch { throw unavailable(); }
    },
    listParticipants: room => admin(async client => (await client.listParticipants(room)).map(participant => ({ identity: String(participant.identity), joinedAt: Number(participant.joinedAt) }))),
    removeParticipant: (room, identity) => admin(async client => { await client.removeParticipant(room, identity); }),
    listRooms: () => admin(async client => (await client.listRooms()).map(room => ({ name: String(room.name), numParticipants: Number(room.numParticipants) }))),
    deleteRoom: room => admin(async client => { await client.deleteRoom(room); }),
  };
}
