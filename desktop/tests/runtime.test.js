import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAsset, navigationAllowed, windowBounds } from '../runtime.js';

test('bundled assets resolve only inside the game, including encoded paths and symlinks', async t => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'river-oaks-assets-')));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = join(temp, 'game');
  await mkdir(root);
  await writeFile(join(root, 'index.html'), 'game');
  await writeFile(join(temp, 'private.txt'), 'private');
  await symlink(join(temp, 'private.txt'), join(root, 'escape.txt'));
  assert.equal(await resolveAsset(root, 'app://game/'), join(root, 'index.html'));
  assert.equal(await resolveAsset(root, 'app://game/index.html?v=1'), join(root, 'index.html'));
  for (const url of ['app://other/index.html', 'https://game/index.html', 'app://game/%2e%2e%2fprivate.txt', 'app://game/escape.txt', 'app://game/missing.js', 'app://game/%00', 'app://game/%ZZ']) {
    assert.equal(await resolveAsset(root, url), null, url);
  }
});

test('navigation stays inside the exact game origin', () => {
  assert.equal(navigationAllowed('app://game/#visit', 'app://game/'), true);
  assert.equal(navigationAllowed('app://other/', 'app://game/'), false);
  assert.equal(navigationAllowed('http://127.0.0.1:5174/path', 'http://127.0.0.1:5174/'), true);
  for (const url of ['http://127.0.0.1:5175/', 'https://evil.test/', 'javascript:alert(1)', 'file:///etc/passwd', 'bad']) {
    assert.equal(navigationAllowed(url, 'http://127.0.0.1:5174/'), false);
  }
});

test('window restoration fits current displays and discards corrupt or disconnected bounds', () => {
  const displays = [{ x: 0, y: 0, width: 1440, height: 900 }];
  assert.deepEqual(windowBounds({ x: 20, y: 30, width: 1200, height: 800 }, displays), { x: 20, y: 30, width: 1200, height: 800 });
  assert.deepEqual(windowBounds({ x: 2000, y: 30, width: 1200, height: 800 }, displays), { width: 1280, height: 800 });
  assert.deepEqual(windowBounds({ x: null, y: 0, width: -1, height: 'bad' }, displays), { width: 1280, height: 800 });
  assert.deepEqual(windowBounds({}, [{ x: 0, y: 0, width: 1024, height: 768 }]), { width: 1024, height: 768 });
});
