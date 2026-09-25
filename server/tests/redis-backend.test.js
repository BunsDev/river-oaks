import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createRedisBackend } from '../redis-backend.js';

test('shared backend requires an isolated namespace outside production and validates origin', async () => {
  await assert.rejects(createRedisBackend({ PUBLIC_ORIGIN: 'https://sim.jev.works/path', REDIS_URL: 'redis://localhost' }), /origin/);
  await assert.rejects(createRedisBackend({ PUBLIC_ORIGIN: 'https://sim.jev.works', REDIS_URL: 'redis://localhost' }), /namespace/);
  await assert.rejects(createRedisBackend({ PUBLIC_ORIGIN: 'https://sim.jev.works', REDIS_URL: 'redis://localhost', VERCEL_ENV: 'preview', REDIS_NAMESPACE: 'river-oaks:production:v1' }), /Preview/);
});

test('real backend fails closed without WorkOS and never exposes Redis configuration', { skip: !process.env.REDIS_URL, timeout: 10_000 }, async t => {
  const namespace = 'river-oaks:test:' + randomUUID();
  const app = await createRedisBackend({ REDIS_URL: process.env.REDIS_URL, PUBLIC_ORIGIN: 'https://sim.jev.works', REDIS_NAMESPACE: namespace });
  t.after(async () => {
    await app.close();
    const redis = new Redis(process.env.REDIS_URL); redis.on('error', () => {});
    const keys = await redis.keys(`{${namespace}}:*`);
    if (keys.length) await redis.del(...keys);
    await redis.quit();
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const session = await fetch(base + '/auth/session');
  assert.equal(session.status, 503);
  assert.deepEqual(await session.json(), { error: 'auth_unavailable' });
  const ticket = await fetch(base + '/api/multiplayer/ticket', { method: 'POST' });
  assert.equal(ticket.status, 401);
  assert.equal((await fetch(base + '/.env')).status, 404);
});
