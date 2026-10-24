async page => {
  const checks = [], errors = []; let sockets = 0, snapshots = 0;
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); console.log(message); };
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => { sockets++; socket.on('framereceived', ({ payload }) => { try { if (JSON.parse(String(payload)).type === 'snapshot') snapshots++; } catch {} }); });
  await page.route('**/src/main.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__backgroundPose = () => { const pose = walking?.getPose(); return pose && {position: pose.position, yaw: pose.yaw, velocity: pose.velocity}; };' });
  });
  await page.context().grantPermissions(['microphone'], { origin: 'http://127.0.0.1:5173' });
  await page.addInitScript(() => {
    localStorage.setItem('river-oaks-voice', JSON.stringify({ pushToTalk: true, autoUnmute: false }));
    const tracks = [];
    class Room {
      constructor() {
        this.handlers = {}; this.remoteParticipants = new Map(); this.canPlaybackAudio = true; this.state = 'disconnected';
        this.localParticipant = { setMicrophoneEnabled: async enabled => {
          if (enabled && !this.stream) { this.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); tracks.push(...this.stream.getTracks()); }
          if (!enabled) { for (const track of this.stream?.getTracks() ?? []) track.stop(); this.stream = null; }
        } };
      }
      on(type, listener) { (this.handlers[type] ??= []).push(listener); return this; }
      async connect() { this.state = 'connected'; }
      async disconnect() { await this.localParticipant.setMicrophoneEnabled(false); this.state = 'disconnected'; }
      async startAudio() {}
      async switchActiveDevice() {}
    }
    const names = ['Connected', 'Disconnected', 'ParticipantConnected', 'ParticipantDisconnected', 'ActiveSpeakersChanged', 'AudioPlaybackStatusChanged', 'MediaDevicesError', 'TrackSubscribed', 'TrackUnsubscribed'];
    window.__riverVoiceTransport = { Room, RoomEvent: Object.fromEntries(names.map(name => [name, name])) };
    window.__backgroundMicLive = () => tracks.some(track => track.readyState === 'live');
  });
  await page.goto('http://127.0.0.1:5173/?motion-debug=1');
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true' && window.__riverMultiplayer?.().connected);
  await page.locator('#loading').waitFor({ state: 'hidden' });
  const frames = count => page.evaluate(count => new Promise(resolve => {
    const next = () => { if (--count <= 0) resolve(); else requestAnimationFrame(next); }; requestAnimationFrame(next);
  }), count);
  for (const type of ['blur', 'hidden', 'pagehide']) {
    const host = page.locator('#canvas-host'); await host.focus();
    if (await page.evaluate(() => window.__riverVoice().status !== 'joined')) {
      await page.keyboard.press('KeyY'); await page.waitForFunction(() => window.__riverVoice().status === 'joined');
    }
    await page.keyboard.down('KeyM'); await page.waitForFunction(() => window.__riverVoice().mic === 'on' && window.__backgroundMicLive());
    const start = await page.evaluate(() => window.__backgroundPose().position);
    await page.keyboard.down('KeyW');
    await page.waitForFunction(start => {
      const current = window.__backgroundPose().position; return Math.hypot(current[0] - start[0], current[2] - start[2]) > .15;
    }, start);
    const bounds = await host.boundingBox(); await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
    const stopped = await page.evaluate(type => {
      if (type === 'hidden') {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      } else window.dispatchEvent(type === 'pagehide' ? new PageTransitionEvent('pagehide', { persisted: true }) : new Event('blur'));
      return window.__backgroundPose();
    }, type);
    await page.waitForFunction(() => window.__riverVoice().mic === 'off' && !window.__backgroundMicLive());
    await frames(20);
    const released = await page.evaluate(() => window.__backgroundPose());
    console.log(`${type} release poses:`, JSON.stringify({ stopped, released }));
    check(JSON.stringify(released.position) === JSON.stringify(stopped.position), `${type}: held movement stops before keyup`);
    const beforeSockets = sockets, beforeSnapshots = snapshots;
    await page.evaluate(type => {
      if (type === 'hidden') { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); }
      if (type === 'pagehide') window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    }, type);
    if (type === 'pagehide') {
      await page.waitForFunction(() => window.__riverMultiplayer().connected);
      check(sockets > beforeSockets && snapshots > beforeSnapshots, 'persisted pageshow receives a fresh snapshot through a new authorized connection');
    }
    await host.evaluate(host => {
      for (const code of ['KeyW', 'KeyM']) host.dispatchEvent(new KeyboardEvent('keydown', { code, repeat: true, bubbles: true }));
    });
    await page.mouse.move(bounds.x + bounds.width / 2 + 40, bounds.y + bounds.height / 2);
    await frames(20);
    const returned = await page.evaluate(() => window.__backgroundPose());
    check(JSON.stringify(returned.position) === JSON.stringify(stopped.position) && returned.yaw === stopped.yaw, `${type}: returning cannot revive movement or look drag`);
    check(await page.evaluate(() => window.__riverVoice().mic === 'off' && !window.__backgroundMicLive()), `${type}: return never restarts the microphone`);
    await page.keyboard.up('KeyW'); await page.keyboard.up('KeyM'); await page.mouse.up();
  }
  const toggle = page.locator('#walking-controls-toggle');
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  const forward = page.getByRole('button', { name: 'Walk forward', exact: true });
  const right = page.getByRole('button', { name: 'Turn right', exact: true });
  await right.focus();
  const yaw = await page.evaluate(() => window.__backgroundPose().yaw);
  await page.keyboard.press('Enter');
  await page.waitForFunction(yaw => window.__backgroundPose().yaw !== yaw, yaw);
  check(true, 'a fresh quick keyboard tap still turns the player');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  for (const key of ['Enter', 'Space']) {
    await forward.focus();
    const before = await page.evaluate(() => window.__backgroundPose().position);
    await page.keyboard.down(key);
    await page.waitForFunction(before => JSON.stringify(window.__backgroundPose().position) !== JSON.stringify(before), before);
    const stopped = await page.evaluate(() => { window.dispatchEvent(new Event('blur')); return window.__backgroundPose().position; });
    if (key === 'Enter') await page.keyboard.down(key); // native autorepeat
    await page.keyboard.up(key); // includes the stale Space activation
    await frames(20);
    check(await page.evaluate(stopped => JSON.stringify(window.__backgroundPose().position) === JSON.stringify(stopped), stopped), `${key}: native movement-button activation cannot restart after release`);
    await page.keyboard.down(key);
    await page.waitForFunction(stopped => JSON.stringify(window.__backgroundPose().position) !== JSON.stringify(stopped), stopped);
    await page.keyboard.up(key);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  }
  check(errors.length === 0, 'no uncaught browser errors');
  return { checks, sockets, snapshots, errors };
}
