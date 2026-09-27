async page => {
  const checks = [], errors = [];
  const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/v1/decisions', route => route.fulfill({ status: 503, json: {} }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.charactersReady === '24' && document.querySelector('#canvas-host').dataset.playerReady === 'true');
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
  const read = () => page.locator('.invasion-controls').evaluate(el => JSON.parse(el.dataset.state));
  check(!await page.locator('#invasion-toggle').isDisabled(), 'Jevica can begin');
  await page.locator('#invasion-toggle').click();
  check((await read()).phase === 'active' && (await read()).remaining === 5, 'Five saucers arrive');
  await page.waitForFunction(() => JSON.parse(document.querySelector('.invasion-controls').dataset.state).landed >= 1, null, { timeout: 15000 });
  check((await read()).crew.length === 5, 'Every crew member has a saucer');
  await page.waitForFunction(() => JSON.parse(document.querySelector('.invasion-controls').dataset.state).crew.every(member => member.ready), null, { timeout: 30000 });
  check(new Set((await read()).crew.map(member => member.species)).size >= 2, 'The crew are of more than one species');
  await page.screenshot({ path: 'output/playwright/invasion-landing.png' });
  // Approach through the same directory control used by visitors. A straight
  // keyboard chase from spawn can get trapped behind a storefront or tree,
  // which tests an obstacle-blind pilot rather than spell/invasion integration.
  const approach = await page.evaluate(() => {
    const residents = JSON.parse(document.querySelector('#community-life-status').dataset.residents).filter(person => person.id.startsWith('local-'));
    const aliens = JSON.parse(document.querySelector('.invasion-controls').dataset.state).aliens;
    return residents.map(person => ({ id: person.id, distance: Math.min(...aliens.map(alien => Math.hypot(person.position[0] - alien.position[0], person.position[1] - alien.position[1]))) })).sort((a, b) => a.distance - b.distance)[0];
  });
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await page.locator('[data-section=community-section]').click();
  if (!await page.locator('#community-more').evaluate(element => element.open)) await page.locator('#community-more > summary').click();
  await page.locator('#community-local').selectOption(approach.id);
  await page.locator('#community-meet').click();
  await page.locator('#community-dialogue').waitFor({ state: 'visible' });
  await page.locator('#community-close').click();
  await page.locator('#panel-toggle').click();
  // Use actual movement and Q casting from the directory approach.
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
  const effects = (await read()).effects;
  check(effects.bursts >= 1 && effects.impacts >= 1, `Cast and impact effects fired (bursts ${effects.bursts}, impacts ${effects.impacts})`);
  if ((await read()).phase === 'active') await page.locator('#invasion-toggle').click();
  const after = await read();
  check(after.phase !== 'active' && after.abducted === 0, `The scenario ends and everyone returns (phase ${after.phase}, abducted ${after.abducted})`);
  check(await page.locator('#invasion-toggle').textContent() === 'Begin invasion', 'The card offers another round');
  await page.locator('#invasion-toggle').click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('.invasion-controls').dataset.state).crew.length === 5);
  check((await read()).phase === 'active', 'Jevica can begin a second invasion');
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await page.locator('[data-section=community-section]').click();
  await page.locator('#reload').click();
  await page.waitForFunction(() => {
    const d = document.querySelector('#canvas-host').dataset;
    const invasion = JSON.parse(document.querySelector('.invasion-controls').dataset.state);
    return d.charactersReady === '24' && d.storePeopleTotal === d.storePeopleReady && invasion.phase === 'idle';
  });
  const reloaded = await read();
  check(reloaded.abducted === 0 && reloaded.crew.length === 0 && reloaded.aliens.length === 0, 'World reload clears the old invasion, crew and abductions');
  check(await page.locator('#invasion-toggle').getAttribute('aria-pressed') === 'false', 'Reload restores the Begin invasion control');
  await page.screenshot({ path: 'output/playwright/invasion-reload.png' });
  check(errors.length === 0, `No page errors: ${errors.join('; ')}`);
  return { checks, banished, errors };
}
