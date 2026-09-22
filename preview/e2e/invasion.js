async page => {
  const checks = [], errors = [];
  const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/v1/decisions', route => route.fulfill({ status: 503, json: {} }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.charactersReady === '24' && document.querySelector('#canvas-host').dataset.playerReady === 'true');
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
  const read = () => page.locator('.invasion-controls').evaluate(el => JSON.parse(el.dataset.state));
  // A non-magical form cannot begin the scenario.
  await page.locator('#player-form').selectOption('lion');
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerForm === 'lion' && document.querySelector('#canvas-host').dataset.playerReady === 'true');
  check(await page.locator('#invasion-toggle').isDisabled(), 'The Lion cannot begin the invasion');
  check((await page.locator('#invasion-status').textContent()).includes('Wicked Witch or Jevica'), 'The card explains who can cast');
  await page.locator('#player-form').selectOption('jevica');
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerForm === 'jevica' && document.querySelector('#canvas-host').dataset.playerReady === 'true');
  check(!await page.locator('#invasion-toggle').isDisabled(), 'Jevica can begin');
  await page.locator('#invasion-toggle').click();
  check((await read()).phase === 'active' && (await read()).remaining === 5, 'Five saucers arrive');
  await page.waitForFunction(() => JSON.parse(document.querySelector('.invasion-controls').dataset.state).landed >= 1, null, { timeout: 15000 });
  check((await read()).crew.length === 5, 'Every crew member has a saucer');
  await page.waitForFunction(() => JSON.parse(document.querySelector('.invasion-controls').dataset.state).crew.every(member => member.ready), null, { timeout: 30000 });
  check(new Set((await read()).crew.map(member => member.species)).size >= 2, 'The crew are of more than one species');
  await page.screenshot({ path: 'output/playwright/invasion-landing.png' });
  // Chase: turn toward the nearest alien, run at it, cast when in range.
  await page.locator('#canvas-host').focus();
  const started = Date.now(); let banished = 0, phase = 'active';
  const hud = () => page.locator('#walking-hud').evaluate(el => ({ position: JSON.parse(el.dataset.position), yaw: Number(el.dataset.yaw) }));
  while (Date.now() - started < 120000) {
    const state = await read(); banished = state.banished; phase = state.phase;
    if (banished >= 1 || phase !== 'active') break;
    const nearest = state.nearest; if (!nearest) { await page.waitForTimeout(300); continue; }
    const { position, yaw } = await hud();
    const alien = state.aliens.find(item => item.id === nearest.id);
    const desired = Math.atan2(position[0] - alien.position[0], position[2] + alien.position[1]);
    const turn = Math.atan2(Math.sin(desired - yaw), Math.cos(desired - yaw));
    if (Math.abs(turn) > 0.12) { const key = turn > 0 ? 'ArrowLeft' : 'ArrowRight'; await page.keyboard.down(key); await page.waitForTimeout(Math.min(900, Math.abs(turn) / 1.6 * 1000)); await page.keyboard.up(key); }
    if (nearest.distance > 9) { await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft'); }
    await page.keyboard.press('KeyQ'); await page.waitForTimeout(150);
  }
  check(banished >= 1, `A spell banished an alien within 120 s (banished ${banished}, phase ${phase})`);
  await page.screenshot({ path: 'output/playwright/invasion-cast.png' });
  check((await page.locator('#invasion-status').textContent()).length > 0, 'Status narrates the fight');
  if ((await read()).phase === 'active') await page.locator('#invasion-toggle').click();
  const after = await read();
  check(after.phase !== 'active' && after.abducted === 0, `The scenario ends and everyone returns (phase ${after.phase}, abducted ${after.abducted})`);
  check(await page.locator('#invasion-toggle').textContent() === 'Begin invasion', 'The card offers another round');
  check(errors.length === 0, `No page errors: ${errors.join('; ')}`);
  return { checks, banished, errors };
}
