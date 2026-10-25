async page => {
  // Touch-hold safety (#288): holds, extra fingers and interruptions on a phone
  // never leave the player moving or select someone by accident. In Chromium the
  // contacts are real browser touches through CDP, so pointer ids, isPrimary and
  // capture are the browser's own. Playwright's WebKit has no touch hold: it only
  // taps, and a dispatched PointerEvent cannot take pointer capture (NotFoundError).
  // There a held contact is the real mouse, taps are real touches, and the cases
  // that need two fingers at once are recorded as not run.
  const checks = [], failures = [], errors = [], metrics = { notRun: [] }, origin = 'http://127.0.0.1:5173';
  const engine = page.context().browser().browserType().name();
  const expect = (ok, message, detail) => {
    (ok ? checks : failures).push(detail === undefined ? message : `${message} ${JSON.stringify(detail)}`);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  };
  const viewport = { width: 390, height: 844 };
  const context = await page.context().browser().newContext({ viewport, hasTouch: true, isMobile: engine === 'chromium', reducedMotion: 'no-preference' });
  await context.addCookies(await page.context().cookies());
  await context.route('**/src/main.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__touchPose = () => { const pose = walking?.getPose(); return pose && {position: pose.position, yaw: pose.yaw, speed: pose.speed}; };' });
  });
  const touch = await context.newPage();
  touch.on('pageerror', error => errors.push(error.message));
  try {
    await touch.goto(`${origin}/?motion-debug=1`);
    await touch.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true' && window.__riverMultiplayer?.().connected, null, { timeout: 90000 });
    await touch.locator('#loading').waitFor({ state: 'hidden' });
    if (await touch.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await touch.locator('#panel-toggle').click();
    const toggle = touch.locator('#walking-controls-toggle');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    // On a phone an open chat dock hides the walking console (game-hud.css), and the dock
    // opens by default: fold it with a tap, as a player would, before using the pad.
    const foldChat = async () => {
      if (!await touch.locator('.town-chat-dock').evaluate(dock => dock.open)) return;
      await touch.locator('.town-chat-toggle').tap();
      await touch.waitForFunction(() => !document.querySelector('.town-chat-dock').open && document.querySelector('.walking-console').checkVisibility({ visibilityProperty: true }));
    };
    metrics.chatOpenHidesPad = await touch.evaluate(() => document.querySelector('.town-chat-dock').open && !document.querySelector('[data-walk-key=KeyW]').checkVisibility({ visibilityProperty: true }));
    await foldChat();

    const contacts = new Map(), client = engine === 'chromium' ? await context.newCDPSession(touch) : null;
    const points = () => [...contacts].map(([id, [x, y]]) => ({ id, x, y, radiusX: 1, radiusY: 1, force: 1 }));
    const touchEvent = (type, touchPoints) => client.send('Input.dispatchTouchEvent', { type, touchPoints });
    const down = async (id, [x, y]) => {
      contacts.set(id, [x, y]);
      if (client) await touchEvent('touchStart', points());
      else { await touch.mouse.move(x, y); await touch.mouse.down(); }
    };
    const slide = async (id, [x, y], steps = 4) => {
      const [x0, y0] = contacts.get(id);
      for (let step = 1; step <= steps; step++) {
        contacts.set(id, [x0 + (x - x0) * step / steps, y0 + (y - y0) * step / steps]);
        if (client) await touchEvent('touchMove', points()); else await touch.mouse.move(...contacts.get(id));
      }
    };
    // CDP touchEnd lists the contacts being removed (see touch-people.js).
    const lift = async id => { const [x, y] = contacts.get(id); contacts.delete(id); if (client) await touchEvent('touchEnd', [{ id, x, y }]); else await touch.mouse.up(); };
    // WebKit: the browser's own cancel cannot be triggered, so the held pointer gets a dispatched pointercancel.
    const cancelAll = async () => {
      const held = [...contacts.values()].at(-1); contacts.clear();
      if (!held) return;
      if (client) { await touchEvent('touchCancel', []); return; }
      await touch.evaluate(([x, y]) => {
        const last = window.__touchLog.filter(e => e.type === 'pointerdown').at(-1);
        document.elementFromPoint(x, y)?.dispatchEvent(new PointerEvent('pointercancel', { pointerId: last?.id ?? 1, pointerType: last?.kind ?? 'mouse', bubbles: true }));
      }, held);
      await touch.mouse.up();
    };
    // Two fingers down at once: Chromium only.
    const fingers = (count, name) => {
      if (client || count < 2) return true;
      metrics.notRun.push(`${name}: needs ${count} simultaneous contacts; Playwright WebKit has only touchscreen.tap()`);
      console.log(`skip ${name} (WebKit has no multi-touch)`); return false;
    };
    const frames = count => touch.evaluate(count => new Promise(resolve => {
      const next = () => { if (--count <= 0) resolve(); else requestAnimationFrame(next); }; requestAnimationFrame(next);
    }), count);
    const pose = () => touch.evaluate(() => window.__touchPose());
    const distance = (a, b) => Math.hypot(b.position[0] - a.position[0], b.position[2] - a.position[2]);
    // A control's centre once its box holds still for a few frames and it is the topmost element there.
    const target = selector => touch.waitForFunction(selector => new Promise(resolve => {
      const node = document.querySelector(selector), box = () => JSON.stringify(node?.getBoundingClientRect());
      let last = box(), steady = 0;
      const check = () => {
        const now = box(); steady = now === last ? steady + 1 : 0; last = now;
        if (steady < 4) { requestAnimationFrame(check); return; }
        const r = node.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, top = document.elementFromPoint(x, y);
        resolve(top && (top === node || node.contains(top)) ? { point: [x, y] } : { covered: top ? `${top.tagName.toLowerCase()}#${top.id}.${top.className?.toString().slice(0, 40)}` : null, at: [x, y] });
      };
      requestAnimationFrame(check);
    }), selector, { timeout: 10000 }).then(handle => handle.jsonValue()).then(found => {
      if (!found.point) throw new Error(`touch-hold: ${selector} is covered: ${JSON.stringify(found)}`);
      return found.point;
    });
    // What a contact at a point lands on, and the latest pointer events, for a failure's detail.
    const evidence = point => touch.evaluate(([x, y]) => {
      const top = document.elementFromPoint(x, y);
      return { at: [Math.round(x), Math.round(y)], hit: top ? `${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}${top.dataset?.walkKey ? `[${top.dataset.walkKey}]` : ''}.${top.className?.toString().slice(0, 40)}` : null,
        hud: { position: document.querySelector('#walking-hud')?.dataset.position, speed: document.querySelector('#walking-hud')?.dataset.speed }, log: window.__touchLog.slice(-6) };
    }, point);
    const walking = start => touch.waitForFunction(start => {
      const now = window.__touchPose(); return Math.hypot(now.position[0] - start.position[0], now.position[2] - start.position[2]) > .15;
    }, start, { timeout: 8000 }).then(() => true, () => false);
    // Released walking eases out over a few frames; then nothing may move.
    const settled = async () => { await frames(30); const a = await pose(); await frames(20); const b = await pose(); return { moved: distance(a, b), turned: Math.abs(b.yaw - a.yaw) }; };
    const still = value => value.moved < .01 && value.turned < 1e-3;
    const dialogueOpen = () => touch.locator('#community-dialogue').isVisible();
    // Contacts inside the scene, clear of the HUD.
    const look = [viewport.width / 2, viewport.height * .32];
    expect(await touch.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('#canvas-host')), look), 'the look point is on the scene, not the HUD');
    const forward = await target('[data-walk-key=KeyW]'), right = await target('[data-walk-key=KeyD]');
    expect(true, 'the walk buttons hold still and nothing covers them');
    await touch.evaluate(() => {
      window.__touchLog = [];
      for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture']) document.addEventListener(type, event => window.__touchLog.push({ type, id: event.pointerId, primary: event.isPrimary, kind: event.pointerType, trusted: event.isTrusted, target: event.target.dataset?.walkKey ?? event.target.id ?? event.target.tagName }), true);
    });
    const reset = async () => { await cancelAll(); await touch.evaluate(() => window.dispatchEvent(new Event('blur'))); await settled(); await touch.locator('#canvas-host').focus(); };

    // 0. Real touch taps (both engines): a tapped walk button pulses and stops,
    // and a tap on the scene neither turns the camera nor selects anyone.
    {
      const start = await pose();
      await touch.touchscreen.tap(...forward);
      const rest = await settled();
      expect(still(rest), 'a tapped walk button leaves the player still', rest);
      const before = await pose(); await touch.touchscreen.tap(...look); await frames(10); const after = await pose();
      expect(Math.abs(after.yaw - before.yaw) < 1e-3, 'a tap on the scene does not turn the camera', { yaw: after.yaw - before.yaw });
      // A deliberate tap may select whoever stands there; that is not an accident.
      if (await dialogueOpen()) await touch.locator('#community-close').click();
      metrics.tapMoved = distance(start, after);
      await reset();
    }

    // 1. Walk with one thumb and look with the other.
    if (fingers(2, 'move and look at once')) {
      const start = await pose();
      await down(1, forward);
      const moving = await walking(start);
      expect(moving, 'a held walk button moves the player', moving ? undefined : await evidence(forward));
      const before = await pose();
      await down(2, look); await slide(2, [look[0] + 90, look[1]], 6); await frames(5);
      const after = await pose();
      metrics.moveLookYaw = after.yaw - before.yaw;
      expect(Math.abs(metrics.moveLookYaw) > .1, 'a second finger looks around while the first walks', { yaw: metrics.moveLookYaw });
      expect(distance(before, after) > .05, 'walking continues while the second finger looks', { moved: distance(before, after) });
      await lift(2); const lifted = await pose(); await frames(10); const walkingOn = await pose();
      expect(Math.abs(walkingOn.yaw - lifted.yaw) < 1e-3 && distance(lifted, walkingOn) > .02, 'lifting the look finger keeps walking and stops turning');
      await lift(1);
      const rest = await settled(); metrics.afterMoveLook = rest;
      expect(still(rest), 'lifting both fingers stops the player', rest);
      expect(!await dialogueOpen(), 'move and look never select a person');
      await reset();
    }

    // 2. A second finger joins another walk button, then each lifts in turn.
    if (fingers(2, 'a second finger on another walk button')) {
      const start = await pose();
      await down(1, forward); await walking(start);
      await down(2, right); await frames(10);
      await lift(1);
      const a = await pose(); await frames(20); const b = await pose();
      expect(distance(a, b) > .05, 'the remaining finger keeps its own direction after the first lifts', { moved: distance(a, b) });
      await lift(2);
      const rest = await settled();
      expect(still(rest), 'nothing moves once the last finger lifts', rest);
      await reset();
    }

    // 3. touchcancel in the middle of a walk and a look.
    {
      const start = await pose();
      await down(1, forward); await walking(start);
      if (fingers(2, 'touchcancel while a second finger looks')) { await down(2, look); await slide(2, [look[0] + 40, look[1]]); }
      await cancelAll();
      const rest = await settled();
      expect(still(rest), 'touchcancel mid-hold stops walking and looking', rest);
      expect(!await dialogueOpen(), 'touchcancel mid-hold selects nobody');
      const fresh = await pose(); await down(1, forward);
      expect(await walking(fresh), 'a fresh hold after touchcancel walks again');
      await lift(1); await reset();
    }

    // 4. The page hides mid-hold; coming back never revives the held finger.
    {
      const start = await pose();
      await down(1, forward); await walking(start);
      await touch.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await touch.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
      await slide(1, [forward[0] + 2, forward[1]]);
      const rest = await settled();
      expect(still(rest), 'a hold interrupted by the page hiding stays stopped on return', rest);
      await lift(1); await reset();
    }

    // 5. Capture loss mid-hold, as when the page takes the pointer (background-lifecycle.js
    // does on hide). The browser delivers lostpointercapture with the pointer's next event
    // (the Pointer Events "process pending pointer capture" step), and Chromium holds back
    // touch moves inside its slop, so the finger slides 20 px, still on the button.
    {
      const start = await pose();
      await down(1, forward); await walking(start);
      const id = await touch.evaluate(() => {
        const button = document.querySelector('[data-walk-key=KeyW]'), event = window.__touchLog.filter(e => e.type === 'pointerdown' && e.target === 'KeyW').at(-1);
        button.releasePointerCapture(event.id); return event.id;
      });
      const lost = () => touch.evaluate(id => window.__touchLog.some(e => e.type === 'lostpointercapture' && e.id === id && e.target === 'KeyW'), id);
      await frames(2); metrics.captureLostBeforeMove = await lost();
      await slide(1, [forward[0] + 20, forward[1]], 4);
      expect(await lost(), 'the browser delivers lostpointercapture to the held walk button');
      const rest = await settled();
      expect(still(rest), 'lostpointercapture mid-hold stops walking', rest);
      await lift(1); await reset();
    }

    // 6. The chat keyboard opens mid-hold through the Town chat command, which opens the
    // dock and focuses its field. Chromium makes no click from a second finger's tap while
    // another is held, so the command dialog is driven by its keys (? then Enter); the
    // iPhone pass in docs/touch-play.md covers the tap. Typing is text, never movement.
    {
      const start = await pose();
      await down(1, forward); await walking(start);
      await touch.keyboard.press('?');
      await touch.locator('#rail-command-search').waitFor();
      const opened = await settled();
      expect(still(opened), 'opening Commands mid-hold stops walking', opened);
      await touch.keyboard.type('town chat');
      await touch.locator('.commands-results button').first().filter({ hasText: 'Town chat' }).waitFor();
      await touch.keyboard.press('Enter');
      const input = touch.locator('.multiplayer-chat-form input');
      // The dock's toggle event follows the command; focus must still be in the field after it.
      await frames(3);
      metrics.chatFocus = await touch.evaluate(() => document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName);
      expect(await input.evaluate(element => element === document.activeElement), 'the Town chat command leaves focus in the chat field', metrics.chatFocus);
      await touch.keyboard.type('wasd');
      const rest = await settled();
      expect(still(rest), 'typing in chat mid-hold moves nothing', rest);
      expect(await input.inputValue() === 'wasd', 'chat receives the typed text');
      await lift(1);
      const after = await settled();
      expect(still(after), 'lifting the finger after chat moves nothing', after);
      await input.fill(''); await reset(); await foldChat();
    }

    // 7. Three fingers: two walk buttons and a look, lifted out of order.
    if (fingers(3, 'three fingers lifted out of order')) {
      const start = await pose();
      await down(1, forward); await walking(start);
      await down(2, right); await down(3, look); await slide(3, [look[0] - 60, look[1]]);
      await lift(1); await lift(3);
      const a = await pose(); await frames(20); const b = await pose();
      expect(distance(a, b) > .05 && Math.abs(b.yaw - a.yaw) < 1e-3, 'the last finger walks on alone and nothing turns', { moved: distance(a, b), turned: b.yaw - a.yaw });
      await lift(2);
      const rest = await settled();
      expect(still(rest), 'three fingers lifted out of order leave the player still', rest);
      expect(!await dialogueOpen(), 'three fingers select nobody');
      await reset();
    }

    // 8. The phone rotates mid-hold: the layout moves under the finger.
    {
      const start = await pose();
      await down(1, forward); await walking(start);
      await touch.setViewportSize({ width: viewport.height, height: viewport.width });
      await touch.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [viewport.height, viewport.width]); await frames(10);
      await lift(1);
      const rest = await settled(); metrics.afterRotation = rest;
      expect(still(rest), 'a hold that outlives a rotation stops when it lifts', rest);
      await touch.setViewportSize(viewport);
      await touch.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [viewport.width, viewport.height]); await frames(10);
      const again = await pose(); await down(1, await target('[data-walk-key=KeyW]'));
      expect(await walking(again), 'the pad still walks after rotating back');
      await lift(1); await reset();
      expect(still(await settled()), 'and stops again on release');
    }

    metrics.pointerEvents = await touch.evaluate(() => window.__touchLog);
    if (client) expect(metrics.pointerEvents.some(e => e.kind === 'touch' && !e.primary && e.trusted), 'the browser delivered real secondary touch contacts');
    expect(metrics.pointerEvents.some(e => e.kind === 'touch' && e.trusted), 'the browser delivered real touch contacts');
    metrics.engine = engine;
    await client?.detach();
  } finally { await context.close(); }
  expect(errors.length === 0, 'no uncaught browser errors', errors);
  if (failures.length) throw new Error(`touch-hold: ${failures.length} failed: ${failures.join(' | ')}`);
  return { checks, metrics, errors };
}
