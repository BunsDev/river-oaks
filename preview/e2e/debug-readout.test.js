import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

test('debug cursor treats room names as text and preserves the ordinary readout', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)),
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.route('**/security-fixture', route => route.fulfill({ contentType: 'text/html',
      body: '<!doctype html><div id="host" style="width:400px;height:400px"></div>' }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/security-fixture`);
    const threePath = `/@fs${fileURLToPath(new URL('../../node_modules/three/build/three.module.js', import.meta.url))}`;
    await page.evaluate(async threePath => {
      const THREE = await import(threePath);
      const { createDebugTools } = await import('/src/debug-tools.js');
      const camera = new THREE.PerspectiveCamera(60, 1, .1, 100);
      camera.position.set(0, 10, 0); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      const world = { stores: [{ id: 'room', name: 'Garden gallery' }] };
      const host = document.querySelector('#host');
      const environment = { groundAt: () => 0, isFree: () => true, roomAt: () => ({ storeId: 'room' }) };
      const tools = createDebugTools({ scene: new THREE.Scene(), camera, host, getWorld: () => world,
        getEnvironment: () => environment });
      tools.update(0); tools.toggle(true);
      let timestamp = 100;
      window.paintRoom = (name, free = true) => {
        world.stores[0].name = name; environment.isFree = () => free;
        const rect = host.getBoundingClientRect();
        const event = new PointerEvent('pointermove', { clientX: rect.left + 200, clientY: rect.top + 200 });
        Object.defineProperty(event, 'timeStamp', { value: timestamp += 100 });
        host.dispatchEvent(event);
      };
    }, threePath);
    const readout = page.locator('[data-debug-cursor]');
    await page.evaluate(() => window.paintRoom('Garden gallery'));
    assert.deepEqual(await readout.locator('dt').allTextContents(), ['Cursor', 'Ground', 'Walk']);
    assert.match(await readout.locator('dd').nth(0).textContent(), /^E 0\.00 · N -?0\.00$/);
    assert.equal(await readout.locator('dd').nth(1).textContent(), '0.00 m (terrain 0.00, +0.00)');
    assert.equal(await readout.locator('dd.is-free').textContent(), 'free · inside Garden gallery');
    const payload = '<img src=x onerror="window.__roomXss=1">';
    await page.evaluate(name => window.paintRoom(name, false), payload);
    assert.equal(await readout.locator('dd.is-blocked').textContent(), `blocked · inside ${payload}`);
    assert.equal(await readout.locator('img').count(), 0);
    assert.equal(await page.evaluate(() => window.__roomXss), undefined);
  } finally {
    await browser?.close();
    await server.close();
  }
});
