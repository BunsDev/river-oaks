async page => {
  const origin = 'http://127.0.0.1:5180', checks = [], corrections = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  await page.context().addCookies([{ name: 'fixture_session', value: 'owner', url: origin }]);
  page.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
    try { const message = JSON.parse(String(payload)); if (message.type === 'result' && message.correction) corrections.push(message); } catch {}
  }));
  await page.route('**/v1/chauffeur', async route => {
    const packet=route.request().postDataJSON();
    await route.fulfill({json:{schema_version:1,tick:packet.tick,generation:packet.generation,source:'jev',candidate_id:'cruise',confidence:.9}});
  });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host').dataset.playerReady === 'true' && document.querySelector('#canvas-host').dataset.carriageDriverReady === 'true');
  if (!await page.locator('.player-settings').evaluate(node => node.open)) await page.locator('.player-settings > summary').click();
  await page.locator('#player-ride').click();
  await page.waitForFunction(() => window.__riverCarriage().riding);
  await page.waitForFunction(() => { const town = window.__riverMultiplayer(); return town.snapshot.players.find(player => player.id === town.selfId).vehicle === 'rolls'; });
  check(true, 'Jevica boards a vehicle accepted by the shared town');
  await page.locator('#player-chauffeur').click();
  const driveStart=await page.evaluate(()=>{const c=window.__riverCarriage();return {riding:c.riding,chauffeur:c.chauffeur,placement:c.placement,princeVisible:c.princeVisible,companion:c.companion,status:document.querySelector('#player-status').textContent};});
  check(driveStart.chauffeur.active,`The initial parked vehicle supports a scenic drive: ${JSON.stringify(driveStart)}`);
  await page.waitForFunction(()=>window.__riverCarriage().chauffeur.source==='jev');
  check(true,'Jev smart driving receives a valid decision');
  await page.locator('#player-drive-pause').click();
  await page.waitForFunction(()=>window.__riverCarriage().chauffeur.paused);
  const paused=await page.evaluate(()=>window.__riverCarriage().placement.position.slice());
  await page.waitForTimeout(250);
  const held=await page.evaluate(()=>window.__riverCarriage().placement);
  check(held.speed===0&&Math.hypot(...held.position.map((v,i)=>v-paused[i]))<.01,'Paused smart drive holds the vehicle');
  await page.locator('#player-drive-pause').click();
  await page.waitForFunction(()=>window.__riverCarriage().chauffeur.source==='jev');
  const forward=page.locator('[data-drive="forward"]');
  await forward.dispatchEvent('keydown',{code:'Space'});await forward.dispatchEvent('keyup',{code:'Space'});
  check(!await page.evaluate(()=>window.__riverCarriage().chauffeur.active),'A quick manual direction immediately cancels autopilot');
  await page.locator('#player-drive-park').click();
  check(await page.evaluate(()=>window.__riverCarriage().placement.speed===0),'Brake and park stops the vehicle');
  corrections.length = 0;
  await page.locator('#player-ride').click();
  await page.waitForFunction(() => !window.__riverCarriage().riding);
  const exit = await page.evaluate(() => window.__riverCarriage().pose.position);
  await page.waitForFunction(() => { const town = window.__riverMultiplayer(); return town.snapshot.players.find(player => player.id === town.selfId).vehicle === null; });
  const settled = await page.evaluate(() => ({ pose: window.__riverCarriage().pose, town: window.__riverMultiplayer() }));
  const player = settled.town.snapshot.players.find(player => player.id === settled.town.selfId);
  check(Math.hypot(settled.pose.position[0] - exit[0], settled.pose.position[2] - exit[2]) < .15, `Shared corrections preserve the exit point: ${JSON.stringify({ exit, position: settled.pose.position, corrections })}`);
  check(Math.hypot(player.position[0] - exit[0], player.position[1] + exit[2]) < .15, 'The shared town confirms the same grounded exit');
  check(settled.pose.showBody, 'Jevica remains visible after stepping out');
  check(corrections.length === 0, 'Stepping out produces no rejected pose');
  return { checks };
}
