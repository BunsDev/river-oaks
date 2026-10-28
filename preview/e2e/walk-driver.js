// Keyboard walking for journeys that drive two players at once from one browser, with real
// input only: a drag on the canvas turns the walker, W walks (Shift beyond two metres).
// Points are [east, north]; the walker's pose is the production controller's [x, y, z].
//
// In headed Chromium (CI under Xvfb) the first drag in a page after the other page's press
// rarely gets pointer capture, so it does not turn: across three hosted runs such drags
// captured 5 of 561 times, against 109 of 132 after the same page's press. When both players
// turned at once they kept failing in turn until a waypoint deadline. A page therefore keeps
// the turn until it faces where it is going; the other page waits.
//
// self(tab) is the journey's town-snapshot player; routes collects each finished walk;
// refusals names the page global that lists the town's movement refusals.
export function createWalkDriver({ self, routes, refusals, now = () => Date.now(), log = message => console.log(message) }) {
  let turning = Promise.resolve();
  const turner = turns => {
    let release = null;
    return {
      async drag(tab, difference) {
        if (!release) {
          const previous = turning;
          turning = new Promise(resolve => { release = resolve; });
          const since = now(); await previous; turns.waitedMs += now() - since;
        }
        const box = await tab.locator('#canvas-host').boundingBox(), x = box.x + box.width * .5, y = box.y + box.height * .4;
        const drag = Math.max(-box.width * .35, Math.min(box.width * .35, -difference / .003));
        await tab.mouse.move(x, y); await tab.mouse.down(); await tab.mouse.move(x + drag, y, { steps: 3 }); await tab.mouse.up();
        turns.drags++;
      },
      end() { if (release) { release(); release = null; } },
    };
  };
  const pose = tab => tab.evaluate(() => window.__riverCarriage().pose);
  const stopped = tab => tab.waitForFunction(() => window.__riverCarriage().pose.speed < .05, null, { timeout: 10000 });
  const refused = tab => tab.evaluate(name => window[name], refusals);

  const walk = async (tab, points, label) => {
    const started = now(), start = await self(tab), samples = [], turns = { drags: 0, turned: 0, waitedMs: 0 }, turn = turner(turns), presses = { fast: 0, slow: 0 }; // W keydowns, reasserts while held included
    const releaseKeys = async () => { await tab.keyboard.up('KeyW'); await tab.keyboard.up('ShiftLeft'); };
    let dragYaw = null;
    try {
      for (const target of points) {
        const deadline = now() + 120000;
        for (;;) {
          const current = await pose(tab), dx = target[0] - current.position[0], dz = -target[1] - current.position[2], distance = Math.hypot(dx, dz);
          if (dragYaw !== null) { if (current.yaw !== dragYaw) turns.turned++; dragYaw = null; }
          // Stay inside the planner's 0.3 m corner clearance before turning. A fast press can carry
          // the walker through the waypoint at full speed; let it stop and measure again, or it
          // coasts on (a hosted run ended 0.9 m past its lantern, outside the town's arrival check).
          if (distance < .15) { await releaseKeys(); if (current.speed < .05) break; await stopped(tab); continue; }
          if (now() > deadline) throw new Error(`${label}: stalled ${JSON.stringify({ target, pose: current, turns, presses, refusals: await refused(tab) })}`);
          const heading = Math.atan2(-dx, -dz), difference = Math.atan2(Math.sin(heading - current.yaw), Math.cos(heading - current.yaw));
          if (Math.abs(difference) > .035) { await releaseKeys(); await turn.drag(tab, difference); dragYaw = current.yaw; continue; }
          turn.end();
          // A lifecycle release clears runtime input; repeat keydown cannot resume it.
          if (current.speed < .05) await releaseKeys();
          await tab.locator('#canvas-host').focus();
          const fast = distance > 2;
          if (fast) await tab.keyboard.down('ShiftLeft'); else await tab.keyboard.up('ShiftLeft');
          await tab.keyboard.down('KeyW'); presses[fast ? 'fast' : 'slow']++;
          await tab.waitForTimeout(Math.min(450, Math.max(30, distance * (fast ? 110 : 230))));
          // Keep walking during browser round trips, as spatial-streets does. Pulsing or releasing
          // every sample repeatedly brakes on CPU-rendered CI. Reassert while held; a stopped
          // observation starts a fresh press above. Within two metres, stop before measuring again:
          // held across a slow round trip (about 9 fps on CPU-rendered CI) the walker overshoots by
          // more than the arrival radius and circles the waypoint until it stalls.
          if (!fast) { await releaseKeys(); await stopped(tab); }
          samples.push((await self(tab)).position);
        }
      }
    } finally { turn.end(); await releaseKeys(); }
    const target = points.at(-1);
    try {
      await tab.waitForFunction(target => {
        const town = window.__riverMultiplayer(), player = town.snapshot.players.find(p => p.id === town.selfId);
        return Math.hypot(player.position[0] - target[0], player.position[1] - target[1]) < .6;
      }, target, { timeout: 10000 });
    } catch (error) {
      const state = await tab.evaluate(name => {
        const town = window.__riverMultiplayer();
        return { pose: window.__riverCarriage().pose.position, town: town.snapshot.players.find(p => p.id === town.selfId)?.position, connected: town.connected, refusals: window[name] };
      }, refusals).catch(() => null);
      throw new Error(`${label}: the town did not confirm arrival ${JSON.stringify(state)} (${error.message})`);
    }
    routes.push({ label, seconds: (now() - started) / 1000, start: start.position, end: (await self(tab)).position, samples, turns });
    log(`${label} reached`);
  };

  // Turns a standing walker to a heading without moving it.
  const face = async (tab, heading, label) => {
    const deadline = now() + 120000, turns = { drags: 0, turned: 0, waitedMs: 0 }, turn = turner(turns);
    let dragYaw = null;
    try {
      for (;;) {
        const { yaw } = await pose(tab), difference = Math.atan2(Math.sin(heading - yaw), Math.cos(heading - yaw));
        if (dragYaw !== null) { if (yaw !== dragYaw) turns.turned++; dragYaw = null; }
        if (Math.abs(difference) <= .035) break;
        if (now() > deadline) throw new Error(`${label}: stalled ${JSON.stringify({ heading, yaw, turns })}`);
        await turn.drag(tab, difference); dragYaw = yaw;
      }
    } finally { turn.end(); }
    log(`${label} reached`);
  };

  return { walk, face };
}
