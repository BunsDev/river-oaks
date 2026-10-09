import test from 'node:test';
import assert from 'node:assert/strict';
import { config, createGameAssetMiddleware, protectedGameAsset } from '../../middleware.js';

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
  // The problem-report collector and dialog load on the sign-in page; lookalikes do not.
  for (const path of ['/assets/debug-report-D4CCBOl3.js', '/assets/debug-report-ui-QfBMpgMe.js', '/assets/debug-report-ui-CtO71uXq.css']) assert.equal(protectedGameAsset(path), false, path);
  for (const path of ['/assets/debug-reports-abc.js', '/assets/my-debug-report-abc.js', '/assets/debug-report-abc/../main-abc.js']) assert.equal(protectedGameAsset(path), true, path);
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

// Production served /%64ata/district.json, /data%2Fdistrict.json, /data\\district.json
// and /assets/main-abc%2Ejs to anonymous visitors: the CDN decodes them to the
// gated file, so the gate must classify the decoded path, not the spelling.
test('encoded, backslashed and dotted spellings of a gated file stay gated', async () => {
  for (const path of [
    '/%64ata/district.json', '/d%61ta/district.json', '/data%2Fdistrict.json', '/data%2fdistrict.json',
    '/data\\district.json', '/data%5Cdistrict.json', '/data/district%2Ejson', '//data/district.json',
    '/data//district.json', '/data/./district.json', '/x/%2e%2e/data/district.json', '/DATA/district.json',
    '/assets/main-abc%2Ejs', '/assets/main-abc%2ejs', '/%61ssets/main-abc.js', '/assets%2Fmain-abc.js',
    '/assets/main-abc.JS', '/assets/index-x%2F..%2Fmain-abc.js', '/assets/index-..%2Fmain-abc.js',
  ]) assert.equal(protectedGameAsset(path), true, path);
  // A spelling that cannot be decoded, or that still holds an escape after one
  // decode, fails closed.
  for (const path of ['/%E0%A4%A/data.json', '/%2564ata/district.json', '/data/district.json%00'])
    assert.equal(protectedGameAsset(path), true, path);
  for (const path of ['/', '/index.html', '/assets/index-abc.js', '/%61ssets/index-abc.js', '/assets/preload-helper-abc.js',
    '/assets/characters/jevica%20v2.glb', '/assets/characters/jevica.glb', '/data'])
    assert.equal(protectedGameAsset(path), false, path);

  const gate = createGameAssetMiddleware({
    fetcher: async () => Response.json({ status: 'pending' }),
    forward: () => new Response('asset'),
  });
  for (const path of ['/%64ata/district.json', '/data%2Fdistrict.json', '/assets/main-abc%2Ejs'])
    assert.equal((await gate(new Request(`https://sim.jev.works${path}`))).status, 403, path);
});

test('the middleware runs on every static path, not only the plain /assets and /data spellings', () => {
  const matchers = config.matcher.map(pattern => new RegExp(`^${pattern}$`));
  const runs = path => matchers.some(matcher => matcher.test(path));
  for (const path of ['/%64ata/district.json', '/data%2Fdistrict.json', '/data\\district.json', '/%61ssets/main.js', '/assets/main.js', '/data/district.json', '/'])
    assert.equal(runs(path), true, path);
  for (const path of ['/api/waitlist/status', '/auth/login', '/multiplayer'])
    assert.equal(runs(path), false, path);
});
