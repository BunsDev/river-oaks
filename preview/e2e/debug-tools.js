async page => {
  const checks = [], errors = [];
  const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/v1/decisions', route => route.fulfill({ status: 503, json: {} }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(() => { try { localStorage.removeItem('river-oaks-debug'); } catch {} });
  await page.reload();
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && document.querySelector('#canvas-host').dataset.charactersReady === '24');
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
  check(await page.evaluate(() => window.__riverDebug() === null), 'Debug tools are not loaded until asked for');

  await page.locator('#canvas-host canvas').click({ position: { x: 40, y: 900 } });
  await page.keyboard.press('F3');
  await page.locator('.debug-panel').waitFor({ state: 'visible' });
  check(true, 'F3 opens the debug panel');
  const debug = fn => page.evaluate(fn);
  for (const id of ['colliders', 'walkable', 'ground', 'source', 'rooms', 'flight', 'skeletons']) await page.locator(`[data-debug-layer="${id}"]`).check();
  await page.waitForFunction(() => window.__riverDebug().counts.skeletons !== undefined);
  const counts = await debug(() => window.__riverDebug().counts);
  check(counts.colliders === 9, `All mapped collision polygons are drawn (${counts.colliders})`);
  check(counts.free > 500 && counts.blocked > 50, `The walkable grid samples free and blocked ground (${counts.free} free, ${counts.blocked} blocked)`);
  check(counts.groundTriangles > 50, `Registered ground triangles around the visitor are drawn (${counts.groundTriangles})`);
  check(counts.rooms === 30 && counts.roads === 39, `Store rooms and mapped roads are drawn (${counts.rooms} rooms, ${counts.roads} roads)`);
  check(counts.skeletons >= 1, `Nearby skeletons are drawn (${counts.skeletons})`);
  await page.waitForTimeout(600);
  check((await page.locator('[data-debug-stats]').textContent()).includes('colliders'), 'The stats line reports overlay counts');
  await page.screenshot({ path: 'output/playwright/debug-overlays.png' });

  const box = await page.locator('#canvas-host canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
  await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height * 0.8 + 2);
  await page.waitForFunction(() => window.__riverDebug().cursor);
  const cursor = await debug(() => window.__riverDebug().cursor);
  check(Number.isFinite(cursor.ground) && typeof cursor.free === 'boolean', `The cursor reads ground height and walkability (${cursor.ground.toFixed(2)} m, ${cursor.free ? 'free' : 'blocked'})`);
  check((await page.locator('[data-debug-cursor]').textContent()).includes('Ground'), 'The cursor readout is shown in the panel');

  await page.locator('[data-debug-layer="inspector"]').check();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.8);
  await page.waitForFunction(() => window.__riverDebug().selection);
  const selection = await debug(() => window.__riverDebug().selection);
  check(selection.triangles > 0 && selection.vertices > 0, `Clicking inspects the mesh under the cursor (${selection.path}: ${selection.triangles} tris)`);
  check(await page.locator('#community-dialogue').isHidden(), 'Inspecting does not start a conversation');
  check((await page.locator('[data-debug-selection]').textContent()).includes('Polygons'), 'The selection panel lists polygon counts');
  const depth = () => debug(() => { const top = [], normal = []; window.__riverDebug().root.traverse(o => [o.material].flat().forEach(m => { if (m) (m.userData.alwaysOnTop ? top : normal).push(m.depthTest); })); return { top, normal }; });
  await page.locator('[data-debug-layer="xray"]').check();
  const xrayOn = await depth();
  await page.locator('[data-debug-layer="xray"]').uncheck();
  const xrayOff = await depth();
  check(xrayOn.top.length >= 3 && [...xrayOn.top, ...xrayOff.top].every(value => value === false), 'Cursor, selection and bones stay on top through an X-ray toggle');
  check(xrayOn.normal.every(value => value === false) && xrayOff.normal.every(value => value === true), 'X-ray switches only the depth-tested overlays');
  await page.locator('[data-debug-heavy] summary').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-debug-heavy] li').length >= 5);
  check(true, 'The heaviest meshes are listed');
  await page.screenshot({ path: 'output/playwright/debug-inspector.png' });

  await page.locator('[data-debug-layer="wireframe"]').check();
  check(await debug(() => { let on = 0, total = 0; window.__riverDebug().root.parent.traverse(o => { if (o.isMesh && o.material && !Array.isArray(o.material)) { total++; if (o.material.wireframe) on++; } }); return on / total > 0.9; }), 'Wireframe shows the whole scene as polygons');
  await page.screenshot({ path: 'output/playwright/debug-wireframe.png' });
  await page.locator('[data-debug-layer="wireframe"]').uncheck();
  check(await debug(() => { let on = 0; window.__riverDebug().root.parent.traverse(o => { if (o.isMesh && o.material?.wireframe && !o.name.startsWith('Selection')) on++; }); return on === 0; }), 'Turning wireframe off restores every material');

  await page.locator('[data-debug-layer="inspector"]').uncheck();
  await page.keyboard.press('F3');
  check(await page.locator('.debug-panel').isHidden() && await debug(() => !window.__riverDebug().root.visible), 'F3 closes the panel and hides the overlays');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('river-oaks:debug', { detail: { open: true } })));
  check(await page.locator('.debug-panel').isVisible(), 'The desktop menu event opens the panel');
  check(errors.length === 0, `No page errors: ${errors.join(' | ')}`);
  return { checks, counts, cursor, selection };
}
