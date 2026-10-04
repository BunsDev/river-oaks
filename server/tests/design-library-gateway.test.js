import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisSecurity } from '../redis-security.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';
import { approvedWaitlist } from './waitlist-fixture.js';

test('Jevica saves and copies designs across published worlds without granting guests building rights',
  { skip: !process.env.REDIS_URL, timeout: 60_000 }, async t => {
    const redis = new Redis(process.env.REDIS_URL); redis.on('error', () => {});
    const namespace = `river-oaks:design-gateway-test:${randomUUID()}`, prefix = `{${namespace}}`, origin = 'https://sim.jev.works';
    const worldData = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
    const region = JSON.parse(await readFile(new URL('../../preview/public/data/sample-region.json', import.meta.url)));
    const admin = JEVICA_ADMIN_USER_IDS[0], users = { admin, guest: 'design-guest' };
    const auth = { handle: async () => false, authenticate: async req => {
      const userId = users[req.headers.cookie?.match(/test_session=(\w+)/)?.[1]];
      return userId ? { userId, name: userId, sessionId: `${userId}-session`, csrfToken: 'test-csrf', expiresAt: Date.now() + 60_000 } : null;
    }, isSessionActive: async () => true, close() {} };
    const security = createRedisSecurity({ redis, prefix });
    const makeGateway = () => createWorldGateway({ redis, namespace, worldData, auth, security,
      waitlist: approvedWaitlist, origin, moderators: [admin] });
    let gateway = makeGateway(), sockets = [], base;
    const listen = async () => {
      await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
      base = `http://127.0.0.1:${gateway.server.address().port}`;
    };
    t.after(async () => {
      for (const socket of sockets) socket.terminate();
      await gateway.close(); security.close();
      const keys = await redis.keys(`*${namespace}*`); if (keys.length) await redis.del(...keys);
      await redis.quit();
    });
    const post = (user, path, body) => fetch(base + path, { method: 'POST',
      headers: { Origin: origin, Cookie: `test_session=${user}`, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' },
      body: JSON.stringify(body) });
    const open = async (worldId, user = 'admin') => {
      const response = await post(user, `/api/multiplayer/ticket?world=${worldId}`, {});
      assert.equal(response.status, 200);
      const { ticket } = await response.json();
      const socket = new WebSocket(`${base.replace('http:', 'ws:')}/multiplayer?world=${worldId}&protocol=1&ticket=${ticket}`,
        { headers: { Origin: origin, Cookie: `test_session=${user}` } });
      sockets.push(socket);
      await new Promise((resolve, reject) => {
        socket.once('error', reject);
        socket.on('message', raw => { if (JSON.parse(raw).type === 'snapshot') resolve(); });
      });
      return socket;
    };
    let requestNumber = 0;
    const command = (socket, body) => new Promise((resolve, reject) => {
      const requestId = `design-${++requestNumber}`;
      const receive = raw => {
        const result = JSON.parse(raw);
        if (result.type === 'result' && result.requestId === requestId) { socket.off('message', receive); resolve(result); }
      };
      socket.on('message', receive); socket.once('error', reject);
      socket.send(JSON.stringify({ requestId, ...body }));
    });
    await listen();
    const published = await post('admin', '/api/worlds', { id: 'moon-garden', title: 'Moon Garden', description: 'A garden', region });
    assert.equal(published.status, 201);
    assert.equal((await post('admin', '/api/worlds', { id: 'star-garden', title: 'Star Garden', description: 'Another garden', region })).status, 201);
    const moon = await open('moon-garden');
    const placed = await command(moon, { type: 'build', action: 'place', kind: 'seat', finish: 'rose', position: [0, -18], yaw: 0 });
    assert.equal(placed.ok, true);
    const saved = await command(moon, { type: 'inventory', action: 'save', buildId: placed.item.id });
    assert.equal(saved.ok, true);
    assert.equal(saved.library, true);
    assert.equal(saved.item.scope, 'account');
    const river = await open('river-oaks');
    const across = await command(river, { type: 'inventory', action: 'list' });
    assert.deepEqual(across.items.map(item => item.id), [saved.item.id]);
    const star = await open('star-garden');
    assert.deepEqual((await command(star, { type: 'inventory', action: 'list' })).items.map(item => item.id), [saved.item.id]);
    const placedElsewhere = await command(star, { type: 'build', action: 'place', templateId: saved.item.id, position: [0, -18], yaw: 0 });
    assert.equal(placedElsewhere.ok, true);
    assert.equal(placedElsewhere.item.kind, 'seat');
    assert.equal(placedElsewhere.item.finish, 'rose');
    assert.equal((await command(river, { type: 'build', action: 'place', templateId: saved.item.id, position: [999, 999], yaw: 0 })).error,
      'build_out_of_reach', 'the global template reaches ordinary server placement checks');
    const guest = await open('moon-garden', 'guest');
    assert.equal((await command(guest, { type: 'inventory', action: 'list' })).error, 'admin_only');
    assert.equal((await command(guest, { type: 'build', action: 'place', templateId: saved.item.id, position: [0, -18], yaw: 0 })).error, 'admin_only');
    const moonRoom = (await gateway.worldFor('moon-garden')).room;
    const connectionId = (await moonRoom.read()).connections.find(item => item.userId === admin).connectionId;
    const legacy = await moonRoom.request({ type: 'command', userId: admin, connectionId,
      message: { type: 'inventory', action: 'save', buildId: placed.item.id } });
    assert.equal(legacy.ok, true);
    const beforeCopy = await command(moon, { type: 'inventory', action: 'list' });
    assert.equal(beforeCopy.items.find(item => item.id === legacy.item.id)?.scope, 'world');
    const copied = await command(moon, { type: 'inventory', action: 'copy', id: legacy.item.id });
    assert.equal(copied.ok, true);
    assert.equal(copied.items.some(item => item.id === legacy.item.id), false);
    assert.equal((await command(river, { type: 'inventory', action: 'list' })).items.some(item => item.id === copied.item.id), true);
    assert.equal((await command(moon, { type: 'inventory', action: 'remove', id: copied.item.id })).items.some(item => item.id === legacy.item.id), true);
    for (const socket of sockets) socket.terminate();
    await gateway.close();
    gateway = makeGateway(); await listen();
    const rejoined = await open('moon-garden');
    assert.equal((await command(rejoined, { type: 'inventory', action: 'list' })).items.some(item => item.id === saved.item.id), true);
  });
