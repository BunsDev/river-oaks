import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameAssetMiddleware, protectedGameAsset } from '../../middleware.js';

test('game assets require an approved cookie while the sign-in bundle stays public', async () => {
  const checked = [], forwarded = [];
  const gate = createGameAssetMiddleware({
    fetcher: async (url, options) => {
      checked.push({ path: url.pathname, cookie: options.headers.cookie });
      return Response.json({ status: options.headers.cookie === 'session=approved' ? 'approved' : 'pending' });
    },
    forward: options => { forwarded.push(options); return new Response('asset'); },
  });
  assert.equal(protectedGameAsset('/assets/index-abc.js'), false);
  assert.equal(protectedGameAsset('/assets/preload-helper-abc.js'), false);
  assert.equal(protectedGameAsset('/assets/main-abc.js'), true);
  assert.equal(protectedGameAsset('/assets/walking-abc.js'), true);
  assert.equal(protectedGameAsset('/assets/three-abc.js'), true);
  assert.equal(protectedGameAsset('/assets/debug-tools-abc.css'), true);
  assert.equal(protectedGameAsset('/data/district.json'), true);
  const request = (path, cookie) => new Request(`https://sim.jev.works${path}`, { headers: cookie ? { cookie } : {} });
  assert.equal((await gate(request('/assets/index-abc.js'))).status, 200);
  assert.equal((await gate(request('/assets/main-abc.js'))).status, 403);
  assert.equal((await gate(request('/assets/walking-abc.js'))).status, 403);
  assert.equal((await gate(request('/assets/main-abc.js', 'session=pending'))).status, 403);
  assert.equal((await gate(request('/data/district.json', 'session=approved'))).status, 200);
  assert.deepEqual(checked, [
    { path: '/api/waitlist/status', cookie: 'session=pending' },
    { path: '/api/waitlist/status', cookie: 'session=approved' },
  ]);
  assert.equal(forwarded[1].headers['Cache-Control'], 'private, no-store');
});
