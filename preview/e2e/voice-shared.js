// Shared voice between two residents, over the real voice routes, leases and
// reconciler of the fixture town (RIVER_OAKS_VOICE_FIXTURE=1) and a fake
// transport installed in each page: a stand-in Room whose microphone really
// calls getUserMedia and whose remote tracks are oscillators through the
// production audio graph. Real LiveKit audio is the separate live acceptance.
async page => {
  const checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const origin = 'http://127.0.0.1:5173';
  const fakeTransport = () => {
    const fake = { rooms: [], mics: [], tracks: [], peers: new Map() };
    class Publication { constructor(track) { this.track = track; this.isSubscribed = true; this.kind = 'audio'; } setSubscribed(value) { this.isSubscribed = value; } }
    class Room {
      constructor(options) { this.options = options; this.handlers = {}; this.remoteParticipants = new Map(); this.state = 'disconnected'; this.canPlaybackAudio = true; fake.rooms.push(this);
        this.localParticipant = { setMicrophoneEnabled: async on => { if (on && !this.micStream) { this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true }); fake.mics.push(this.micStream); for (const track of this.micStream.getTracks()) fake.tracks.push(track); } if (!on && this.micStream) { for (const track of this.micStream.getTracks()) track.stop(); this.micStream = null; } this.micOn = on; } }; }
      on(event, handler) { (this.handlers[event] ??= []).push(handler); return this; }
      emit(event, ...args) { for (const handler of this.handlers[event] ?? []) handler(...args); }
      async connect(url, token, options) { this.connected = { url, token, options }; this.state = 'connected'; }
      async disconnect() { this.state = 'disconnected'; this.disconnected = true; for (const track of this.micStream?.getTracks() ?? []) track.stop(); this.micStream = null; }
      async startAudio() { this.started = true; }
      async switchActiveDevice() {}
    }
    const RoomEvent = { Connected: 'connected', Disconnected: 'disconnected', ParticipantConnected: 'participantConnected', ParticipantDisconnected: 'participantDisconnected', ActiveSpeakersChanged: 'activeSpeakersChanged', AudioPlaybackStatusChanged: 'audioPlaybackChanged', MediaDevicesError: 'mediaDevicesError', TrackSubscribed: 'trackSubscribed', TrackUnsubscribed: 'trackUnsubscribed' };
    window.__riverVoiceTransport = { Room, RoomEvent };
    window.__riverVoiceFake = {
      ...fake,
      room: () => fake.rooms.at(-1),
      addPeer(identity) {
        const room = fake.rooms.at(-1), context = new AudioContext(), oscillator = context.createOscillator(), destination = context.createMediaStreamDestination();
        oscillator.connect(destination); oscillator.start();
        const stream = destination.stream, element = document.createElement('audio');
        const track = { kind: 'audio', mediaStream: stream, mediaStreamTrack: stream.getAudioTracks()[0], attach: () => { element.srcObject = stream; return element; }, detach: () => { element.srcObject = null; } };
        const participant = { identity, trackPublications: new Map([['t', new Publication(track)]]) };
        room.remoteParticipants.set(identity, participant); fake.peers.set(identity, { context, oscillator });
        room.emit(RoomEvent.ParticipantConnected, participant);
        room.emit(RoomEvent.TrackSubscribed, track, participant.trackPublications.get('t'), participant);
      },
      speak: identities => fake.rooms.at(-1)?.emit(RoomEvent.ActiveSpeakersChanged, identities.map(identity => ({ identity }))),
      subscribed: identity => fake.rooms.at(-1)?.remoteParticipants.get(identity)?.trackPublications.get('t').isSubscribed ?? null,
      micLive: () => fake.tracks.some(track => track.readyState === 'live'),
    };
  };
  const ready = async tab => { await tab.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true'); await tab.waitForFunction(() => window.__riverVoice?.()?.status === 'idle'); };
  const voice = tab => tab.evaluate(() => window.__riverVoice?.() ?? null);
  const waitVoice = (tab, predicate, message) => tab.waitForFunction(predicate, null, { timeout: 15000 }).catch(() => { throw new Error(message); });
  await page.context().grantPermissions(['microphone'], { origin });
  await page.context().addInitScript(fakeTransport);
  await page.context().addCookies([{ name: 'fixture_session', value: 'alice', url: origin }]);
  await page.goto(origin + '/?motion-debug=1');
  await ready(page);
  check(await page.locator('#walking-voice-join').isVisible() && !(await page.locator('#walking-voice-mic').isVisible()), 'Join is offered once the town reports voice; the microphone control waits for a join');
  const otherContext = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await otherContext.grantPermissions(['microphone'], { origin });
    await otherContext.addInitScript(fakeTransport);
    await otherContext.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
    const other = await otherContext.newPage();
    await other.goto(origin + '/?motion-debug=1');
    await ready(other);
    // Alice joins with Y; her microphone is not asked for.
    await page.locator('#canvas-host').focus();
    await page.keyboard.press('KeyY');
    await waitVoice(page, () => window.__riverVoice?.()?.status === 'joined', 'Alice joins voice with Y');
    const alice = await voice(page);
    check(alice.mic === 'off' && (await page.evaluate(() => window.__riverVoiceFake.mics.length)) === 0, 'Joining connects with the lease token and asks for no microphone');
    check((await page.evaluate(() => window.__riverVoiceFake.room().connected.token)).startsWith('fake.river-oaks.fixture.v1.river-oaks.outdoor.'), 'The token names the server-derived outdoor room, never one the page chose');
    check(await page.locator('#voice-status').textContent() === 'Voice on · microphone off', 'The status region announces the join');
    // M asks for the microphone once; the fake UI grants it.
    await page.keyboard.press('KeyM');
    await waitVoice(page, () => window.__riverVoice?.()?.mic === 'on', 'Unmute turns the microphone on');
    check((await page.evaluate(() => window.__riverVoiceFake.mics.length)) === 1 && (await page.locator('#walking-voice-mic').getAttribute('aria-pressed')) === 'true', 'Unmute requests audio exactly once and the control reads pressed');
    // Bob joins; the town stamps his identity on his player within a reconcile.
    await other.locator('#walking-voice-join').click();
    await waitVoice(other, () => window.__riverVoice?.()?.status === 'joined', 'Bob joins voice from the console button');
    const bobIdentity = (await voice(other)).participantIdentity;
    await page.waitForFunction(id => window.__riverMultiplayer().snapshot?.players.some(player => player.id === 'bob' && player.voice?.id === id), bobIdentity, { timeout: 15000 }).catch(async error => {
      const seen = await page.evaluate(() => (window.__riverMultiplayer().snapshot?.players ?? []).map(player => [player.id, player.voice]));
      const bob = await voice(other);
      throw new Error(`${error.message}\nAlice sees ${JSON.stringify(seen)}\nBob: ${JSON.stringify({ status: bob.status, identity: bob.participantIdentity, space: bob.space, message: bob.message })}`);
    });
    check(true, 'The snapshot carries the server-stamped participant identity for a joined resident');
    // Bob's track arrives through the production audio graph; he stands beside Alice, so full gain.
    await page.evaluate(id => window.__riverVoiceFake.addPeer(id), bobIdentity);
    await waitVoice(page, () => { const peer = window.__riverVoice().peers.bob; return peer && peer.gain > 0.99 && peer.subscribed; }, 'A resident two metres away plays at full gain');
    check((await voice(page)).graphs.includes(bobIdentity), 'A subscribed track gets one audio graph');
    await page.evaluate(id => window.__riverVoiceFake.speak([id]), bobIdentity);
    await page.locator('.remote-player-label[data-peer-id="bob"][data-speaking="true"]').waitFor({ state: 'attached', timeout: 5000 });
    check((await page.locator('.chat-voice').textContent()) === 'Voice on · 1 talking', 'A talking resident gets a nameplate ring and counts in the dock pill');
    // Bob walks away; gain follows the real distance from the snapshot.
    await other.locator('#canvas-host').focus();
    await other.keyboard.down('KeyW'); await other.waitForTimeout(3500); await other.keyboard.up('KeyW');
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => { const peer = window.__riverVoice().peers.bob; return { gain: peer.gain, distance: peer.distance }; });
    check(after.distance > 4.5 && after.gain < 1 && after.gain > 0, `Walking away lowers the gain (${after.gain.toFixed(2)} at ${after.distance.toFixed(1)} m)`);
    // Per-resident mute silences only Bob; deafen silences everyone and mutes the microphone.
    await page.locator('#people-toggle').click();
    await page.getByRole('button', { name: 'Mute voice from bob' }).click();
    await waitVoice(page, () => window.__riverVoice().peers.bob?.muted === true && window.__riverVoice().peers.bob.subscribed === false, 'Muting Bob unsubscribes his track');
    check(await page.evaluate(id => window.__riverVoiceFake.subscribed(id), bobIdentity) === false, 'A muted resident is unsubscribed at the transport');
    await page.getByRole('button', { name: 'Unmute voice from bob' }).click();
    await waitVoice(page, () => window.__riverVoice().peers.bob?.subscribed === true, 'Unmuting Bob resubscribes him');
    await page.locator('.town-chat-dock .voice-deafen').click();
    await waitVoice(page, () => window.__riverVoice().deafened && window.__riverVoice().mic === 'off', 'Deafen mutes the microphone');
    check(await page.evaluate(id => window.__riverVoiceFake.subscribed(id), bobIdentity) === false, 'Deafen unsubscribes every resident');
    await page.locator('.town-chat-dock .voice-deafen').click();
    // Leave with Y: capture stops and the graph goes with it.
    await page.locator('#canvas-host').focus();
    await page.keyboard.press('KeyY');
    await waitVoice(page, () => window.__riverVoice?.()?.status === 'idle', 'Y leaves voice');
    check(!(await page.evaluate(() => window.__riverVoiceFake.micLive())) && (await voice(page)).graphs.length === 0, 'Leaving stops the microphone track and disposes every audio graph');
    await page.waitForFunction(() => window.__riverMultiplayer().snapshot?.players.find(player => player.id === 'alice')?.voice?.id === null, null, { timeout: 15000 });
    check(true, 'The server drops the lease once the resident leaves');
    // Compact layout: the dock row is the control surface with 44 px targets.
    const compact = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
      await compact.grantPermissions(['microphone'], { origin });
      await compact.addInitScript(fakeTransport);
      await compact.addCookies([{ name: 'fixture_session', value: 'guest', url: origin }]);
      const small = await compact.newPage();
      await small.goto(origin + '/?motion-debug=1');
      await ready(small);
      await small.locator('.town-chat-toggle').click();
      const box = await small.locator('.multiplayer-voice .voice-join').boundingBox();
      check(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= 390, 'At 390 px the dock row keeps 44 px targets inside the viewport');
    } finally { await compact.close(); }
    return { checks };
  } finally { await otherContext.close(); }
}
