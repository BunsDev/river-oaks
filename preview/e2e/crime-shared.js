async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  // The first criminal action (#597) in two browsers. The development owner (the runner restarts
  // the town so this page is its first visitor) turns danger on in Westcreek Lane; a second
  // player walks up to the rival and shoves with T. Both see only the town's numbers: the HUD
  // changes after the reply, never before it. Emergency off then tells them nobody can be harmed.
  const RX = -2908, RN = -1320;
  const checks = [], errors = [], cameraStations = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const visitor = await (await page.context().browser().newContext()).newPage();
  for (const tab of [page, visitor]) { tab.setDefaultNavigationTimeout(60000); tab.on('pageerror', error => errors.push(error.message)); await tab.setViewportSize({ width: 1280, height: 860 }); }
  const join = async tab => {
    await tab.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
    await tab.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 60000 });
  };
  await visitor.emulateMedia({reducedMotion:'reduce'});
  const town = tab => tab.evaluate(() => { const m = window.__riverMultiplayer(), crime = m.snapshot.crime;
    return { rival: crime.targets.find(item => item.id === 'rival:westcreek'), wanted: crime.wanted, self: m.snapshot.players.find(p => p.id === m.selfId), selfId: m.selfId }; });
  try {
    await join(page);await join(visitor);
    if(await visitor.locator('.visit-tools[open]').count())await visitor.locator('.visit-tools-toggle').click();
    if(await visitor.locator('.town-chat-dock[open]').count())await visitor.locator('.town-chat-toggle').click();
    const before = await town(visitor);
    check(before.rival?.health === 100 && before.wanted.length === 0, 'The town starts with a whole rival and nobody wanted');
    check(await visitor.evaluate(() => window.__riverMultiplayer().remotes.some(item => item.id === 'rival:westcreek')), 'The rival is drawn as a figure');

    // The visitor walks up to the rival while the town is still peaceful.
    const hud = visitor.getByRole('region', { name: 'Danger and wanted level' });
    let arrived = null;
    for (const [dx, dn] of [[1.2, 0], [0, 1.2], [0, -1.2], [-1.2, 0]]) {
      await visitor.evaluate(([x, n]) => window.__riverSeatAndWater().goTo(x, n), [RX + dx, RN + dn]);
      await visitor.waitForTimeout(400);
      const { self } = await town(visitor);
      if (Math.hypot(self.position[0] - RX, self.position[1] - RN) <= 1.5) { arrived = self.position; break; }
      await visitor.waitForTimeout(1200);
    }
    check(arrived, 'The visitor arrives within arm\'s reach of the rival');
    await hud.getByText('Westcreek rival', { exact: true }).waitFor();
    check(/Nobody can be harmed/.test(await hud.textContent()) && await hud.getByRole('button', { name: /Shove/ }).count() === 0, 'While peaceful, the HUD says nobody can be harmed and offers no shove');

    // The owner turns danger on with the World rules panel.
    await openHudSpace(page, 'community-section');
    const rules = page.getByRole('region', { name: 'World rules' });
    await rules.getByLabel('At all hours').check();
    await rules.getByLabel('Westcreek Lane').check();
    await rules.getByRole('button', { name: 'Apply rules' }).click();
    await visitor.waitForFunction(() => window.__riverMultiplayer().snapshot.worldPolicy?.active === true);
    const shove = hud.getByRole('button', { name: 'Shove Westcreek rival T' });
    await shove.waitFor();
    const meter = hud.getByRole('progressbar', { name: 'Westcreek rival health' });
    check(await meter.getAttribute('aria-valuenow') === '100', 'Health is a labelled progress bar');

    // T strikes. Watch the HUD from the moment of the key press: health may change only with the
    // town's snapshot, and (#640) only at the strike's contact, after a windup.
    await visitor.evaluate(() => {
      window.__crimeTrace = []; window.__crimeLines = [];
      const meterNode = document.querySelector('.crime-health'), line = document.querySelector('.crime-result');
      const seen = () => window.__crimeTrace.push({ meter: meterNode.getAttribute('aria-valuenow'), town: window.__riverMultiplayer().snapshot.crime.targets.find(item => item.id === 'rival:westcreek').health });
      new MutationObserver(seen).observe(meterNode, { attributes: true, attributeFilter: ['aria-valuenow'] });
      new MutationObserver(() => window.__crimeLines.push(line.textContent)).observe(line, { childList: true, characterData: true, subtree: true });
    });
    await visitor.locator('#canvas-host').focus();await visitor.keyboard.press('KeyT');
    await visitor.waitForFunction(() => window.__crimeLines.some(text => text.startsWith('Hit landed.')));
    const lines = await visitor.evaluate(() => window.__crimeLines);
    check(lines.indexOf('Winding up…') >= 0 && lines.indexOf('Winding up…') < lines.findIndex(text => text.startsWith('Hit landed.')), 'The strike winds up before the town confirms contact');
    const trace = await visitor.evaluate(() => window.__crimeTrace);
    check(trace.length > 0 && trace.every(item => Number(item.meter) === item.town), 'Every health change on screen matched the town\'s state at that moment');
    const after = await town(visitor);
    check(after.rival.health === 75 && after.wanted.some(([id, stars]) => id === after.selfId && stars === 1), 'One hit: 25 damage and one star');
    check(lines.some(text => /Westcreek rival has 75 health left\. Wanted level 1 of 5\./.test(text)), 'The hit is confirmed in plain words');
    check(await hud.locator('.crime-wanted').getAttribute('aria-label') === 'Wanted level: 1 of 5 stars', 'Wanted stars have a spoken label');
    await page.waitForFunction(id => { const crime = window.__riverMultiplayer().snapshot.crime;
      return crime.targets.find(item => item.id === 'rival:westcreek').health === 75 && crime.wanted.some(([who, stars]) => who === id && stars === 1); }, after.selfId);
    check(true, 'The owner\'s browser sees the same hit and star');
    await page.waitForFunction(id => window.__riverMultiplayer().remotes.some(item => item.id === id && item.gesture === 'shove'), after.selfId).catch(() => {});

    // The rival answers with a telegraphed counter (#640). U, timed against the town's own
    // remaining windup (the evade window is the 350 ms before contact), evades it: no damage,
    // said in words. Snapshots arrive every 200 ms, so the page notes when contact falls by its
    // own clock as soon as the counter appears, and U is pressed 230 ms before that, leaving
    // the key's round trip inside the window. A counter that can't be timed lands; the rival
    // telegraphs again after its cooldown.
    await visitor.waitForFunction(() => window.__crimeLines.some(text => /winding up to strike back/.test(text)));
    let evadedCounter = null;
    for (let attempt = 0; attempt < 3 && !evadedCounter; attempt++) {
      const counter = await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(), counter = m.snapshot.crime.actions?.find(item => item.kind === 'counter' && item.targetId === m.selfId && item.outcome === null);
        return counter && { id: counter.id, remainingMs: counter.remainingMs, contactAt: performance.now() + counter.remainingMs, health: m.snapshot.players.find(p => p.id === m.selfId).health }; }, null, { polling: 16, timeout: 10000 }).then(handle => handle.jsonValue()).catch(() => null);
      if (!counter) continue;
      if (counter.remainingMs < 260) { // Seen too late to time: let it land, then wait for the next.
        await visitor.waitForFunction(id => window.__riverMultiplayer().snapshot.crime.actions?.find(item => item.id === id && item.outcome !== null), counter.id);
        continue;
      }
      await visitor.locator('#canvas-host').focus();
      await visitor.waitForFunction(at => performance.now() >= at, counter.contactAt - 230, { polling: 16 });
      await visitor.keyboard.press('KeyU');
      const outcome = await visitor.waitForFunction(id => window.__riverMultiplayer().snapshot.crime.actions?.find(item => item.id === id && item.outcome !== null)?.outcome, counter.id).then(handle => handle.jsonValue());
      if (outcome === 'evaded') evadedCounter = { ...counter, after: (await town(visitor)).self.health };
    }
    check(evadedCounter, 'A timed evade (U) beats the rival\'s telegraphed counter');
    await visitor.waitForFunction(() => window.__crimeLines.some(text => /^You evaded Westcreek rival/.test(text)));
    check(evadedCounter.after === evadedCounter.health, 'An evaded counter does no damage');

    // Emergency off: the next shove is not offered, and the town is unchanged.
    await rules.getByRole('button', { name: 'Emergency off: stop all danger now' }).click();
    await visitor.waitForFunction(() => window.__riverMultiplayer().snapshot.worldPolicy?.violence.mode === 'off');
    await hud.getByText(/Nobody can be harmed/).waitFor();
    check(await hud.getByRole('button', { name: /Shove/ }).count() === 0, 'After emergency off there is no shove to offer');
    await visitor.waitForTimeout(1000);
    await visitor.locator('#canvas-host').focus();await visitor.keyboard.press('KeyT');
    await visitor.waitForTimeout(600);
    check((await town(visitor)).rival.health === 75, 'Pressing T in a peaceful town changes nothing');

    await visitor.setViewportSize({ width: 390, height: 844 });
    const box = await hud.boundingBox();
    check(box && box.x >= 0 && box.x + box.width <= 390, 'The crime HUD fits a phone');
    await visitor.screenshot({ path: 'output/playwright/crime-hud-phone.png' });
    // Police use the same replicated actors and authoritative HUD in both browsers.
    await rules.getByLabel('At all hours').check();
    await rules.getByLabel('Westcreek Lane').check();
    await rules.getByRole('button', { name: 'Apply rules' }).click();
    await visitor.waitForFunction(() => window.__riverMultiplayer().snapshot.police?.units.some(unit => unit.state === 'pursue'));
    await visitor.waitForFunction(() => window.__riverMultiplayer().remotes.some(item => item.id.startsWith('police:') && item.ready));
    check(await visitor.evaluate(() => window.__riverMultiplayer().remotes.some(item => item.id.startsWith('police:') && item.character?.palette === 'midnight')), 'Police use the existing human rig with the authored midnight palette');
    await hud.getByText(/Police are approaching/).waitFor();
    await page.setViewportSize({width:1280,height:860});
    if(await page.locator('#people-toggle').getAttribute('aria-expanded')==='true')await page.locator('#people-toggle').click();
    if(await page.locator('.visit-tools[open]').count())await page.locator('.visit-tools-toggle').click();
    if(await page.locator('.town-chat-dock[open]').count())await page.locator('.town-chat-toggle').click();
    const observerArrival=await page.evaluate(()=>window.__riverSeatAndWater().goTo(-2904,-1316));
    check(observerArrival?.ok,'The peaceful observer reaches a validated street camera station through normal travel');
    await page.locator('#canvas-host').focus();
    if(await page.evaluate(()=>window.__riverCarriage().camera.view!=='eye'))await page.keyboard.press('KeyV');
    await page.evaluate(()=>{const unit=window.__riverMultiplayer().snapshot.police.units.find(unit=>unit.state==='pursue');window.__riverSeatAndWater().face(unit.position[0],unit.position[1],1.1);});
    await page.waitForFunction(()=>window.__riverMultiplayer().remotes.some(unit=>unit.id.startsWith('police:')&&unit.ready&&unit.onScreen&&unit.labelVisible));
    await page.waitForFunction(()=>{const m=window.__riverMultiplayer(),unit=m.snapshot.police.units.find(unit=>unit.state==='pursue'),subject=unit&&m.snapshot.players.find(player=>player.id===unit.targetId);const gap=unit&&subject&&Math.hypot(unit.position[0]-subject.position[0],unit.position[1]-subject.position[1]);return gap>=1.249&&gap<=1.251;});
    await page.evaluate(()=>{const unit=window.__riverMultiplayer().snapshot.police.units.find(unit=>unit.state==='pursue');window.__riverSeatAndWater().face(unit.position[0],unit.position[1],1.1);});
    await page.waitForTimeout(400);
    const station=await page.evaluate(()=>{
      const town=window.__riverMultiplayer(),unit=town.snapshot.police.units.find(unit=>unit.state==='pursue');
      const {camera,pose}=window.__riverCarriage(),subject=town.snapshot.players.find(player=>player.id===unit.targetId);
      return {id:'POLICE-OBSERVER-01',camera,viewerEastNorthUp:[pose.position[0],-pose.position[2],pose.ground],
        eyeHeightMetres:pose.position[1]-pose.ground,targetEastNorthUp:unit.position,targetHeightAboveGroundMetres:1.1,officerId:unit.id,subjectEastNorthUp:subject.position,subjectId:subject.id,viewerId:town.selfId,viewerStars:town.snapshot.crime.wanted.find(([id])=>id===town.selfId)?.[1]??0,
        sourceAxes:'east/north/up metres',cameraAxes:'east/up/south metres',viewport:[innerWidth,innerHeight],renderViewport:[document.querySelector('#canvas-host').clientWidth,document.querySelector('#canvas-host').clientHeight],
        cameraKind:'normal first-person observer gameplay camera; no detached view',reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};
    });
    cameraStations.push(station);
    check(station.camera.view==='eye'&&station.camera.verticalFovDegrees===65&&Math.abs(station.camera.aspect-station.renderViewport[0]/station.renderViewport[1])<.001,'Officer capture uses the normal 65-degree vertical-FOV first-person gameplay camera');
    const gap=Math.hypot(station.subjectEastNorthUp[0]-station.targetEastNorthUp[0],station.subjectEastNorthUp[1]-station.targetEastNorthUp[1]);
    check(gap>=1.2&&gap<=1.5,'The officer stops visibly within arrest reach without overlapping the player');
    check(station.viewerStars===0&&station.subjectId!==station.viewerId,'The officer targets the wanted resident while the observing player remains peaceful');
    await page.screenshot({path:'output/playwright/police-officer-desktop.png'});
    await visitor.screenshot({ path: 'output/playwright/police-pursuit-phone.png' });
    const surrender = hud.getByRole('button', { name: 'Surrender', exact: true });
    await surrender.focus(); await visitor.keyboard.press('Enter');
    await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.police.surrendered.includes(m.selfId); });
    check(true, 'Keyboard surrender is accepted by the server with reduced motion enabled');
    await page.waitForFunction(id => window.__riverMultiplayer().snapshot.police.units.some(unit => unit.targetId === id && unit.state === 'arrest'), after.selfId);
    check(true, 'The other browser sees the same authoritative arrest');
    await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return !m.snapshot.crime.wanted.some(([id]) => id === m.selfId); });
    const safe = await town(visitor);
    check(Math.hypot(safe.self.position[0] - RX, safe.self.position[1] - RN) > 10, 'Arrest returns the player to the existing safe arrival');
    await hud.getByText('You are no longer wanted. You may move again.', { exact:true }).waitFor();
    check(await hud.getByRole('button', { name:'Surrender', exact:true }).count() === 0, 'The HUD removes surrender after the town clears wanted stars');
    await visitor.waitForFunction(() => {
      const m = window.__riverMultiplayer(), self = m.snapshot.players.find(player => player.id === m.selfId);
      const pose = window.__riverCarriage?.().pose;
      return pose && Math.hypot(pose.position[0] - self.position[0], -pose.position[2] - self.position[1]) < .15;
    });
    check(true, 'The rendered local walking pose reaches the server arrival, not only its snapshot');
    await visitor.screenshot({ path:'output/playwright/police-safe-arrival-phone.png' });
    check(errors.length === 0, `No page errors: ${errors.join(' | ')}`);
    return { passed: true, checks, cameraStations };
  } finally {
    await visitor.context().close();
  }
}
