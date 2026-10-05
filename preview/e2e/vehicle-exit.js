async page => {
  const origin = 'http://127.0.0.1:5180', checks = [], corrections = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  await page.context().addCookies([{ name: 'fixture_session', value: 'owner', url: origin }]);
  page.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
    try { const message = JSON.parse(String(payload)); if (message.type === 'result' && message.correction) corrections.push(message); } catch {}
  }));
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host').dataset.playerReady === 'true' && document.querySelector('#canvas-host').dataset.carriageDriverReady === 'true');
  if (!await page.locator('.player-settings').evaluate(node => node.open)) await page.locator('.player-settings > summary').click();
  await page.locator('#player-ride').click();
  await page.waitForFunction(() => window.__riverCarriage().riding);
  await page.waitForFunction(() => { const town = window.__riverMultiplayer(); return town.snapshot.players.find(player => player.id === town.selfId).vehicle === 'rolls'; });
  check(true, 'Jevica boards a vehicle accepted by the shared town');
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
