import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../app.js';
import { createDistributedServer } from '../distributed-app.js';

for (const distributed of [false, true]) {
  const backend = distributed ? 'distributed' : 'standalone';
  test(`${backend} world data requires current approval and denies banned viewers`, async t => {
    let status = 'pending', banned = false, reads = 0;
    const auth = {
      handle: async () => false,
      authenticate: async req => req.headers.cookie === 'session=viewer'
        ? { userId: 'viewer', sessionId: 'session', expiresAt: Date.now() + 60_000 } : null,
    };
    const waitlist = { isApproved: async () => status === 'approved' };
    const worldCatalog = {
      get: async id => { reads++; return { id, template: 'region-v1', regionSha256: 'a'.repeat(64) }; },
      getRegion: async () => ({ title: 'Creator region', terrain: { heights_m: [1, 2, 3] } }),
    };
    const options = { auth, waitlist, worldCatalog, origin: 'https://town.example' };
    const app = distributed
      ? createDistributedServer({ ...options, room: { worldId: 'river-oaks' }, security: { allow: async () => true, isBanned: async () => banned } })
      : createGameServer({ ...options, world: { worldId: 'river-oaks' }, moderation: { isBanned: () => banned } });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    t.after(() => app.close());
    const url = `http://127.0.0.1:${app.server.address().port}/api/world-data?world=creator-region`;
    const get = (authenticated = true) => fetch(url, { headers: authenticated ? { Cookie: 'session=viewer' } : {} });
    assert.equal((await get(false)).status, 401, 'anonymous');
    assert.equal((await get()).status, 403, 'pending');
    status = 'rejected';
    assert.equal((await get()).status, 403, 'rejected');
    assert.equal(reads, 0, 'denied requests must not read the catalog');
    status = 'approved';
    const allowed = await get();
    assert.equal(allowed.status, 200, 'approved GET works without Origin or CSRF');
    assert.deepEqual((await allowed.json()).world.terrain.heights_m, [1, 2, 3]);
    assert.equal(allowed.headers.get('cache-control'), 'no-store');
    status = 'rejected';
    assert.equal((await get()).status, 403, 'revoked after successful read');
    status = 'approved'; banned = true;
    assert.equal((await get()).status, 403, 'approved but banned');
    assert.equal(reads, 1, 'revoked and banned requests must not read the catalog');
  });
}
