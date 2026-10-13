import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveKitClient, livekitConfigured } from '../livekit-client.js';

function fakeSdk({ fail = false, hang = false } = {}) {
  const calls = [];
  return { calls, module: {
    TrackSource: { MICROPHONE: 2 },
    AccessToken: class { constructor(key, secret, options) { Object.assign(this, { key, secret, options }); } addGrant(grant) { this.grant = grant; } async toJwt() { if (fail) throw new Error(`bad secret ${this.secret}`); return JSON.stringify({ identity: this.options.identity, ttl: this.options.ttl, grant: this.grant }); } },
    RoomServiceClient: class {
      constructor(host, key, secret) { calls.push(['new', host]); this.secret = secret; }
      async listParticipants(room) { calls.push(['listParticipants', room]); if (hang) return new Promise(() => {}); if (fail) throw new Error(`401 at ${room} with ${this.secret}`); return [{ identity: 'p1', joinedAt: 12n, extra: 'ignored' }]; }
      async removeParticipant(room, identity) { calls.push(['removeParticipant', room, identity]); if (fail) throw new Error('boom'); }
      async listRooms() { calls.push(['listRooms']); return [{ name: 'a.b.c', numParticipants: 2, sid: 'x' }]; }
      async deleteRoom(room) { calls.push(['deleteRoom', room]); }
    },
  } };
}

test('voice is configured only with every LiveKit setting and a wss URL', () => {
  assert.equal(livekitConfigured({ LIVEKIT_URL: 'wss://x.livekit.cloud', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's' }), true);
  assert.equal(livekitConfigured({ LIVEKIT_URL: 'https://x.livekit.cloud', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's' }), false);
  assert.equal(livekitConfigured({ LIVEKIT_URL: 'wss://x.livekit.cloud/path', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's' }), false);
  assert.equal(livekitConfigured({ LIVEKIT_URL: 'wss://x.livekit.cloud', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: 's' }), false);
  assert.equal(livekitConfigured({}), false);
  assert.throws(() => createLiveKitClient({ url: 'https://x', apiKey: 'k', apiSecret: 's' }));
});

test('tokens carry microphone-only grants for one room and the SDK loads lazily', async () => {
  const sdk = fakeSdk();
  let loads = 0;
  const client = createLiveKitClient({ url: 'wss://x.livekit.cloud', apiKey: 'k', apiSecret: 's', load: async () => { loads++; return sdk.module; } });
  assert.equal(loads, 0);
  const token = JSON.parse(await client.token({ room: 'a.b.c', identity: 'p1', ttlSeconds: 60 }));
  assert.deepEqual(token, { identity: 'p1', ttl: 60, grant: { roomJoin: true, room: 'a.b.c', canPublish: true, canSubscribe: true, canPublishData: false, canUpdateOwnMetadata: false, canPublishSources: [2] } });
  await client.token({ room: 'a.b.c', identity: 'p2', ttlSeconds: 60 });
  assert.equal(loads, 1);
  assert.equal(client.url, 'wss://x.livekit.cloud');
});

test('admin calls reach the https host and return only the fields the service needs', async () => {
  const sdk = fakeSdk();
  const client = createLiveKitClient({ url: 'wss://x.livekit.cloud', apiKey: 'k', apiSecret: 's', load: async () => sdk.module });
  assert.deepEqual(await client.listParticipants('a.b.c'), [{ identity: 'p1', joinedAt: 12 }]);
  assert.deepEqual(await client.listRooms(), [{ name: 'a.b.c', numParticipants: 2 }]);
  await client.removeParticipant('a.b.c', 'p1');
  await client.deleteRoom('a.b.c');
  assert.deepEqual(sdk.calls.filter(([name]) => name === 'new').map(([, host]) => host), ['https://x.livekit.cloud', 'https://x.livekit.cloud', 'https://x.livekit.cloud', 'https://x.livekit.cloud']);
  assert.deepEqual(sdk.calls.filter(([name]) => name !== 'new'), [['listParticipants', 'a.b.c'], ['listRooms'], ['removeParticipant', 'a.b.c', 'p1'], ['deleteRoom', 'a.b.c']]);
});

test('provider failures and timeouts become one fixed error that names no host or secret', async () => {
  const failing = createLiveKitClient({ url: 'wss://x.livekit.cloud', apiKey: 'k', apiSecret: 'top-secret', load: async () => fakeSdk({ fail: true }).module });
  for (const call of [() => failing.token({ room: 'r', identity: 'i', ttlSeconds: 60 }), () => failing.listParticipants('r'), () => failing.removeParticipant('r', 'i')]) {
    await assert.rejects(call, error => error.message === 'livekit_unavailable' && !/top-secret|livekit\.cloud/.test(String(error)));
  }
  const hanging = createLiveKitClient({ url: 'wss://x.livekit.cloud', apiKey: 'k', apiSecret: 's', timeoutMs: 20, load: async () => fakeSdk({ hang: true }).module });
  await assert.rejects(() => hanging.listParticipants('r'), { message: 'livekit_unavailable' });
  const broken = createLiveKitClient({ url: 'wss://x.livekit.cloud', apiKey: 'k', apiSecret: 's', load: async () => { throw new Error('module missing'); } });
  await assert.rejects(() => broken.token({ room: 'r', identity: 'i', ttlSeconds: 60 }), { message: 'livekit_unavailable' });
});
