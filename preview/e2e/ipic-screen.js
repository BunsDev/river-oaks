async page => {
  // The IPIC screen with real decoding and the real screen material (#498), on
  // preview/e2e/fixtures/ipic-screen.html. Films are test-only synthetic sources plus the bundled
  // ones; nothing here is device, human or final-media acceptance.
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const checks = [], errors = [], results = {};
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/e2e/fixtures/ipic-screen.html');
  await page.waitForFunction(() => window.screenFixture?.ready, null, { timeout: 120000 });
  const fx = (name, ...args) => page.evaluate(([method, values]) => window.screenFixture[method](...values), [name, args]);
  const dark = rgb => rgb.every(value => value <= 8);
  const tinted = (rgb, colour) => { const on = colour.map(c => c > 0); const lit = rgb.filter((_, i) => on[i]), off = rgb.filter((_, i) => !on[i]);
    return Math.min(...lit) >= 90 && (off.length === 0 || Math.max(...off) <= Math.min(...lit) - 60); };
  const capture = name => page.screenshot({ path: `output/playwright/ipic-screen/${name}.png` });

  // A stalled load, on a film this page has never fetched (so no cache answers it): the request
  // never completes, and after SCREENING_LOAD.stallMs the viewer gets a truthful Retry.
  const stall = '**/assets/ipic/screening/fixture-v1.*';
  await page.route(stall, () => {});
  const stalled = await fx('show', 'ipic-fixture-v1', { wait: false });
  check(stalled.state === 'loading', `the fixture starts loading: ${stalled.state}`);
  await page.waitForFunction(() => window.screenFixture.inspect().state === 'error', null, { timeout: 45000 });
  const gaveUp = await fx('inspect');
  check(gaveUp.failure === 'stalled' && gaveUp.attempts.length === 1 && !gaveUp.screen.key, `a stalled load reports stalled once, with nothing on screen: ${JSON.stringify(gaveUp)}`);
  await page.unroute(stall);
  await fx('retry');
  await page.waitForFunction(() => window.screenFixture.inspect().screen.key, null, { timeout: 20000 });
  checks.push('a load that never progresses reports “stalled” after the limit; Retry then plays it');

  // Every aspect on the real screen: whole film, own aspect, mattes drawn by the screen.
  const FILMS = [['test-edge-16x9', [0, 0, 255]], ['test-edge-4x3', [255, 0, 0]], ['test-edge-239', [0, 255, 0]]];
  let previous = null;
  for (const [id, colour] of FILMS) {
    const shown = await fx('show', id);
    check(shown.screen.key && shown.failure === null, `${id} is on the screen: ${JSON.stringify(shown)}`);
    const sample = await fx('sample'), [w, h] = shown.decoded;
    results[id] = sample;
    const visible = 1 / sample.bound.fit.repeat[0] * 12.1 / (1 / sample.bound.fit.repeat[1] * 3.6);
    check(Math.abs(visible - w / h) < 1e-6, `${id} keeps its ${w}x${h} aspect on the screen (${visible})`);
    for (const edge of ['edgeLeft', 'edgeRight', 'edgeTop', 'edgeBottom']) check(tinted(sample.film[edge].rendered, colour), `${id} ${edge} shows the film's own edge: ${JSON.stringify(sample.film[edge])}`);
    for (const [name, value] of Object.entries(sample.matte)) check(dark(value.rendered), `${id} ${name} matte is black: ${JSON.stringify(value)}`);
    check(Object.keys(sample.matte).length === 4, `${id} has mattes on both sides`);
    check(Math.min(...sample.film.white.rendered) > Math.max(...sample.film.black.rendered) + 100, `${id} is the right way round: white box left of black box ${JSON.stringify([sample.film.white, sample.film.black])}`);
    if (previous) check(shown.screen.texture !== previous.screen.texture && shown.screen.counts.created === previous.screen.counts.created + 1 && shown.screen.counts.disposed === previous.screen.counts.disposed + 1, `${id}: a new texture replaced the previous one: ${JSON.stringify([previous.screen, shown.screen])}`);
    check(shown.textures === shown.idleTextures + 1, `${id}: exactly one film texture is resident (${shown.textures} vs idle ${shown.idleTextures})`);
    await fx('pose', 'seated'); await capture(`${id}-seated`); await fx('pose', 'square'); await capture(`${id}-square`);
    previous = shown;
  }
  checks.push('16:9, 4:3 and 2.39:1 borderless films show whole, unstretched and the right way round, with black mattes and one texture each');

  // A network failure (offline) is reported as such, without trying the other encoding; back
  // online, Retry plays it. 4:1 is wider than the screen: letterboxed above and below.
  await page.context().setOffline(true);
  const offline = await fx('show', 'test-edge-4x1');
  check(offline.state === 'error' && offline.failure === 'network' && !offline.screen.key, `offline load reports a network failure with nothing on screen: ${JSON.stringify(offline)}`);
  await page.context().setOffline(false);
  await fx('retry');
  await page.waitForFunction(() => window.screenFixture.inspect().screen.key, null, { timeout: 20000 });
  await page.waitForFunction(() => { const s = window.screenFixture.inspect(); return !s.screen.key ? false : Math.abs(s.currentTime - 1) < 0.06; }, null, { timeout: 20000 });
  const wide = await fx('sample');
  results['test-edge-4x1'] = wide;
  check(Object.keys(wide.matte).join() === 'outsideTop,outsideBottom,midTop,midBottom' && Object.values(wide.matte).every(item => dark(item.rendered)), `4:1 is letterboxed with black mattes: ${JSON.stringify(wide.matte)}`);
  for (const edge of ['edgeLeft', 'edgeRight', 'edgeTop', 'edgeBottom']) check(tinted(wide.film[edge].rendered, [255, 0, 255]), `4:1 ${edge}: ${JSON.stringify(wide.film[edge])}`);
  await fx('pose', 'seated'); await capture('test-edge-4x1-seated'); await fx('pose', 'square');
  checks.push('offline: a network failure with Retry, no codec cycling; back online Retry plays; 4:1 letterboxed');

  // The first encoding is not a film: the next one is tried once and decodes.
  const fallback = await fx('show', 'test-fallback');
  check(fallback.failure === null && fallback.screen.key && fallback.source.src.endsWith('.mp4') && fallback.attempts.map(a => a.result).join() === 'decode,decoded', `fallback to the MP4: ${JSON.stringify(fallback)}`);
  checks.push(`a source no decoder accepts falls back to the next encoding once (${fallback.attempts.map(a => `${a.src.split('/').pop()}: ${a.result}`).join(', ')})`);

  // A switch while the previous film is still loading: the abort is not a failure.
  await fx('show', 'test-edge-16x9', { wait: false });
  const switched = await fx('show', 'test-edge-4x3');
  check(switched.mediaId === 'test-edge-4x3' && switched.failure === null && switched.screen.key && switched.decoded.join() === '640,480', `interrupted load: ${JSON.stringify(switched)}`);
  checks.push('switching while a load is pending aborts it quietly and shows the replacement');

  // Colour: the screen against the film's own pixels, house lights up and dimmed.
  await fx('show', 'test-edge-16x9');
  results.colour = { lit: await fx('sample'), dimmed: (await fx('pose', 'square', 0.25), await fx('sample')) };
  await fx('pose', 'square', 1);

  // Real playback of the approved short, muted: presented frames advance (requestVideoFrameCallback).
  const playing = await fx('show', 'ipic-original-v1', { status: 'playing', at: 2000 });
  check(playing.screen.key && playing.decoded.join() === '1280,720', `the short is on the screen: ${JSON.stringify(playing)}`);
  const frames = [];
  for (let i = 0; i < 8; i++) { await page.waitForTimeout(250); const s = await fx('inspect'); frames.push({ presented: s.presented, currentTime: s.currentTime, measuredDriftMs: s.measuredDriftMs }); }
  const presented = frames.filter(item => item.presented);
  check(presented.length >= 6 && presented.at(-1).presented.frames > presented[0].presented.frames && presented.at(-1).presented.mediaTimeMs > presented[0].presented.mediaTimeMs, `presented frames advance: ${JSON.stringify(frames)}`);
  results.frames = frames;
  await fx('pose', 'seated'); await capture('ipic-original-v1-seated'); await fx('pose', 'square');
  checks.push(`the short plays with presented frames advancing (${presented[0].presented.frames} → ${presented.at(-1).presented.frames})`);

  // Autoplay with sound refused by policy: blocked, one attempt, then a real click plays it.
  await fx('stop');
  await fx('unmute');
  const blocked = await fx('show', 'ipic-original-v1', { status: 'playing', at: 1000 });
  if (blocked.state === 'blocked') {
    check(blocked.failure === 'autoplay' && blocked.attempts.length === 1, `autoplay refusal: ${JSON.stringify(blocked)}`);
    await page.mouse.click(20, 20);
    await page.waitForFunction(() => window.screenFixture.inspect().state === 'playing', null, { timeout: 10000 });
    checks.push('sound autoplay refused by policy: blocked with one attempt (no codec cycling); a click plays it');
  } else checks.push(`autoplay with sound was allowed by this browser (${blocked.state}); the refusal path is covered by unit tests only`);

  // Stop: the screen is exactly its idle self and the film texture is gone.
  const stopped = await fx('stop');
  check(stopped.materialRestored && !stopped.screen.key && stopped.textures === stopped.idleTextures && stopped.screen.counts.created === stopped.screen.counts.disposed, `stop restores the screen exactly: ${JSON.stringify(stopped)}`);
  checks.push(`stop restores the screen material exactly; ${stopped.screen.counts.created} textures created, all disposed`);
  check(!errors.length, errors.join('; '));
  return { checks, errors, results, profile: 'fixture page: real IPIC interior and screen material, ACES 0.95, store lights; not the game pipeline' };
}
