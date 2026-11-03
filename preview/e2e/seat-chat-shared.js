async page => {
  // Seat chat in three browsers (#825 slice 4). Two people sit at the Counter's seats; a third
  // sits with them and watches every frame the town sends. Sitting shares nothing; the words flow
  // only after both agree; each sender sees who receives them; standing ends it; a block overrides
  // a new request and an open conversation. Keyboard only, where a person would use keys.
  const { seatClusters } = await import('../src/seat-clusters.js');
  const { DISTRICT_RIBBON_LANE } = await import('../src/ribbon-district.js');
  const [counter] = seatClusters({ roads: [{ id: DISTRICT_RIBBON_LANE }] });
  const checks = [], errors = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const browser = page.context().browser();
  const bob = await (await browser.newContext()).newPage(), carol = await (await browser.newContext()).newPage();
  const frames = [];
  carol.on('websocket', socket => socket.on('framereceived', ({ payload }) => frames.push(String(payload))));
  const join = async tab => {
    tab.setDefaultNavigationTimeout(90000);tab.on('pageerror', error => errors.push(error.message));
    await tab.setViewportSize({ width: 1280, height: 860 });
    await tab.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
    await tab.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 120000 });
  };
  const me = tab => tab.evaluate(() => { const m = window.__riverMultiplayer();return { id: m.selfId, ...m.snapshot.players.find(p => p.id === m.selfId), seatChat: m.snapshot.seatChat ?? null }; });
  const turnTo = async (tab, heading) => {
    const { yaw } = await me(tab), box = await tab.locator('#canvas-host').boundingBox();
    let delta = Math.atan2(Math.sin(heading + yaw), Math.cos(heading + yaw));
    while (Math.abs(delta) > 0.03) {
      const limit = box.width * 0.4, px = Math.max(-limit, Math.min(limit, delta / 0.003)), x = box.x + box.width / 2, y = box.y + box.height * 0.35;
      await tab.mouse.move(x, y);await tab.mouse.down();await tab.mouse.move(x + px, y, { steps: 6 });await tab.mouse.up();delta -= px * 0.003;
    }
    await tab.waitForTimeout(200);
  };
  const walkTo = async (tab, [east, north], label) => {
    for (let stride = 0; stride < 120; stride++) {
      const [x, , z] = await tab.locator('#walking-hud').evaluate(n => JSON.parse(n.dataset.position));
      const de = east - x, dn = north + z, distance = Math.hypot(de, dn);
      if (distance < 0.35) return;
      await turnTo(tab, Math.atan2(de, dn));await tab.locator('#canvas-host').focus();
      await tab.keyboard.down('KeyW');await tab.waitForTimeout(Math.min(450, Math.max(80, distance * 260)));await tab.keyboard.up('KeyW');await tab.waitForTimeout(100);
    }
    throw new Error(`could not walk to ${label}: ${JSON.stringify(await me(tab))}`);
  };
  // Out in the lane at the Counter's door, then a walk the walking rules allow: a search over free
  // ground, kept only where it turns, so the route follows wherever the cluster stands.
  const { createWalkingEnvironment } = await import('../src/walking.js');
  const environment = createWalkingEnvironment(await (await fetch('http://127.0.0.1:5173/data/district.json')).json());
  const routeTo = (from, to, step = 0.25) => {
    const key = (a, b) => `${a},${b}`, came = new Map([[key(0, 0), null]]), queue = [[0, 0]];
    while (queue.length && came.size < 60000) {
      const [a, b] = queue.shift();
      if (Math.hypot(from[0] + a * step - to[0], from[1] + b * step - to[1]) < step) {
        const cells = [];
        for (let at = key(a, b); at; at = came.get(at)) cells.unshift(at.split(',').map(Number));
        const turns = cells.filter((cell, i) => i === cells.length - 1 || (i > 0 && (cell[0] - cells[i - 1][0] !== cells[i + 1][0] - cell[0] || cell[1] - cells[i - 1][1] !== cells[i + 1][1] - cell[1])));
        return [...turns.map(([i, j]) => [from[0] + i * step, from[1] + j * step]), to];
      }
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const na = a + da, nb = b + db;
        if (came.has(key(na, nb)) || !environment.isFree(from[0] + na * step, -(from[1] + nb * step))) continue;
        came.set(key(na, nb), key(a, b));queue.push([na, nb]);
      }
    }
    throw new Error(`no walk from ${from} to ${to}`);
  };
  const DOOR = [-2756.6, -1216.4];
  const sit = async (tab, seat, name) => {
    await tab.evaluate(([x, north]) => window.__riverSeatAndWater().goTo(x, north), DOOR);
    await tab.waitForFunction(([x, north]) => { const m = window.__riverMultiplayer(), p = m.snapshot.players.find(q => q.id === m.selfId);return Math.hypot(p.position[0] - x, p.position[1] - north) < 3; }, DOOR);
    for (const point of routeTo(DOOR, seat.approach)) await walkTo(tab, point, `${name} route`);
    await tab.locator('#canvas-host').focus();await tab.keyboard.press('KeyZ');
    await tab.waitForFunction(buildId => { const m = window.__riverMultiplayer();return m.snapshot.players.find(p => p.id === m.selfId)?.sitting?.buildId === buildId; }, seat.buildId, { timeout: 15000 });
  };
  const panel = tab => tab.locator('section.seat-chat');
  // Worst WCAG ratio of the panel's text, every ancestor composited over a pure white and a pure black world.
  const worstContrast = tab => panel(tab).evaluate(root => {
    const parse = text => { const [r, g, b, a = 1] = text.match(/[\d.]+/g).map(Number);return [r, g, b, a]; };
    const over = ([r, g, b, a], under) => [r, g, b].map((value, i) => value * a + under[i] * (1 - a));
    const lum = rgb => { const [r, g, b] = rgb.map(v => { const c = v / 255;return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);return (x + 0.05) / (y + 0.05); };
    const worst = { ratio: Infinity, text: null };
    for (const node of root.querySelectorAll('h3,p,button,label,input')) {
      if (!node.getClientRects().length) continue;
      const chain = [];let opacity = 1;
      for (let at = node; at; at = at.parentElement) { const style = getComputedStyle(at);chain.unshift(parse(style.backgroundColor));opacity *= Number(style.opacity); }
      const [r, g, b, a] = parse(getComputedStyle(node).color);
      for (const world of [[255, 255, 255], [0, 0, 0]]) {
        const backdrop = chain.reduce((under, layer) => over(layer, under), world), value = ratio(over([r, g, b, a * opacity], backdrop), backdrop);
        if (value < worst.ratio) Object.assign(worst, { ratio: Math.round(value * 100) / 100, text: node.textContent.trim().slice(0, 40) || node.tagName });
      }
    }
    return worst;
  });
  try {
    await join(page);await join(bob);await join(carol);
    for (const tab of [page, bob, carol]) if (await tab.locator('.town-chat-dock[open]').count()) await tab.locator('.town-chat-toggle').click();
    check(await panel(page).isHidden(), 'Standing in the town shows no seat conversation');
    await sit(page, counter.seats[0], 'alice');await sit(bob, counter.seats[2], 'bob');await sit(carol, counter.seats[3], 'carol');
    const [aliceSelf, bobSelf] = [await me(page), await me(bob)];
    await panel(page).getByRole('button', { name: new RegExp(`Ask ${bobSelf.name} to talk`) }).waitFor();
    check(aliceSelf.seatChat === null && bobSelf.seatChat === null, 'Sitting beside someone shares nothing');
    check((await panel(page).textContent()).includes('Sitting here shares nothing'), 'The panel says sitting shares nothing');
    check(await panel(page).locator('input').isHidden(), 'There is nowhere to type before both agree');

    // Keyboard: Tab to the request and press Enter.
    const ask = panel(page).getByRole('button', { name: new RegExp(`Ask ${bobSelf.name} to talk`) });
    await ask.focus();await page.keyboard.press('Enter');
    await panel(page).getByText(`You asked ${bobSelf.name}. Waiting for an answer.`).waitFor();
    await panel(bob).getByText(`${aliceSelf.name} would like to talk.`).waitFor();
    check(await panel(bob).locator('input').isHidden(), 'Being asked is not yet a conversation');
    const accept = panel(bob).getByRole('button', { name: `Accept ${aliceSelf.name}'s request to talk` });
    await accept.focus();await bob.keyboard.press('Enter');
    await panel(page).getByRole('textbox', { name: `Message to ${bobSelf.name}` }).waitFor();
    await panel(bob).getByRole('textbox', { name: `Message to ${aliceSelf.name}` }).waitFor();
    await bob.waitForFunction(() => document.activeElement?.id === 'seat-chat-input');
    check(true, 'Accepting moves the keyboard straight to the message field');
    check(await panel(page).getByRole('button', { name: `Send to ${bobSelf.name}` }).isVisible(), 'The sender sees who will receive the message');
    check((await panel(page).textContent()).includes(`Only ${bobSelf.name} can read this`), 'The panel says who can read it, in words');

    const contrast = await worstContrast(page);
    check(contrast.ratio >= 4.5, `The panel's text keeps 4.5:1 over any world: ${JSON.stringify(contrast)}`);
    await panel(page).screenshot({ path: '.runtime/seat-chat/panel-talking.png' });
    const secret = 'meet-me-by-the-gelato-case';
    const input = panel(page).getByRole('textbox', { name: `Message to ${bobSelf.name}` });
    await input.fill(secret);await input.press('Enter');
    await panel(bob).locator('.seat-chat-log').getByText(secret).waitFor();
    check((await panel(page).locator('.seat-chat-log').textContent()).includes(`You ${secret}`), 'The sender reads their own line as You');
    check((await panel(bob).locator('.seat-chat-log').getAttribute('role')) === 'log', 'The conversation is a log for assistive technology');
    // Typing must not walk anyone: W in the message field stays in the field.
    const before = await me(page);await input.focus();await page.keyboard.type('www');await page.waitForTimeout(300);
    check(JSON.stringify((await me(page)).sitting) === JSON.stringify(before.sitting), 'Typing in the message field leaves the seat alone');
    await input.fill('');await page.keyboard.press('Escape');
    check(await page.evaluate(() => document.activeElement?.id === 'canvas-host'), 'Escape gives the keys back to the scene');

    await carol.waitForTimeout(800);
    check(!frames.some(frame => frame.includes(secret)), `None of ${frames.length} frames to the third person carries the words`);
    check(!frames.some(frame => frame.includes('"seatChat"')), 'None of them says anyone asked, answered or is talking');
    check(await panel(carol).getByRole('button', { name: new RegExp(`Ask ${bobSelf.name} to talk`) }).isVisible() && !(await panel(carol).textContent()).includes(secret), 'The third person sees only who is seated');

    // Standing ends it, for both, with words rather than colour.
    await bob.locator('#canvas-host').focus();await bob.keyboard.press('KeyZ');
    await panel(page).getByText(new RegExp(`conversation with ${bobSelf.name} has ended`)).waitFor();
    check(await panel(page).locator('input').isHidden() && !(await panel(page).textContent()).includes(secret), 'Standing ends it and clears what was said');
    await bob.waitForFunction(() => { const m = window.__riverMultiplayer();return !m.snapshot.seatChat && !m.snapshot.players.find(p => p.id === m.selfId)?.sitting; });

    // A block overrides: in an open conversation, and for any new request.
    await bob.locator('#canvas-host').focus();
    await walkTo(bob, counter.seats[2].approach, 'bob back to the seat');await bob.keyboard.press('KeyZ');
    await bob.waitForFunction(id => { const m = window.__riverMultiplayer();return m.snapshot.players.find(p => p.id === m.selfId)?.sitting?.buildId === id; }, counter.buildId);
    await page.waitForTimeout(1200);
    await panel(page).getByRole('button', { name: new RegExp(`Ask ${bobSelf.name} to talk`) }).click();
    await panel(bob).getByRole('button', { name: `Accept ${aliceSelf.name}'s request to talk` }).click();
    await panel(page).getByRole('textbox', { name: `Message to ${bobSelf.name}` }).waitFor();
    await panel(page).getByText(new RegExp(`conversation with ${bobSelf.name} has ended`)).waitFor({ state: 'hidden' });
    check(true, 'A new conversation no longer says the last one ended');
    const block = await bob.evaluate(async peerId => {
      const session = await (await fetch('/auth/session')).json();
      const reply = await fetch('/api/blocks/add', { method: 'POST', headers: { 'X-CSRF-Token': session.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ peerId }) });
      return reply.status;
    }, aliceSelf.id);
    check(block === 200, 'Bob blocks alice');
    await panel(page).getByText(new RegExp(`conversation with ${bobSelf.name} has ended`)).waitFor();
    check(await page.evaluate(() => !window.__riverMultiplayer().snapshot.seatChat), 'A block ends the conversation for the other person at once');
    const asked = await page.evaluate(peerId => window.__riverMultiplayerCommand({ type: 'seatChat', action: 'invite', peerId }), bobSelf.id);
    check(asked.error === 'seat_chat_unavailable', `A request toward someone who blocked you reads as unavailable: ${JSON.stringify(asked)}`);
    await page.locator('#canvas-host').focus();await page.keyboard.press('KeyZ');
    await page.waitForFunction(() => { const m = window.__riverMultiplayer();return !m.snapshot.players.find(p => p.id === m.selfId)?.sitting; });
    await panel(page).waitFor({ state: 'hidden' });
    check(true, 'Standing up puts the panel away');
    check(errors.length === 0, `No page errors: ${errors.slice(0, 3).join(' | ')}`);
    return { checks, framesToThird: frames.length };
  } finally { await bob.context().close();await carol.context().close(); }
}
