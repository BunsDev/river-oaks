// Live shared voice against a real LiveKit Cloud project: the fixture town runs
// RIVER_OAKS_VOICE_FIXTURE=live with the LIVEKIT_* settings from the process
// environment, both residents use the real livekit-client with Chromium's fake
// microphone (a tone), and the checks are what a person would hear: each side
// subscribes to the other and sees them speaking, leaving removes the peer, and
// a dropped tab is removed within the lease window. Timings land in
// data/reports/voice-live.json and data/reports/voice-revocation.json.
async page => {
  const origin = 'http://127.0.0.1:5173', checks = [], timings = {};
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const voice = tab => tab.evaluate(() => window.__riverVoice?.() ?? null);
  const waitVoice = async (tab, predicate, message, timeout = 20000) => {
    const started = Date.now();
    await tab.waitForFunction(predicate, null, { timeout }).catch(async () => { throw new Error(`${message} · voice ${JSON.stringify(await voice(tab))}`); });
    return (Date.now() - started) / 1000;
  };
  const ready = async tab => {
    await tab.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverMultiplayer?.().connected, null, { timeout: 90000 });
    await tab.waitForFunction(() => window.__riverVoice?.()?.status === 'idle', null, { timeout: 30000 }).catch(async () => { throw new Error(`voice never became available · ${JSON.stringify(await voice(tab))}`); });
  };
  await page.context().grantPermissions(['microphone'], { origin });
  await page.context().addCookies([{ name: 'fixture_session', value: 'alice', url: origin }]);
  await page.goto(origin + '/?motion-debug=1');
  await ready(page);
  check(await page.locator('#walking-voice-join').isVisible(), 'The town reports live voice and offers Join');
  const other = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  let bob = null;
  try {
    await other.grantPermissions(['microphone'], { origin });
    await other.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
    bob = await other.newPage();
    await bob.goto(origin + '/?motion-debug=1');
    await ready(bob);
    // Both join the outdoor room over the real transport.
    for (const [tab, name] of [[page, 'alice'], [bob, 'bob']]) {
      await tab.locator('#canvas-host').focus();
      await tab.keyboard.press('KeyY');
      timings[`${name}Join`] = await waitVoice(tab, () => window.__riverVoice?.()?.status === 'joined', `${name} joins live voice with Y`);
    }
    check((await voice(page)).hasRoom && (await voice(bob)).hasRoom, 'Both residents hold a real LiveKit room connection');
    // Microphones on: a peer appears once their microphone track is published and
    // subscribed, and the fake device plays a tone, so LiveKit reports each as speaking.
    for (const [tab, name] of [[page, 'alice'], [bob, 'bob']]) {
      await tab.locator('#canvas-host').focus();
      await tab.keyboard.press('KeyM');
      await waitVoice(tab, () => window.__riverVoice?.()?.mic === 'on', `${name} unmutes`);
    }
    timings.aliceSeesBob = await waitVoice(page, () => window.__riverVoice().peers.bob?.subscribed === true, 'Alice subscribes to Bob over LiveKit', 30000);
    timings.bobSeesAlice = await waitVoice(bob, () => window.__riverVoice().peers.alice?.subscribed === true, 'Bob subscribes to Alice over LiveKit', 30000);
    timings.aliceHearsBob = await waitVoice(page, () => window.__riverVoice().speaking.includes('bob'), 'Alice hears Bob speaking (active speaker over LiveKit)', 30000);
    timings.bobHearsAlice = await waitVoice(bob, () => window.__riverVoice().speaking.includes('alice'), 'Bob hears Alice speaking (active speaker over LiveKit)', 30000);
    // The speaking ring is gated by the fake-transport journey (voice-shared); here it is
    // an observation, since a tone's active-speaker events can flicker between samples.
    timings.ringObserved = await page.locator('.remote-player-label[data-peer-id="bob"][data-speaking="true"]').waitFor({ state: 'attached', timeout: 20000 }).then(() => true, () => false);
    checks.push(timings.ringObserved ? 'The speaking ring showed on Bob\'s label for Alice' : 'The speaking ring was not sampled on Bob\'s label within 20 s (audio-level events flicker; covered by voice-shared)');
    await page.screenshot({ path: 'output/playwright/voice-live.png' });
    // Bob leaves with Y: Alice loses the peer and the server drops his lease.
    await bob.locator('#canvas-host').focus();
    await bob.keyboard.press('KeyY');
    await waitVoice(bob, () => window.__riverVoice?.()?.status === 'idle', 'Bob leaves voice with Y');
    timings.leaveToPeerGone = await waitVoice(page, () => !window.__riverVoice().peers.bob || window.__riverVoice().peers.bob.subscribed === false, 'Alice no longer receives Bob after he leaves', 30000);
    timings.leaveToLeaseDropped = await waitVoice(page, () => window.__riverMultiplayer().snapshot?.players.find(player => player.id === 'bob')?.voice?.id === null, 'The server drops Bob\'s lease after he leaves', 30000);
    // Bob rejoins, then his tab is closed without leaving: the reconciler and the
    // sweep must remove him from the room within the lease window.
    await bob.locator('#canvas-host').focus();
    await bob.keyboard.press('KeyY');
    await waitVoice(bob, () => window.__riverVoice?.()?.status === 'joined', 'Bob rejoins');
    await bob.locator('#canvas-host').focus();
    await bob.keyboard.press('KeyM');
    await waitVoice(bob, () => window.__riverVoice?.()?.mic === 'on', 'Bob unmutes again');
    await waitVoice(page, () => window.__riverVoice().peers.bob?.subscribed === true, 'Alice subscribes to Bob again', 30000);
    const dropped = Date.now();
    await other.close(); bob = null;
    timings.dropToRemoved = await waitVoice(page, () => !window.__riverVoice().peers.bob || window.__riverVoice().peers.bob.subscribed === false, 'A dropped tab is removed from the room', 150000);
    timings.dropToRemovedWall = (Date.now() - dropped) / 1000;
    check(timings.dropToRemoved < 130, `A dropped tab is removed within the lease window (${timings.dropToRemoved.toFixed(1)} s)`);
    // Alice leaves cleanly.
    await page.locator('#canvas-host').focus();
    await page.keyboard.press('KeyY');
    await waitVoice(page, () => window.__riverVoice?.()?.status === 'idle', 'Alice leaves voice');
    const { writeFile } = await import('node:fs/promises');
    const createdAt = new Date().toISOString();
    const report = { createdAt, scope: 'Live LiveKit Cloud acceptance from the loopback fixture town (RIVER_OAKS_VOICE_FIXTURE=live): two fixture residents on the real livekit-client with fake microphones. No hosted sign-in; the project host, key and secret are not recorded.', checks, timingsSeconds: timings };
    await writeFile('data/reports/voice-live.json', JSON.stringify(report, null, 2) + '\n');
    await writeFile('data/reports/voice-revocation.json', JSON.stringify({ createdAt, measuredAgainst: 'LiveKit Cloud (preview project) from the fixture town',
      leaveToPeerGoneSeconds: timings.leaveToPeerGone, leaveToLeaseDroppedSeconds: timings.leaveToLeaseDropped, droppedTabToRemovedSeconds: timings.dropToRemoved,
      targets: { withLiveLeaseHolderSeconds: 2, noInstanceAliveSeconds: 127 }, note: 'A dropped tab keeps its lease until the reconciler sees the connection gone (departure grace) or the per-minute sweep removes it; the fixture town has no cron, so the 30 s timer sweep applies.' }, null, 2) + '\n');
    return { checks, timings };
  } finally { if (bob) await other.close().catch(() => {}); else await other.close().catch(() => {}); }
}
