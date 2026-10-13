async page => {
  // The plaza's music stage: X takes the stage, the town holds it for one performer,
  // everyone in town sees the performance and the stage lights, and X steps down.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const peerContext = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 } });
  await peerContext.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
  const peer = await peerContext.newPage();
  const ready = tab => tab.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverPlazaStage?.(), null, { timeout: 90000 });
  const player = (tab, id) => tab.evaluate(id => { const mp = window.__riverMultiplayer(); return mp.snapshot.players.find(person => person.id === (id ?? mp.selfId)) ?? null; }, id);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(origin + '/?motion-debug=1'); await ready(page);
    await peer.goto(origin + '/?motion-debug=1'); await ready(peer);
    const performerId = await page.evaluate(() => window.__riverMultiplayer().selfId);

    check((await page.evaluate(() => window.__riverPlazaStage().goNear())).ok, 'Arrived in front of the stage');
    await page.waitForFunction(() => window.__riverPlazaStage().action === 'Take the stage', null, { timeout: 15000 });
    const primary = () => page.locator('#walking-play').evaluate(button => button.parentElement.classList.contains('walking-primary') ? button.textContent : null);
    await page.waitForFunction(() => document.querySelector('#walking-play')?.parentElement?.classList.contains('walking-primary'), null, { timeout: 5000 });
    check(/Take the stage/.test(await primary()), 'Take the stage (X) is the primary action at the stage');
    check(await page.evaluate(() => window.__riverPlazaStage().live) === false, 'The stage lights are down before anyone performs');
    await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyX');
    await page.waitForFunction(() => { const mp = window.__riverMultiplayer(); return mp.snapshot.players.find(person => person.id === mp.selfId)?.performing; }, null, { timeout: 15000 });
    const performer = await player(page);
    check(performer.gesture === 'perform', `The performer performs (${performer.gesture})`);
    await page.waitForFunction(() => window.__riverPlazaStage().live === true && window.__riverPlazaStage().action === 'Step down from the stage', null, { timeout: 10000 });
    check(await page.locator('.walking-title strong').textContent() === 'On stage', 'The walking title says On stage');
    await page.waitForFunction(() => /Step down/.test(document.querySelector('.walking-primary #walking-play')?.textContent ?? ''), null, { timeout: 5000 });
    check(true, 'Step down (X) is the primary action on stage');
    // The performer stays at the microphone: walking keys do not move them.
    const before = (await player(page)).position;
    await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW');
    await page.waitForTimeout(400);
    const after = (await player(page)).position;
    check(Math.hypot(after[0] - before[0], after[1] - before[1]) < 0.01, 'The performer stays at the microphone');

    // Everyone else sees the performance and the lights.
    await peer.waitForFunction(id => window.__riverMultiplayer().snapshot.players.find(person => person.id === id)?.performing && window.__riverPlazaStage().live === true, performerId, { timeout: 15000 });
    check((await player(peer, performerId)).gesture === 'perform', 'Others see the performer perform');
    const remote = await peer.evaluate(id => [].concat(window.__riverMultiplayer().remotes ?? []).find(entry => entry.id === id) ?? null, performerId);
    check(remote === null || remote.gesture === 'perform', `The performer's avatar performs for others (${JSON.stringify(remote)?.slice(0, 120)})`);
    // The stage is held for one performer.
    check((await peer.evaluate(() => window.__riverPlazaStage().goNear())).ok, 'A second resident walks up to the stage');
    await peer.waitForFunction(() => /is performing/.test(window.__riverPlazaStage().action ?? ''), null, { timeout: 15000 });
    check(await peer.locator('#walking-play').evaluate(button => button.getAttribute('aria-disabled') === 'true' && /is performing/.test(button.textContent)), 'Walking up to a held stage says who is performing');
    await page.screenshot({ path: 'output/playwright/plaza-stage-performer.png' });
    await peer.screenshot({ path: 'output/playwright/plaza-stage-audience.png' });

    // X again steps down; the lights go down for everyone and the stage is free.
    await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyX');
    await page.waitForFunction(() => { const mp = window.__riverMultiplayer(); return mp.snapshot.players.find(person => person.id === mp.selfId)?.performing === false; }, null, { timeout: 15000 });
    await peer.waitForFunction(() => window.__riverPlazaStage().live === false && window.__riverPlazaStage().action === 'Take the stage', null, { timeout: 15000 });
    // The walking title repaints on its next HUD frame.
    await page.waitForFunction(() => document.querySelector('.walking-title strong')?.textContent !== 'On stage', null, { timeout: 5000 });
    const down = await player(page), title = await page.locator('.walking-title strong').textContent();
    check(down.gesture !== 'perform' && title !== 'On stage', `Stepping down ends the performance (gesture ${down.gesture}, title ${title})`);
    check(true, 'The stage is free again, and its lights are down for everyone');
    return { checks };
  } finally { await peerContext.close(); }
}
