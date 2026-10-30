async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  // #599 / #640 increment 5: the coherent on-foot encounter in one recorded run, three browsers.
  // The runner's page is the town owner (rules only). A visitor, whose context records video, is
  // the player: they walk, sprint, turn, strafe and back up in the south service lane, strike the
  // lane rival (T), evade its counter (U), are offered surrender by an officer, evade one grab (U)
  // and are taken by the next, then return to the lane, alarm a resident, are cut off by emergency
  // off mid-pursuit, fight once more, lose and regain the socket mid-pursuit, lose window focus
  // with a walk key held, and surrender. A witness, also recorded, stands in the lane and watches
  // the same figures from a few metres away: the peer recording. Every number in the receipt is a
  // measurement of this run on this machine, not a budget; the checks ask that each event
  // happened in the town and was shown on both screens. Rows the authored zones cannot show
  // (sight loss around real geometry, stars held under observation) are recorded as not run,
  // with the reason, never as passes.
  const RX = -2800, RN = -1440, RIVAL = 'rival:service-lane', VIDEO_DIR = 'output/playwright/crime-encounter-video';
  const checks = [], errors = [], shots = [], rows = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const row = (name, status, detail) => rows.push({ name, status, detail });
  const browser = page.context().browser();
  const visitorContext = await browser.newContext({ recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 860 } } });
  const witnessContext = await browser.newContext({ recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 860 } } });
  const visitor = await visitorContext.newPage(), witness = await witnessContext.newPage();
  for (const tab of [page, visitor, witness]) { tab.setDefaultNavigationTimeout(60000); tab.on('pageerror', error => errors.push(error.message)); await tab.setViewportSize({ width: 1280, height: 860 }); }
  const join = async tab => {
    await tab.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
    await tab.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 60000 });
    if (await tab.locator('.visit-tools[open]').count()) await tab.locator('.visit-tools-toggle').click();
    if (await tab.locator('.town-chat-dock[open]').count()) await tab.locator('.town-chat-toggle').click();
  };
  const town = tab => tab.evaluate(id => { const m = window.__riverMultiplayer(), s = m.snapshot;
    return { rival: s.crime.targets.find(item => item.id === id), wanted: s.crime.wanted, actions: s.crime.actions, police: s.police, self: s.players.find(p => p.id === m.selfId), selfId: m.selfId,
      locals: s.locals.map(local => ({ id: local.id, name: local.name, indoor: local.indoor, position: local.position, life: local.life && { reaction: local.life.reaction, status: local.life.status, speed: local.life.speed } })) }; }, RIVAL);
  const stars = state => state.wanted.find(([id]) => id === state.selfId)?.[1] ?? 0;
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const shoot = async (tab, name) => { const path = `output/playwright/crime-encounter-${name}.png`; await tab.screenshot({ path }); shots.push(path); };
  const dusk = tab => tab.evaluate(() => { const input = document.querySelector('#sun-hour'); input.value = input.max; input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#weather').value = 'clear'; document.querySelector('#weather').dispatchEvent(new Event('change', { bubbles: true })); return { hour: Number(input.value), max: Number(input.max), shown: document.querySelector('#sun-time')?.textContent }; });
  // Travel has a 1 s cooldown on the town (TRAVEL_COOLDOWN_MS); a refused step is tried again.
  const goTo = async (tab, east, north) => {
    let reply = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      reply = await tab.evaluate(([x, n]) => window.__riverSeatAndWater().goTo(x, n), [east, north]);
      if (reply?.error !== 'travel_cooldown') return reply;
      await tab.waitForTimeout(300);
    }
    return reply;
  };
  const face = (tab, east, north) => tab.evaluate(([x, n]) => window.__riverSeatAndWater().face(x, n), [east, north]);
  const approach = async (tab, [east, north], reach) => {
    for (const [dx, dn] of [[1.2, 0], [0, 1.2], [0, -1.2], [-1.2, 0], [2, 0], [0, 2], [-2, 0], [0, -2]]) {
      await goTo(tab, east + dx, north + dn);
      await tab.waitForTimeout(400);
      const { self } = await town(tab);
      if (distance(self.position, [east, north]) <= reach) return self.position;
      await tab.waitForTimeout(1200);
    }
    return null;
  };
  const thirdPerson = async tab => { await tab.locator('#canvas-host').focus(); if (await tab.evaluate(() => window.__riverCarriage().camera.view === 'eye')) await tab.keyboard.press('KeyV'); };
  const firstPerson = async tab => { await tab.locator('#canvas-host').focus(); if (await tab.evaluate(() => window.__riverCarriage().camera.view !== 'eye')) await tab.keyboard.press('KeyV'); };
  const mark = (tab, label) => tab.evaluate(label => { window.__enc.marks.push([performance.timeOrigin + performance.now(), label]); }, label);
  const hold = async (tab, codes, ms, label) => { await tab.locator('#canvas-host').focus(); await mark(tab, `${label}:down`); for (const code of codes) await tab.keyboard.down(code); await tab.waitForTimeout(ms); for (const code of [...codes].reverse()) await tab.keyboard.up(code); await mark(tab, `${label}:up`); };
  const ms = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined ? Math.round(a - b) : null;
  const pursuer = state => state.police.units.find(unit => unit.targetId === state.selfId);
  // The evade key, timed against the town's own remaining windup as crime-shared does: `lead` ms
  // before contact, inside the 350 ms window with room for delivery.
  // The window is 350 ms. A key reaches the town 5–250 ms after the press: the socket is direct,
  // but the town's loop can be inside a long step (route searches run 100–200 ms under load), so
  // the delay varies from one telegraph to the next (run 7: a U 340 ms ahead of a grab's contact
  // was too late; run 8: a U 420 ms ahead of a counter's contact was too early). Each telegraph
  // is therefore timed from a probe: a command the town refuses at once measures the round trip
  // through the loop as it is now, and the key goes that delay plus 160 ms ahead of the contact.
  const evadeAt = async (tab, kind) => {
    const pending = await tab.waitForFunction(kind => { const m = window.__riverMultiplayer(), s = m.snapshot;
      if (kind === 'counter') { const counter = s?.crime?.actions?.find(item => item.kind === 'counter' && item.targetId === m.selfId && item.outcome === null && item.phase === 'windup'); return counter && { id: counter.id, remainingMs: counter.remainingMs, contactAt: performance.now() + counter.remainingMs }; }
      const unit = s?.police?.units?.find(unit => unit.targetId === m.selfId && unit.state === 'grab'); return unit && { id: unit.id, remainingMs: unit.remainingMs, contactAt: performance.now() + unit.remainingMs }; }, kind, { polling: 16, timeout: 25000 }).then(handle => handle.jsonValue()).catch(() => null);
    if (!pending) return { seen: null };
    const probe = await tab.evaluate(async () => { const t0 = performance.now(); const reply = await window.__riverMultiplayerCommand({ type: 'attack', targetId: 'encounter-probe', attackKind: 'melee', attackId: 'encounter-probe' }).catch(error => ({ ok: false, error: String(error) })); return { roundTripMs: Math.round(performance.now() - t0), error: reply?.error ?? reply?.message ?? null }; });
    const lead = Math.max(200, probe.roundTripMs + 160);
    const remainingNow = pending.contactAt - await tab.evaluate(() => performance.now());
    if (remainingNow < lead + 30) return { ...pending, probe, lead, late: true };
    await tab.locator('#canvas-host').focus();
    await tab.waitForFunction(at => performance.now() >= at, pending.contactAt - lead, { polling: 8 });
    await tab.evaluate(kind => { window.__enc.evadeKeyAt[kind] = performance.timeOrigin + performance.now(); }, kind);
    await tab.keyboard.press('KeyU');
    return { ...pending, probe, lead, pressed: true };
  };
  const videoOf = async (tab, name) => { const video = tab.video(); if (!video) return null; const path = await video.path(); return { path, name }; };
  try {
    await join(page); await join(visitor); await join(witness);
    const hours = [await dusk(visitor), await dusk(witness), await dusk(page)];
    check(hours.every(item => item.hour === item.max), `All three browsers show the latest authored hour (${hours[0].shown}; the control ends at ${hours[0].max}:00)`);
    const visitorId = (await town(visitor)).selfId, witnessId = (await town(witness)).selfId, ownerId = (await town(page)).selfId;
    check(new Set([visitorId, witnessId, ownerId]).size === 3, 'Owner, visitor and witness are three identities');

    // Rules on: the south service lane, at all hours. The panel stays open for emergency off.
    await openHudSpace(page, 'community-section');
    const rules = page.getByRole('region', { name: 'World rules' });
    const rulesOn = async () => { await rules.getByLabel('At all hours').check(); await rules.getByLabel('South service lane').check(); await rules.getByRole('button', { name: 'Apply rules' }).click();
      await visitor.waitForFunction(() => window.__riverMultiplayer().snapshot.worldPolicy?.active === true); };
    const emergencyOff = async () => { await rules.getByRole('button', { name: 'Emergency off: stop all danger now' }).click();
      await visitor.waitForFunction(() => window.__riverMultiplayer().snapshot.worldPolicy?.violence.mode === 'off'); };
    await rulesOn();

    // Observers: per-frame samplers on the visitor (local figure, camera, feet) and the witness
    // (the visitor's figure as drawn for a peer), plus the fight stamps. Epoch ms on each page's own clock.
    await visitor.evaluate(() => {
      const at = () => performance.timeOrigin + performance.now();
      const enc = window.__enc = { marks: [], samples: [], frames: 0, framesFrom: at(), keyAt: null, poseAt: null, strikePublishedAt: null, townContactAt: null, hitAt: null, telegraphAt: {}, evadeKeyAt: {}, evadePoseAt: null, lines: [], done: false };
      const host = document.querySelector('#canvas-host'), hud = document.querySelector('.crime-hud'), line = document.querySelector('.crime-result');
      new MutationObserver(() => { const body = host.dataset.combat; if (body === 'strike' && enc.poseAt === null) enc.poseAt = at(); if (body === 'evade' && enc.evadePoseAt === null) enc.evadePoseAt = at(); }).observe(host, { attributes: true, attributeFilter: ['data-combat'] });
      if (line) new MutationObserver(() => enc.lines.push([at(), line.textContent])).observe(line, { childList: true, characterData: true, subtree: true });
      const tick = () => {
        enc.frames++;
        if (!enc.done && enc.sampling) {
          const c = window.__riverCarriage(), pose = c.pose, attention = window.__riverPlayerAttention?.();
          enc.samples.push({ t: at(), p: pose ? [pose.position[0], -pose.position[2]] : null, yaw: pose?.yaw ?? null, speed: pose?.speed ?? null, cam: c.camera.position, combat: host.dataset.combat || null,
            feet: attention?.feet?.map(leg => [leg.contact ? 1 : 0, Math.round((leg.error ?? 0) * 1000) / 1000]) ?? null });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.__encPoll = setInterval(() => {
        const m = window.__riverMultiplayer(), actions = m.snapshot?.crime?.actions ?? [], police = m.snapshot?.police;
        const state = hud?.dataset.combatState ? JSON.parse(hud.dataset.combatState) : null;
        if (state?.kind === 'strike' && enc.strikePublishedAt === null) enc.strikePublishedAt = at();
        const mine = actions.find(action => action.kind === 'strike' && action.actorId === m.selfId);
        if (mine && enc.townContactAt === null) enc.townContactAt = at() + (mine.phase === 'windup' ? mine.remainingMs : 0);
        if (enc.hitAt === null && mine?.outcome === 'hit') enc.hitAt = at();
        const telegraph = hud?.dataset.telegraph; if (telegraph && enc.telegraphAt[telegraph] === undefined) enc.telegraphAt[telegraph] = at();
        if (police?.subdued?.includes(m.selfId) && enc.subduedAt === undefined) enc.subduedAt = at();
      }, 16);
    });
    await witness.evaluate(([visitorId, rivalId]) => {
      const at = () => performance.timeOrigin + performance.now();
      const enc = window.__enc = { marks: [], samples: [], frames: 0, framesFrom: at(), strikeAt: null, contactAt: null, flinchAt: null, counterAt: null, grabAt: null, arrestAt: null, surrenderAt: null, officerSeenAt: null, done: false };
      const tick = () => {
        enc.frames++;
        if (!enc.done) {
          const m = window.__riverMultiplayer(), remotes = m.remotes ?? [];
          const visitor = remotes.find(item => item.id === visitorId), rival = remotes.find(item => item.id === rivalId), officer = remotes.find(item => item.id.startsWith('police:') && item.ready);
          if (enc.sampling && visitor) enc.samples.push({ t: at(), p: [visitor.position[0], -visitor.position[2]], heading: visitor.heading, speed: visitor.locomotion?.speed ?? null, combat: visitor.combat, onScreen: visitor.onScreen, feet: visitor.feet?.map(leg => [leg.contact ? 1 : 0, Math.round((leg.error ?? 0) * 1000) / 1000]) ?? null });
          if (visitor?.combat === 'strike') { if (enc.strikeAt === null) enc.strikeAt = at(); if (enc.contactAt === null && visitor.combatProgress >= 300 / 900) enc.contactAt = at(); }
          if (rival?.combat === 'flinch' && enc.flinchAt === null) enc.flinchAt = at();
          if (rival?.combat === 'counter' && enc.counterAt === null) enc.counterAt = at();
          if (officer && enc.officerSeenAt === null) enc.officerSeenAt = at();
          if (remotes.some(item => item.id.startsWith('police:') && item.combat === 'grab') && enc.grabAt === null) enc.grabAt = at();
          if (remotes.some(item => item.id.startsWith('police:') && item.combat === 'arrest') && enc.arrestAt === null) enc.arrestAt = at();
          if (visitor?.combat === 'surrender' && enc.surrenderAt === null) enc.surrenderAt = at();
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, [visitorId, RIVAL]);

    // 1. Movement, recorded on both screens. The visitor stands 22 m east of the rival, in the lane,
    // facing west; the witness stands 10 m east and 5 m south, facing the stretch the visitor walks.
    await goTo(visitor, RX + 22, RN); await face(visitor, RX, RN); await thirdPerson(visitor);
    const witnessSpot = await goTo(witness, RX + 10, RN - 5); await face(witness, RX + 15, RN); await firstPerson(witness);
    check(witnessSpot?.ok !== false, 'The witness reaches the lane and faces the stretch the visitor walks');
    await visitor.waitForTimeout(800);
    await visitor.evaluate(() => { window.__enc.sampling = true; }); await witness.evaluate(() => { window.__enc.sampling = true; });
    await shoot(visitor, 'lane-visitor'); await shoot(witness, 'lane-witness');
    await hold(visitor, ['KeyW'], 2500, 'walk');
    await visitor.waitForTimeout(900);
    await hold(visitor, ['ShiftLeft', 'KeyW'], 1800, 'sprint');
    await visitor.waitForTimeout(900);
    await hold(visitor, ['ArrowLeft'], 1000, 'turn');
    await visitor.waitForTimeout(500);
    await hold(visitor, ['KeyD'], 1500, 'strafe');
    await visitor.waitForTimeout(600);
    await hold(visitor, ['KeyS'], 1200, 'back');
    await visitor.waitForTimeout(900);
    await visitor.evaluate(() => { window.__enc.sampling = false; }); await witness.evaluate(() => { window.__enc.sampling = false; });
    const motion = await visitor.evaluate(() => {
      const { samples, marks } = window.__enc, t = label => marks.find(([, name]) => name === label)?.[0];
      const between = (a, b) => samples.filter(s => s.t >= a && s.t <= b && s.p);
      const first = (list, test) => list.find(test);
      // Each window ends before the next key goes down (the pauses between holds are at least 900 ms).
      const walk = between(t('walk:down'), t('walk:up') + 850), sprint = between(t('sprint:down'), t('sprint:up') + 850), turn = between(t('turn:down'), t('turn:up')), strafe = between(t('strafe:down'), t('strafe:up')), back = between(t('back:down'), t('back:up'));
      const peak = list => Math.max(...list.map(s => s.speed));
      const reach = (list, from, fraction) => { const top = peak(list), hit = first(list, s => s.speed >= top * fraction); return hit ? Math.round(hit.t - from) : null; };
      const stop = (list, from) => { const after = list.filter(s => s.t >= from), hit = first(after, s => s.speed < 0.05); return hit ? Math.round(hit.t - from) : null; };
      const yawTurn = turn.length > 1 ? Math.abs(turn.at(-1).yaw - turn[0].yaw) : null;
      // Strafe: the travel direction against the body yaw (feet follow travel, body keeps facing).
      const travel = list => { const a = list[0], b = list.at(-1); return a && b && distance(a.p, b.p) > 0.3 ? Math.atan2(b.p[0] - a.p[0], b.p[1] - a.p[1]) : null; };
      function distance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
      const strafeTravel = travel(strafe), bodyYaw = strafe[0]?.yaw ?? null;
      // yaw is atan2(east, -north) of the forward direction; travel heading here is atan2(dEast, dNorth).
      const forwardOf = yaw => Math.atan2(Math.sin(yaw), -Math.cos(yaw));
      const angle = (a, b) => a === null || b === null ? null : Math.round(Math.abs(((a - b + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * 180 / Math.PI);
      const jumps = list => { let worst = 0; for (let i = 1; i < list.length; i++) { const d = distance(list[i].p, list[i - 1].p), dt = (list[i].t - list[i - 1].t) / 1000; if (dt > 0 && dt < 0.25) worst = Math.max(worst, d / dt); } return Math.round(worst * 100) / 100; };
      const camJumps = list => { let worst = 0; for (let i = 1; i < list.length; i++) { const a = list[i].cam, b = list[i - 1].cam, d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), dt = (list[i].t - list[i - 1].t) / 1000; if (dt > 0 && dt < 0.25) worst = Math.max(worst, d / dt); } return Math.round(worst * 100) / 100; };
      const moving = samples.filter(s => s.speed > 0.3 && s.feet), planted = moving.filter(s => s.feet.some(([contact]) => contact)).length, airborne = moving.filter(s => s.feet.every(([contact]) => !contact)).length;
      const footError = Math.max(0, ...samples.flatMap(s => s.feet?.map(([, error]) => error) ?? []));
      const frameGaps = []; for (let i = 1; i < samples.length; i++) frameGaps.push(samples[i].t - samples[i - 1].t);
      frameGaps.sort((a, b) => a - b);
      return { samples: samples.length, frameMsP50: Math.round(frameGaps[Math.floor(frameGaps.length / 2)] ?? 0), frameMsP95: Math.round(frameGaps[Math.floor(frameGaps.length * .95)] ?? 0),
        walk: { peakSpeed: Math.round(peak(walk) * 100) / 100, msTo90Percent: reach(walk, t('walk:down'), .9), msToStop: stop(walk, t('walk:up')) },
        sprint: { peakSpeed: Math.round(peak(sprint) * 100) / 100, msTo90Percent: reach(sprint, t('sprint:down'), .9), msToStop: stop(sprint, t('sprint:up')) },
        turn: { degrees: yawTurn === null ? null : Math.round(yawTurn * 180 / Math.PI), seconds: turn.length > 1 ? Math.round((turn.at(-1).t - turn[0].t)) / 1000 : null },
        strafe: { peakSpeed: Math.round(peak(strafe) * 100) / 100, travelVersusBodyDegrees: angle(strafeTravel, bodyYaw === null ? null : forwardOf(bodyYaw)), bodyYawChangeDegrees: strafe.length > 1 ? Math.round(Math.abs(strafe.at(-1).yaw - strafe[0].yaw) * 180 / Math.PI) : null },
        back: { peakSpeed: Math.round(peak(back) * 100) / 100, bodyYawChangeDegrees: back.length > 1 ? Math.round(Math.abs(back.at(-1).yaw - back[0].yaw) * 180 / Math.PI) : null },
        continuity: { worstFigureMetresPerSecondBetweenFrames: jumps(samples.filter(s => s.p)), worstCameraMetresPerSecondBetweenFrames: camJumps(samples) },
        feet: { movingFrames: moving.length, framesWithAFootPlanted: planted, framesWithNoFootPlanted: airborne, worstIkErrorMetres: Math.round(footError * 1000) / 1000 } };
    });
    const peerMotion = await witness.evaluate(() => {
      const { samples } = window.__enc; const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      let worst = 0, stalls = 0, movingFrames = 0; const speeds = [];
      for (let i = 1; i < samples.length; i++) { const dt = (samples[i].t - samples[i - 1].t) / 1000, step = d(samples[i].p, samples[i - 1].p); if (dt <= 0 || dt > 0.25) continue; const v = step / dt; speeds.push(v); worst = Math.max(worst, v); if (samples[i].speed > 0.3) { movingFrames++; if (step < 0.001) stalls++; } }
      const moving = samples.filter(s => s.speed > 0.3 && s.feet), planted = moving.filter(s => s.feet.some(([contact]) => contact)).length;
      const onScreen = samples.filter(s => s.onScreen).length;
      return { samples: samples.length, onScreenFrames: onScreen, worstMetresPerSecondBetweenFrames: Math.round(worst * 100) / 100, movingFrames, frozenFramesWhileMoving: stalls, framesWithAFootPlanted: planted, movingFramesWithFeet: moving.length,
        peakDrawnSpeed: Math.round(Math.max(0, ...speeds) * 100) / 100 };
    });
    check(motion.walk.peakSpeed > 1.2 && motion.walk.peakSpeed < 2.2 && motion.sprint.peakSpeed > motion.walk.peakSpeed, `Walk then sprint on the local figure: ${motion.walk.peakSpeed} then ${motion.sprint.peakSpeed} m/s (town budget 1.65 / 3.2) ${JSON.stringify(motion)}`);
    check(motion.walk.msToStop !== null && motion.sprint.msToStop !== null, `The figure stops after the key is released (walk ${motion.walk.msToStop} ms, sprint ${motion.sprint.msToStop} ms)`);
    check(motion.turn.degrees > 30, `A held turn key turns the body (${motion.turn.degrees}° in ${motion.turn.seconds} s)`);
    check(motion.strafe.peakSpeed > 0.5 && motion.strafe.bodyYawChangeDegrees < 15, `Strafing moves the figure (${motion.strafe.peakSpeed} m/s) sideways of the body (travel ${motion.strafe.travelVersusBodyDegrees}° off the facing) without turning it (${motion.strafe.bodyYawChangeDegrees}°)`);
    check(motion.back.peakSpeed > 0.5 && motion.back.bodyYawChangeDegrees < 15, `Backing up keeps the facing (${motion.back.bodyYawChangeDegrees}°)`);
    check(motion.continuity.worstFigureMetresPerSecondBetweenFrames < 8 && motion.continuity.worstCameraMetresPerSecondBetweenFrames < 12, `No figure or camera jump between frames (worst ${motion.continuity.worstFigureMetresPerSecondBetweenFrames} and ${motion.continuity.worstCameraMetresPerSecondBetweenFrames} m/s)`);
    check(peerMotion.onScreenFrames > peerMotion.samples * .8 && peerMotion.frozenFramesWhileMoving < peerMotion.movingFrames * .2, `The witness kept the visitor on screen (${peerMotion.onScreenFrames} of ${peerMotion.samples} frames) and saw them move without freezing (${peerMotion.frozenFramesWhileMoving} frozen of ${peerMotion.movingFrames} moving frames)`);
    row('movement', 'pass', { local: motion, peer: peerMotion });
    await shoot(visitor, 'after-movement-visitor'); await shoot(witness, 'after-movement-witness');

    // 2. The fight: the keyboard strike with stamps on both screens, the rival's counter, U.
    const arrived = await approach(visitor, [RX, RN], 1.5);
    check(arrived, 'The visitor arrives within arm\'s reach of the service lane rival');
    await face(visitor, RX, RN);
    await goTo(witness, RX + 4, RN - 3); await face(witness, RX, RN);
    const hud = visitor.getByRole('region', { name: 'Danger and wanted level' });
    await hud.getByRole('button', { name: 'Shove Service lane rival T' }).waitFor();
    // The keyboard strike with stamps on both screens; the rival's counter; U.
    await visitor.locator('#canvas-host').focus();
    await visitor.evaluate(() => { window.__enc.lines = []; window.__enc.keyAt = performance.timeOrigin + performance.now(); window.__enc.strikePublishedAt = null; window.__enc.poseAt = null; window.__enc.townContactAt = null; window.__enc.hitAt = null; });
    await witness.evaluate(() => { window.__enc.strikeAt = null; window.__enc.contactAt = null; window.__enc.flinchAt = null; });
    await visitor.keyboard.press('KeyT');
    await shoot(visitor, 'strike-visitor');
    await witness.waitForFunction(() => window.__enc.strikeAt !== null, null, { timeout: 1500 }).catch(() => {});
    await shoot(witness, 'strike-witness');
    const landed = await visitor.waitForFunction(() => window.__enc.lines.some(([, text]) => text.startsWith('Hit landed.')), null, { timeout: 6000 }).then(() => true).catch(() => false);
    const afterStrike = await town(visitor);
    check(landed && afterStrike.rival.health === 75 && stars(afterStrike) === 1, `The keyboard strike lands at contact: 25 damage and one star (health ${afterStrike.rival.health}, stars ${stars(afterStrike)})`);
    await visitor.waitForFunction(() => window.__enc.lines.some(([, text]) => /winding up to strike back/.test(text)), null, { timeout: 15000 });
    await shoot(visitor, 'counter-visitor'); await shoot(witness, 'counter-witness');
    let counterEvaded = null; const counterAttempts = [];
    for (let attempt = 0; attempt < 3 && !counterEvaded; attempt++) {
      const result = await evadeAt(visitor, 'counter');
      if (!result.pressed) { counterAttempts.push(result); if (result.id) await visitor.waitForFunction(id => window.__riverMultiplayer().snapshot?.crime?.actions?.find(item => item.id === id && item.outcome !== null), result.id).catch(() => {}); continue; }
      const outcome = await visitor.waitForFunction(id => window.__riverMultiplayer().snapshot?.crime?.actions?.find(item => item.id === id && item.outcome !== null)?.outcome, result.id).then(handle => handle.jsonValue());
      counterAttempts.push({ ...result, outcome });
      if (outcome === 'evaded') counterEvaded = result;
    }
    check(counterEvaded, `A timed evade (U) beats the rival's counter: ${JSON.stringify(counterAttempts)}`);
    await shoot(visitor, 'evade-visitor');
    // Step out of the rival's 3 m so it disengages; the officer, already dispatched by the stars,
    // follows and offers surrender for 4 s, then telegraphs a grab. The first grab is evaded with U;
    // the second is allowed to land: resisted capture.
    await goTo(visitor, RX + 5, RN + 2);
    await face(witness, RX + 5, RN + 2);
    const pursued = await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.police.units.some(unit => unit.targetId === m.selfId && ['pursue', 'grab'].includes(unit.state)); }, null, { timeout: 15000 }).then(() => true).catch(() => false);
    check(pursued, 'An officer pursues the wanted visitor');
    await hud.getByText(/Police are approaching|reaching to grab/).waitFor({ timeout: 15000 });
    await witness.waitForFunction(() => window.__enc.officerSeenAt !== null, null, { timeout: 15000 });
    check(true, 'The witness sees the officer as a figure');
    await shoot(visitor, 'pursuit-visitor'); await shoot(witness, 'pursuit-witness');
    const firstGrab = await evadeAt(visitor, 'grab');
    let grabEvaded = false;
    if (firstGrab.pressed) {
      const settled = await visitor.waitForFunction(id => { const m = window.__riverMultiplayer(), unit = m.snapshot.police.units.find(unit => unit.id === id); return unit && unit.state !== 'grab' && { state: unit.state, subdued: m.snapshot.police.subdued.includes(m.selfId) }; }, firstGrab.id, { timeout: 5000 }).then(handle => handle.jsonValue()).catch(() => null);
      grabEvaded = Boolean(settled && !settled.subdued);
      row('grab evaded (U at contact)', grabEvaded ? 'pass' : 'fail', { firstGrab, settled });
    } else row('grab evaded (U at contact)', 'not-run', { firstGrab, reason: firstGrab.seen === null ? 'no grab telegraph seen within 25 s' : 'the telegraph was seen too late to time the key' });
    // A telegraph seen too late to time the key is a not-run row above, not a passing check (review of #732).
    if (grabEvaded || !firstGrab.late) check(grabEvaded, `The telegraphed grab is avoidable: ${JSON.stringify(firstGrab)}`);
    await shoot(visitor, 'grab-visitor'); await shoot(witness, 'grab-witness');
    // Now stand still and let the next grab land.
    const subdued = await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.police.subdued.includes(m.selfId); }, null, { timeout: 30000 }).then(() => true).catch(() => false);
    check(subdued, 'A grab that lands takes hold of the visitor (resisted capture)');
    await hud.getByText(/An officer has hold of you|Arrest in progress/).waitFor({ timeout: 5000 });
    await shoot(visitor, 'subdued-visitor'); await shoot(witness, 'subdued-witness');
    await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return !m.snapshot.crime.wanted.some(([id]) => id === m.selfId); }, null, { timeout: 15000 });
    const freed = await town(visitor);
    check(distance(freed.self.position, [RX, RN]) > 10 && freed.self.health === 100, `Arrest returns the visitor to the safe arrival (${distance(freed.self.position, [RX, RN]).toFixed(0)} m away) with full health`);
    await visitor.waitForFunction(() => !document.querySelector('.crime-hud').dataset.combatState && document.querySelector('#canvas-host').dataset.combat === '' && !document.querySelectorAll('[data-walk-key].held').length, null, { timeout: 5000 });
    check(true, 'Combat framing exits after the capture: nothing published, no held input');
    const stamps1 = await visitor.evaluate(() => ({ ...window.__enc, samples: undefined, marks: undefined, lines: undefined }));
    const peer1 = await witness.evaluate(() => ({ ...window.__enc, samples: undefined }));
    row('fight and resisted capture', 'pass', { visitor: { inputToPublishedMs: ms(stamps1.strikePublishedAt, stamps1.keyAt), inputToPoseMs: ms(stamps1.poseAt, stamps1.keyAt), inputToHitSnapshotMs: ms(stamps1.hitAt, stamps1.keyAt), hitSnapshotAfterTownContactMs: ms(stamps1.hitAt, stamps1.townContactAt), counterTelegraphAfterHitMs: ms(stamps1.telegraphAt.counter, stamps1.hitAt), evadeKeyToPoseMs: ms(stamps1.evadePoseAt, stamps1.evadeKeyAt.counter), grabTelegraphShownAt: stamps1.telegraphAt.grab ?? null, subduedAfterGrabTelegraphMs: ms(stamps1.subduedAt, stamps1.telegraphAt.grab) },
      witness: { strikeShownAfterKeyMs: ms(peer1.strikeAt, stamps1.keyAt), contactShownAfterTownContactMs: ms(peer1.contactAt, stamps1.townContactAt), flinchAfterTownContactMs: ms(peer1.flinchAt, stamps1.townContactAt), counterShownAfterVisitorTelegraphMs: ms(peer1.counterAt, stamps1.telegraphAt.counter), grabShownAfterVisitorTelegraphMs: ms(peer1.grabAt, stamps1.telegraphAt.grab), arrestShown: peer1.arrestAt !== null } });

    // 3. A resident reacts, then emergency off mid-pursuit. Back to the lane, one more strike (the
    // rival is hurt, not down), then straight to the nearest outdoor resident, wanted.
    check(await approach(visitor, [RX, RN], 1.5), 'The visitor walks back to the rival');
    await goTo(witness, RX + 4, RN - 3); await face(witness, RX, RN);
    await hud.getByRole('button', { name: 'Shove Service lane rival T' }).waitFor();
    await visitor.locator('#canvas-host').focus(); await visitor.keyboard.press('KeyT');
    await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.crime.wanted.some(([id, stars]) => id === m.selfId && stars >= 1); });
    const state3 = await town(visitor);
    const candidates = state3.locals.filter(local => !local.indoor && local.life && local.life.reaction === null && ['walking', 'resting', 'turning'].includes(local.life.status))
      .sort((a, b) => distance(a.position, state3.self.position) - distance(b.position, state3.self.position)).slice(0, 3);
    let reacted = null, reactedPeer = null, drawnStartle = null;
    for (const candidate of candidates) {
      const where = await approach(visitor, candidate.position, 4);
      if (!where) continue;
      await face(witness, candidate.position[0], candidate.position[1]);
      const startled = await visitor.waitForFunction(id => { const local = window.__riverMultiplayer().snapshot.locals.find(item => item.id === id); return local?.life?.reaction === 'startle' && local; }, candidate.id, { timeout: 8000 }).then(handle => handle.jsonValue()).catch(() => null);
      if (!startled) continue;
      // What the witness's screen draws while the town says startle (review of #732: drawn was recorded, never checked).
      drawnStartle = await witness.waitForFunction(id => { const figure = window.__riverMultiplayer().remotes.find(item => item.id === `resident:${id}`);
        return figure?.gesture === 'startle' && { gesture: figure.gesture, ready: figure.ready }; }, candidate.id, { timeout: 900 }).then(handle => handle.jsonValue()).catch(() => null);
      const running = await visitor.waitForFunction(id => { const local = window.__riverMultiplayer().snapshot.locals.find(item => item.id === id); return local?.life?.reaction === 'flee' && local.life.speed > 1.4 && local; }, candidate.id, { timeout: 12000 }).then(handle => handle.jsonValue()).catch(() => null);
      reactedPeer = await witness.evaluate(id => { const local = window.__riverMultiplayer().snapshot.locals.find(item => item.id === id); return { reaction: local?.life?.reaction, drawn: window.__riverMultiplayer().remotes.find(item => item.id === `resident:${id}`)?.gesture ?? null }; }, candidate.id);
      reacted = { id: candidate.id, name: candidate.name, distanceFromVisitor: Math.round(distance(startled.position, where) * 10) / 10, fled: running ? Math.round(running.life.speed * 100) / 100 : null };
      break;
    }
    if (reacted) { row('civilian reaction', 'pass', { ...reacted, witness: reactedPeer, drawnStartle }); await shoot(visitor, 'resident-visitor'); await shoot(witness, 'resident-witness'); }
    else row('civilian reaction', 'fail', { candidates: candidates.map(local => ({ id: local.id, distance: Math.round(distance(local.position, state3.self.position)) })) });
    check(reacted, `A resident startles and runs from the wanted visitor: ${reacted?.name}`);
    check(drawnStartle, `The witness's screen draws the resident startled: ${JSON.stringify(drawnStartle)}`);
    // Emergency off while the officer is on the visitor: back within sight of the lane post first
    // (the resident may stand beyond the 35 m an officer sees from it).
    await goTo(visitor, RX + 6, RN + 2); await face(witness, RX + 6, RN + 2);
    const midPursuit = await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.police.units.find(unit => unit.targetId === m.selfId && ['pursue', 'grab', 'arrest'].includes(unit.state))?.state ?? null; }, null, { timeout: 15000 }).then(handle => handle.jsonValue()).catch(() => null);
    const starsBeforeOff = stars(await town(visitor));
    await emergencyOff();
    // The HUD's "Nobody can be harmed" line is shown beside a rival; here the visitor stands by a resident, so the town's state is the proof.
    await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return !m.snapshot.police.units.some(unit => unit.targetId === m.selfId) && !m.snapshot.police.subdued.includes(m.selfId) && !m.snapshot.crime.actions.some(action => action.outcome === null); }, null, { timeout: 5000 });
    await visitor.waitForFunction(() => document.querySelector('#canvas-host').dataset.combat === '' && !document.querySelectorAll('[data-walk-key].held').length, null, { timeout: 5000 });
    const afterOff = await town(visitor);
    // The visitor walks under their own key: the proof that no movement hold is left.
    await visitor.locator('#canvas-host').focus(); await visitor.keyboard.down('KeyW');
    const walkedAfterOff = await visitor.waitForFunction(() => window.__riverCarriage().pose.speed > 0.3, null, { timeout: 2000 }).then(() => true).catch(() => false);
    await visitor.keyboard.up('KeyW');
    const detail = { duringState: midPursuit, starsBeforeOff, starsAfterOff: stars(afterOff), walkedAfterOff, unitsOnVisitor: afterOff.police.units.filter(unit => unit.targetId === afterOff.selfId).map(unit => unit.state), subdued: afterOff.police.subdued.includes(afterOff.selfId) };
    check(midPursuit && walkedAfterOff && stars(afterOff) === starsBeforeOff, `Emergency off during ${midPursuit}: the officer stands down, every hold is released, the visitor walks again and earned stars stay (${JSON.stringify(detail)})`);
    row('policy off mid-pursuit (browser)', 'pass', detail);
    await shoot(visitor, 'after-off-visitor'); await shoot(witness, 'after-off-witness');

    // 4. Reconnect and focus loss mid-pursuit, then voluntary surrender.
    await rulesOn();
    check(await approach(visitor, [RX, RN], 1.5), 'The visitor walks back to the rival once more');
    await goTo(witness, RX + 4, RN - 3); await face(witness, RX, RN);
    await hud.getByRole('button', { name: 'Shove Service lane rival T' }).waitFor();
    const starsBefore4 = stars(await town(visitor));
    await visitor.locator('#canvas-host').focus(); await visitor.keyboard.press('KeyT');
    await visitor.waitForFunction(before => { const m = window.__riverMultiplayer(); return (m.snapshot.crime.wanted.find(([id]) => id === m.selfId)?.[1] ?? 0) > before; }, starsBefore4, { timeout: 6000 });
    // Exactly once, while still in reach: a raw duplicate attack and a stale evade through the
    // development command hook, as a modified client could send them.
    // Past the strike's 0.9 s cooldown and the rival's first counter (contact 1.45 s after the hit, 0.6 s stagger).
    await visitor.waitForTimeout(2200);
    const healthBeforeDuplicate = (await town(visitor)).rival.health, starsBeforeDuplicate = stars(await town(visitor));
    const duplicate = await visitor.evaluate(async id => { const send = message => window.__riverMultiplayerCommand(message);
      const first = await send({ type: 'attack', targetId: id, attackKind: 'melee', attackId: 'encounter-dup-00000001' });
      const second = await send({ type: 'attack', targetId: id, attackKind: 'melee', attackId: 'encounter-dup-00000001' });
      await new Promise(resolve => setTimeout(resolve, 1100));
      const late = await send({ type: 'attack', targetId: id, attackKind: 'melee', attackId: 'encounter-dup-00000001' });
      return { first: { ok: first?.ok, error: first?.error ?? null, phase: first?.action?.phase, replayed: Boolean(first?.replayed) }, second: { ok: second?.ok, replayed: Boolean(second?.replayed), id: second?.action?.id, firstId: first?.action?.id }, late: { ok: late?.ok, replayed: Boolean(late?.replayed), outcome: late?.action?.outcome, id: late?.action?.id } }; }, RIVAL);
    const afterDuplicate = await town(visitor);
    const damage = duplicate.late.outcome === 'hit' ? 25 : 0;
    check(duplicate.first.ok && duplicate.first.phase === 'windup' && !duplicate.first.replayed && duplicate.second.replayed && duplicate.second.id === duplicate.second.firstId && duplicate.late.replayed && duplicate.late.outcome !== null,
      `A repeated attack ID returns the same action every time, never a second strike (${JSON.stringify(duplicate)})`);
    check(afterDuplicate.rival.health === healthBeforeDuplicate - damage && stars(afterDuplicate) === starsBeforeDuplicate + (damage ? 1 : 0), `Three sends of one attack ID: at most one ${duplicate.late.outcome} (health ${healthBeforeDuplicate} → ${afterDuplicate.rival.health}, stars ${starsBeforeDuplicate} → ${stars(afterDuplicate)})`);
    const stale = await visitor.evaluate(async () => { const send = message => window.__riverMultiplayerCommand(message);
      const first = await send({ type: 'evade', evadeId: 'encounter-stale-0001' }); await new Promise(resolve => setTimeout(resolve, 900));
      const again = await send({ type: 'evade', evadeId: 'encounter-stale-0001' });
      return { first: { ok: first?.ok, error: first?.error ?? null, remainingMs: first?.evade?.remainingMs ?? null }, again: { ok: again?.ok, replayed: Boolean(again?.replayed), remainingMs: again?.evade?.remainingMs ?? null } }; });
    check(stale.first.ok && stale.again.replayed, `A repeated evade ID replays without a new window (${JSON.stringify(stale)})`);
    row('exactly-once (browser, raw commands)', 'pass', { duplicate, stale });
    await goTo(visitor, RX + 5, RN + 2);
    await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.police.units.some(unit => unit.targetId === m.selfId && unit.state === 'pursue'); }, null, { timeout: 15000 });
    const before = await town(visitor);
    const dropped = await visitor.evaluate(() => { const c = window.__riverConnection; const droppedAt = performance.timeOrigin + performance.now(); return { dropped: c.drop({ code: 1006, reason: 'journey' }), droppedAt }; });
    const reconnected = await visitor.waitForFunction(() => window.__riverConnection.state().connected && window.__riverMultiplayer().connected, null, { timeout: 20000 }).then(() => true).catch(() => false);
    const reconnectedAt = await visitor.evaluate(() => performance.timeOrigin + performance.now());
    const after = await town(visitor);
    check(dropped.dropped && reconnected && after.selfId === before.selfId && stars(after) === stars(before), `The socket dropped mid-pursuit and came back in ${ms(reconnectedAt, dropped.droppedAt)} ms with the same identity and stars (${stars(after)})`);
    const pursuedAgain = await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.police.units.find(unit => unit.targetId === m.selfId)?.state ?? null; }, null, { timeout: 15000 }).then(handle => handle.jsonValue()).catch(() => null);
    check(pursuedAgain, `The pursuit continues after the reconnect (officer ${pursuedAgain})`);
    row('reconnect mid-pursuit (browser)', 'pass', { reconnectMs: ms(reconnectedAt, dropped.droppedAt), starsBefore: stars(before), starsAfter: stars(after), officerAfter: pursuedAgain });
    // Focus loss with a walk key held: the window blurs, the key is released, the figure stops.
    await visitor.locator('#canvas-host').focus(); await visitor.keyboard.down('KeyW');
    await visitor.waitForTimeout(350);
    const movingSpeed = await visitor.evaluate(() => window.__riverCarriage().pose.speed);
    await visitor.evaluate(() => { window.dispatchEvent(new Event('blur')); document.querySelector('#canvas-host').dispatchEvent(new Event('blur')); });
    const stopped = await visitor.waitForFunction(() => window.__riverCarriage().pose.speed < 0.05 && !document.querySelectorAll('[data-walk-key].held').length, null, { timeout: 2000 }).then(() => true).catch(() => false);
    const stoppedSpeed = await visitor.evaluate(() => window.__riverCarriage().pose.speed);
    await visitor.keyboard.up('KeyW');
    check(movingSpeed > 0.3 && stopped, `Losing window focus with W held releases the key and stops the figure (${movingSpeed.toFixed(2)} → ${stoppedSpeed.toFixed(2)} m/s)`);
    row('focus loss with a held key (browser)', 'pass', { movingSpeed: Math.round(movingSpeed * 100) / 100, stoppedSpeed: Math.round(stoppedSpeed * 100) / 100 });
    // Surrender by keyboard.
    const surrender = hud.getByRole('button', { name: 'Surrender', exact: true });
    await surrender.waitFor({ timeout: 10000 });
    await surrender.focus(); await visitor.keyboard.press('Enter');
    await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.police.surrendered.includes(m.selfId); }, null, { timeout: 5000 });
    await visitor.waitForFunction(() => document.querySelector('#canvas-host').dataset.combat === 'surrender', null, { timeout: 5000 });
    await shoot(visitor, 'surrender-visitor'); await shoot(witness, 'surrender-witness');
    await witness.waitForFunction(() => window.__enc.surrenderAt !== null, null, { timeout: 5000 }).catch(() => {});
    await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return !m.snapshot.crime.wanted.some(([id]) => id === m.selfId); }, null, { timeout: 15000 });
    await hud.getByText('You are no longer wanted. You may move again.', { exact: true }).waitFor();
    await visitor.waitForFunction(() => !document.querySelector('.crime-hud').dataset.combatState && document.querySelector('#canvas-host').dataset.combat === '', null, { timeout: 5000 });
    const final = await town(visitor);
    check(distance(final.self.position, [RX, RN]) > 10 && final.self.health === 100, 'Voluntary surrender ends in the same safe recovery');
    const peer4 = await witness.evaluate(() => ({ surrenderShown: window.__enc.surrenderAt !== null, arrestShown: window.__enc.arrestAt !== null }));
    row('voluntary surrender (browser)', 'pass', { witness: peer4 });

    // 5. Boundary transitions inside a windup, and stars under observation. Travel is a server-side
    // move that lands at once, so a strike can be started on the keyboard and the town asked to
    // move the player out of the danger zone before the 300 ms contact recheck.
    await visitor.waitForFunction(id => { const r = window.__riverMultiplayer().snapshot.crime.targets.find(item => item.id === id); return r && r.health > 0 && !r.down; }, RIVAL, { timeout: 30000 });
    const arrived5 = await approach(visitor, [RX, RN], 1.5);
    check(arrived5, 'The visitor walks back to the rival a third time');
    await face(visitor, RX, RN);
    await hud.getByRole('button', { name: 'Shove Service lane rival T' }).waitFor();
    const safeSpot = [Math.round(final.self.position[0]), Math.round(final.self.position[1])];
    const beforeZone = await town(visitor);
    await visitor.waitForTimeout(1100); // past the travel cooldown of the approach (run 9: travel_cooldown)
    await visitor.locator('#canvas-host').focus();
    await visitor.keyboard.press('KeyT');
    const zoneTravel = await visitor.evaluate(async spot => { const t0 = performance.now(); const reply = await window.__riverMultiplayerCommand({ type: 'travel', position: spot }); return { ok: reply?.ok, error: reply?.error ?? null, replyMs: Math.round(performance.now() - t0) }; }, safeSpot);
    await visitor.waitForTimeout(1500);
    const afterZone = await town(visitor);
    const zoneStrike = [...afterZone.actions].reverse().find(action => action.kind === 'strike' && action.actorId === afterZone.selfId);
    const zoneDetail = { travel: zoneTravel, strike: zoneStrike && { id: zoneStrike.id, outcome: zoneStrike.outcome, reason: zoneStrike.reason ?? null }, rivalHealth: [beforeZone.rival.health, afterZone.rival.health], stars: [stars(beforeZone), stars(afterZone)], distanceFromRival: Math.round(distance(afterZone.self.position, [RX, RN])), combat: await visitor.evaluate(() => document.querySelector('#canvas-host').dataset.combat ?? ''), held: await visitor.locator('[data-walk-key].held').count() };
    console.log(`crime-encounter zone-in-windup: ${JSON.stringify(zoneDetail)}`);
    if (zoneTravel.ok) {
      check(zoneStrike && zoneStrike.outcome !== 'hit' && afterZone.rival.health === beforeZone.rival.health && stars(afterZone) === stars(beforeZone) && zoneDetail.distanceFromRival > 10 && zoneDetail.combat === '' && zoneDetail.held === 0,
        `Leaving the danger zone inside the windup cancels the strike at contact: nothing lands, no star, nothing held (${JSON.stringify(zoneDetail)})`);
      row('safe-zone transition during windup (browser)', 'pass', zoneDetail);
    } else row('safe-zone transition during windup (browser)', 'not-run', { reason: `the town refused travel during the windup: ${zoneTravel.error}`, ...zoneDetail });
    await shoot(visitor, 'zone-visitor');

    // Stars under observation: wanted, pursued and evading every grab for longer than the 30 s
    // decay, the star stays; out of the zone and out of sight it cools off on the decay clock.
    const arrived6 = await approach(visitor, [RX, RN], 1.5);
    check(arrived6, 'The visitor walks back to the rival a fourth time');
    await face(visitor, RX, RN);
    await hud.getByRole('button', { name: 'Shove Service lane rival T' }).waitFor();
    const starsBeforeWatch = stars(await town(visitor));
    await visitor.locator('#canvas-host').focus(); await visitor.keyboard.press('KeyT');
    await visitor.waitForFunction(before => { const m = window.__riverMultiplayer(); return (m.snapshot.crime.wanted.find(([id]) => id === m.selfId)?.[1] ?? 0) > before; }, starsBeforeWatch, { timeout: 6000 });
    const watchedFrom = Date.now(), starsWatched = stars(await town(visitor));
    const stepBack = await goTo(visitor, RX + 5, RN + 2); await face(witness, RX + 5, RN + 2);
    const stepped = await town(visitor);
    check(stepBack?.ok !== false && distance(stepped.self.position, [RX, RN]) > 4, `The visitor steps out of the rival's reach to be watched (${JSON.stringify({ stepBack, distance: Math.round(distance(stepped.self.position, [RX, RN]) * 10) / 10 })})`);
    await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.police.units.some(unit => unit.targetId === m.selfId); }, null, { timeout: 20000 });
    const grabs = [];
    while (Date.now() - watchedFrom < 36000) {
      const grab = await evadeAt(visitor, 'grab');
      grabs.push(grab);
      if (grab.seen === null) break;
      // Let this grab resolve before looking for the next, then see whether it took hold.
      await visitor.waitForFunction(id => { const m = window.__riverMultiplayer(), unit = m.snapshot.police.units.find(unit => unit.id === id); return !unit || unit.state !== 'grab'; }, grab.id, { timeout: 3000 }).catch(() => {});
      const state = await town(visitor);
      grab.resolved = { subdued: state.police.subdued.includes(state.selfId), stars: stars(state), health: state.self.health };
      if (grab.resolved.subdued) break;
    }
    const watched = await town(visitor);
    console.log(`crime-encounter watched: ${JSON.stringify({ starsWatched, grabs })}`);
    const watchDetail = { starsAtStrike: starsWatched, starsAfterMs: Date.now() - watchedFrom, starsAfter: stars(watched), grabsEvaded: grabs.filter(g => g.pressed).length, grabs, observedBy: watched.police.units.filter(unit => unit.targetId === watched.selfId).map(unit => unit.state), subdued: watched.police.subdued.includes(watched.selfId) };
    check(watchDetail.starsAfterMs >= 36000 && !watchDetail.subdued && watchDetail.observedBy.length > 0 && watchDetail.starsAfter === starsWatched,
      `Stars do not cool off under observation: ${starsWatched} star after ${Math.round(watchDetail.starsAfterMs / 1000)} s of pursuit and ${watchDetail.grabsEvaded} evaded grabs (${JSON.stringify(watchDetail)})`);
    await shoot(visitor, 'watched-visitor'); await shoot(witness, 'watched-witness');
    await goTo(visitor, safeSpot[0], safeSpot[1]);
    const leftAt = Date.now();
    await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return !m.snapshot.police.units.some(unit => unit.targetId === m.selfId); }, null, { timeout: 10000 });
    await visitor.waitForTimeout(15000);
    const midway = stars(await town(visitor));
    const cooled = await visitor.waitForFunction(before => { const m = window.__riverMultiplayer(); return (m.snapshot.crime.wanted.find(([id]) => id === m.selfId)?.[1] ?? 0) < before; }, starsWatched, { timeout: 40000 }).then(() => Date.now() - leftAt).catch(() => null);
    const coolDetail = { starsAt15s: midway, cooledAfterMs: cooled, starsNow: stars(await town(visitor)) };
    check(midway === starsWatched && cooled !== null && cooled >= 20000 && cooled <= 45000, `Out of the zone and out of sight the star cools off on the 30 s clock (${JSON.stringify(coolDetail)})`);
    row('stars held under observation (browser)', 'pass', { ...watchDetail, cooling: coolDetail });

    // Rows a browser cannot show. The lane and Westcreek contain no sight-blocking geometry
    // (preview walking environment probe: 0 of 27,200 and 0 of 19,320 free points hidden from the
    // officer post; no blocked pair), so search after sight loss and escape by concealment have
    // server proof only. Flight belongs to one owner's appearance (canFlyAs), so a development
    // identity cannot change altitude inside a windup: a raw move with altitude is refused as
    // flight_not_allowed. Writer takeover needs a second world process and a switching proxy in
    // front of the page: crime-takeover-runner.js stages it, with search and the airborne windup.
    row('perception-led search after sight loss (browser)', 'not-run', { reason: 'not staged in this journey: preview/e2e/crime-takeover.js shows search after sight loss by distance; escape by concealment needs a sight-blocking prop in the lane' });
    row('altitude transition during windup (browser)', 'not-run', { reason: 'flight is refused for development identities (canFlyAs); preview/e2e/crime-takeover.js shows it with the owner fixture identity' });
    row('writer takeover mid-pursuit (browser)', 'not-run', { reason: 'needs two world processes behind a switching proxy: preview/e2e/crime-takeover-runner.js (pnpm run test:crime:takeover) runs it' });

    await emergencyOff();
    const [v, w] = await Promise.all([visitor, witness].map(tab => tab.evaluate(() => { clearInterval(window.__encPoll); const n = window.__enc; n.done = true; return { fps: Math.round(n.frames / ((performance.timeOrigin + performance.now() - n.framesFrom) / 1000)), frames: n.frames }; })));
    check(errors.length === 0, `No page errors: ${errors.join(' | ')}`);
    const evidence = { hour: hours[0].shown, viewport: '1280x860', identities: { owner: ownerId, visitor: visitorId, witness: witnessId }, animationFramesPerSecond: { visitor: v.fps, witness: w.fps, window: 'from the observers\' install to the end, screenshots and video included' }, rows, screenshots: shots, videos: [] };
    const videos = [await videoOf(visitor, 'visitor'), await videoOf(witness, 'witness')];
    await visitorContext.close(); await witnessContext.close();
    evidence.videos = videos.filter(Boolean);
    return { passed: true, checks, evidence };
  } finally {
    await visitorContext.close().catch(() => {}); await witnessContext.close().catch(() => {});
  }
}
