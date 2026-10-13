// Shared voice in the browser: the client side of server/voice.js. The town
// server names the room and the identity; this controller only joins what it
// was handed, keeps the lease renewed, and stops capture the moment voice ends.
// Every asynchronous step is fenced by a generation counter (as speech.js does
// for synthesized lines), so a late join, token or microphone grant from an
// earlier attempt is disposed instead of applied.
const MESSAGES = {
  idle: 'Voice off', joining: 'Joining voice…', joined: 'Voice on · microphone off', talking: 'Voice on · microphone on',
  deafened: 'Voice on · deafened', rejoining: 'Changing rooms…', unavailable: 'Voice unavailable', denied: 'Microphone blocked. Allow it in the browser address bar.',
  none: 'No microphone found.', ended: 'Voice access ended.', lost: 'Voice could not connect. Try again.', notConnected: 'Join the town first.', noSpace: 'No voice in this place.', full: 'This room is full right now.',
  reconnected: 'Rejoined voice · microphone off',
};
// A snapshot stamps a joined player's identity on the next room tick; before
// that, an unstamped entry is not yet a revocation.
const STAMP_GRACE_MS = 2500, RENEW_RETRY_MS = 10_000, STATUSES = ['unavailable', 'idle', 'joining', 'joined', 'rejoining', 'error'];

export function createVoiceChat({ request, preferences, loadTransport = () => import('livekit-client'), createAudioContext = () => new AudioContext(),
  now = () => Date.now(), schedule = (fn, ms) => setTimeout(fn, ms), cancel = id => clearTimeout(id),
  document: doc = globalThis.document, window: win = globalThis.window, onChange = () => {} } = {}) {
  if (typeof request !== 'function' || !preferences) throw new Error('Voice needs a request function and preferences');
  const state = { status: 'unavailable', mic: 'off', deafened: false, playbackBlocked: false, space: null, participantIdentity: null, expiresAt: 0, message: MESSAGES.unavailable, peers: new Map() };
  let generation = 0, room = null, sdk = null, audioContext = null, renewTimer = null, renewRetried = false, joinedAt = 0;
  let available = false, authorizedSpace = null, wanted = false, micGranted = false, disposed = false, token = null;
  const identityToPlayer = new Map(), playerToIdentity = new Map();
  const listeners = [];
  const set = patch => { Object.assign(state, patch); onChange(snapshot()); };
  const stale = gen => disposed || gen !== generation;
  const label = () => state.status === 'joined' ? (state.deafened ? MESSAGES.deafened : state.mic === 'on' ? MESSAGES.talking : MESSAGES.joined) : MESSAGES[state.status] ?? '';
  function snapshot() {
    return { status: state.status, mic: state.mic, deafened: state.deafened, playbackBlocked: state.playbackBlocked, space: state.space, participantIdentity: state.participantIdentity, expiresAt: state.expiresAt, message: state.message,
      peers: new Map([...state.peers].map(([id, peer]) => [id, { ...peer }])), speaking: speakingIds(), pushToTalk: preferences.get().pushToTalk, available };
  }
  const speakingIds = () => new Set([...state.peers].filter(([, peer]) => peer.speaking).map(([id]) => id));
  const on = (target, type, handler, options) => { target?.addEventListener?.(type, handler, options); listeners.push(() => target?.removeEventListener?.(type, handler, options)); };
  const ensureAudio = () => {
    try { audioContext ??= createAudioContext(); if (audioContext.state === 'suspended') void audioContext.resume?.(); } catch { audioContext = null; }
    return audioContext;
  };
  const transport = async () => sdk ??= await loadTransport();
  const peerFor = identity => {
    const playerId = identityToPlayer.get(identity);
    if (!playerId) return null;
    if (!state.peers.has(playerId)) state.peers.set(playerId, { identity, speaking: false, muted: preferences.isMuted(playerId), subscribed: true, gain: 1, pan: 0 });
    return state.peers.get(playerId);
  };
  const applySubscriptions = () => {
    if (!room) return;
    for (const participant of room.remoteParticipants.values()) {
      const playerId = identityToPlayer.get(participant.identity), peer = playerId && state.peers.get(playerId);
      const subscribe = !state.deafened && !(peer?.muted);
      for (const publication of participant.trackPublications?.values?.() ?? []) if (publication.isSubscribed !== subscribe) publication.setSubscribed?.(subscribe);
      if (peer) peer.subscribed = subscribe;
    }
  };
  function bindRoom(target, gen) {
    const events = sdk.RoomEvent;
    target.on(events.ParticipantConnected, participant => { if (stale(gen)) return; peerFor(participant.identity); applySubscriptions(); set({}); });
    target.on(events.ParticipantDisconnected, participant => {
      if (stale(gen)) return;
      const playerId = identityToPlayer.get(participant.identity);
      if (playerId) state.peers.delete(playerId);
      set({});
    });
    target.on(events.ActiveSpeakersChanged, speakers => {
      if (stale(gen)) return;
      const active = new Set(speakers.map(speaker => speaker.identity));
      for (const peer of state.peers.values()) peer.speaking = active.has(peer.identity);
      set({});
    });
    target.on(events.AudioPlaybackStatusChanged, () => { if (!stale(gen)) set({ playbackBlocked: !target.canPlaybackAudio }); });
    target.on(events.MediaDevicesError, error => { if (!stale(gen)) set({ mic: micState(error), message: MESSAGES[micState(error)] ?? label() }); });
    target.on(events.Disconnected, () => {
      if (stale(gen) || room !== target) return;
      // The provider dropped us (or the server removed us). One rejoin; then stop.
      if (state.status === 'joined' && available && !state.rejoinedOnce) { state.rejoinedOnce = true; void rejoin(); }
      else endRoom('error', MESSAGES.lost);
    });
  }
  const micState = error => error?.name === 'NotAllowedError' || error?.name === 'SecurityError' ? 'denied' : error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError' ? 'none' : 'off';
  function disposePeers() { state.peers.clear(); }
  function stopRenew() { if (renewTimer !== null) cancel(renewTimer); renewTimer = null; }
  function scheduleRenew(ms) { stopRenew(); renewTimer = schedule(() => { renewTimer = null; void renew(); }, Math.max(1000, ms)); }
  // Tears down the LiveKit room and capture; the lease on the server is told
  // separately by leave(), which is the only caller allowed to skip that.
  function endRoom(status, message, { keepIntent = false } = {}) {
    generation++;
    stopRenew();
    const current = room; room = null;
    if (current) { try { void current.disconnect(true)?.catch?.(() => {}); } catch { /* already gone */ } }
    disposePeers();
    try { void audioContext?.suspend?.(); } catch { /* audio graph may be gone */ }
    if (!keepIntent) wanted = false;
    set({ status, mic: 'off', playbackBlocked: false, space: null, participantIdentity: null, expiresAt: 0, message, rejoinedOnce: false });
    token = null;
  }
  async function connectLease(gen, rejoining) {
    const { status, data } = await request('join', {});
    if (stale(gen)) return false;
    if (status !== 200) {
      const reason = data?.error;
      if (status === 503 || status === 404) { set({ status: 'idle', message: MESSAGES.unavailable }); return false; }
      if (reason === 'not_connected') { set({ status: 'idle', message: MESSAGES.notConnected }); return false; }
      if (reason === 'no_space') { set({ status: 'idle', message: MESSAGES.noSpace }); return false; }
      if (status === 429) { set({ status: 'idle', message: MESSAGES.full }); return false; }
      set({ status: 'error', message: MESSAGES.ended }); return false;
    }
    const module = await transport();
    if (stale(gen)) return false;
    const preference = preferences.get();
    const target = new module.Room({ adaptiveStream: false, dynacast: false, disconnectOnPageLeave: true, stopLocalTrackOnUnpublish: true,
      audioCaptureDefaults: { ...(preference.deviceId ? { deviceId: preference.deviceId } : {}), echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    bindRoom(target, gen);
    try { await target.connect(data.url, data.token, { autoSubscribe: !state.deafened }); }
    catch { if (!stale(gen)) { set({ status: 'idle', message: MESSAGES.lost }); void request('leave', { participantIdentity: data.participantIdentity }).catch(() => {}); } return false; }
    if (stale(gen)) { void target.disconnect(true)?.catch?.(() => {}); void request('leave', { participantIdentity: data.participantIdentity }).catch(() => {}); return false; }
    room = target; token = data.token; joinedAt = now(); renewRetried = false;
    set({ status: 'joined', space: data.space, participantIdentity: data.participantIdentity, expiresAt: data.expiresAt, playbackBlocked: target.canPlaybackAudio === false, message: rejoining ? MESSAGES.reconnected : MESSAGES.joined });
    scheduleRenew(data.renewMs ?? 15_000);
    applySubscriptions();
    if (preferences.get().autoUnmute && micGranted && !state.deafened) await setMic(true);
    return true;
  }
  async function join() {
    if (disposed || !['idle', 'error'].includes(state.status) || !available) return false;
    const gen = ++generation;
    wanted = true;
    ensureAudio();
    set({ status: 'joining', message: MESSAGES.joining });
    try { return await connectLease(gen, false); }
    catch { if (!stale(gen)) set({ status: 'idle', message: MESSAGES.lost }); return false; }
  }
  async function rejoin() {
    if (disposed || !available) return false;
    const previous = { deafened: state.deafened, mic: state.mic };
    endRoom('rejoining', MESSAGES.rejoining, { keepIntent: true });
    const gen = ++generation;
    try {
      const ok = await connectLease(gen, true);
      if (ok && previous.mic === 'on' && micGranted && !previous.deafened) await setMic(true);
      return ok;
    } catch { if (!stale(gen)) set({ status: 'error', message: MESSAGES.lost }); return false; }
  }
  async function renew() {
    if (state.status !== 'joined' || !state.participantIdentity) return;
    const gen = generation;
    let response;
    try { response = await request('renew', { participantIdentity: state.participantIdentity }); }
    catch { if (stale(gen)) return; if (!renewRetried) { renewRetried = true; scheduleRenew(RENEW_RETRY_MS); } else leave('lost'); return; }
    if (stale(gen)) return;
    const { status, data } = response;
    if (status === 200) { renewRetried = false; token = data.token; set({ expiresAt: data.expiresAt }); scheduleRenew(data.renewMs ?? 15_000); return; }
    if (status === 409 && data?.error === 'space_changed') { void rejoin(); return; }
    if (status === 503) { if (!renewRetried) { renewRetried = true; scheduleRenew(RENEW_RETRY_MS); } else leave('lost'); return; }
    leave('revoked');
  }
  async function setMic(on) {
    if (state.status !== 'joined' || !room) return false;
    const gen = generation;
    if (!on) {
      try { await room.localParticipant.setMicrophoneEnabled(false); } catch { /* nothing to release */ }
      if (!stale(gen)) { state.mic = 'off'; set({ message: label() }); }
      return true;
    }
    if (state.deafened) return false;
    set({ mic: 'requesting', message: 'Asking for the microphone…' });
    try {
      ensureAudio();
      await room.localParticipant.setMicrophoneEnabled(true);
      if (stale(gen)) { try { await room?.localParticipant.setMicrophoneEnabled(false); } catch { /* already gone */ } return false; }
      micGranted = true;
      state.mic = 'on';
      set({ message: label() });
      return true;
    } catch (error) {
      if (stale(gen)) return false;
      const kind = micState(error);
      set({ mic: kind, message: kind === 'off' ? MESSAGES.lost : MESSAGES[kind] });
      return false;
    }
  }
  function leave(reason = 'user', { rejoinWanted = false } = {}) {
    const identity = state.participantIdentity, was = state.status;
    const message = reason === 'revoked' ? MESSAGES.ended : reason === 'lost' ? MESSAGES.lost : reason === 'connection' ? MESSAGES.idle : MESSAGES.idle;
    endRoom(available ? 'idle' : 'unavailable', available ? message : MESSAGES.unavailable, { keepIntent: rejoinWanted && ['joined', 'rejoining', 'joining'].includes(was) });
    if (identity && reason !== 'connection') void request('leave', { participantIdentity: identity }, { keepalive: reason === 'pagehide' || reason === 'sign-out' }).catch(() => {});
  }
  function setAvailable(value, space = null) {
    const next = Boolean(value);
    authorizedSpace = space;
    if (next === available) return;
    available = next;
    if (!available) endRoom('unavailable', MESSAGES.unavailable, { keepIntent: true });
    else if (state.status === 'unavailable') set({ status: 'idle', message: MESSAGES.idle });
  }
  // Snapshot cadence: map identities to players, notice our own revocation or
  // space change, and come back after a dropped town connection.
  function sync(players, selfId) {
    identityToPlayer.clear(); playerToIdentity.clear();
    let self = null;
    for (const player of players ?? []) {
      if (player.id === selfId) { self = player; continue; }
      const identity = player.voice?.id;
      if (identity) { identityToPlayer.set(identity, player.id); playerToIdentity.set(player.id, identity); }
    }
    for (const [playerId, peer] of state.peers) if (playerToIdentity.get(playerId) !== peer.identity) state.peers.delete(playerId);
    if (state.status === 'joined' && self) {
      const stamped = self.voice?.id ?? null, space = self.voice?.space ?? null;
      if (space !== state.space) { void rejoin(); return; }
      if (stamped !== state.participantIdentity && now() - joinedAt > STAMP_GRACE_MS) { leave('revoked'); return; }
    }
    if (wanted && state.status === 'idle' && available) void join();
  }
  function setDeafened(value) {
    const deafened = Boolean(value);
    if (deafened === state.deafened) return;
    state.deafened = deafened;
    applySubscriptions();
    if (deafened && state.mic === 'on') void setMic(false);
    set({ message: label() });
  }
  function setPeerMuted(playerId, muted) {
    preferences.setMuted(playerId, Boolean(muted));
    const peer = state.peers.get(playerId);
    if (peer) peer.muted = Boolean(muted);
    applySubscriptions();
    set({});
  }
  async function unlockAudio() {
    ensureAudio();
    try { await room?.startAudio?.(); } catch { /* still blocked */ }
    set({ playbackBlocked: room ? room.canPlaybackAudio === false : false });
  }
  let held = false;
  function setTransmit(value) {
    const next = Boolean(value);
    if (next === held) return;
    held = next;
    if (!preferences.get().pushToTalk || state.status !== 'joined') return;
    void setMic(held);
  }
  on(doc, 'visibilitychange', () => { if (doc.visibilityState === 'hidden' && state.mic === 'on') void setMic(false); });
  on(win, 'blur', () => setTransmit(false));
  on(win, 'pagehide', () => { if (state.status !== 'unavailable' && state.status !== 'idle') leave('pagehide'); });
  const unsubscribe = preferences.subscribe(next => { if (room && next.deviceId) void room.switchActiveDevice?.('audioinput', next.deviceId).catch?.(() => {}); });
  return {
    get state() { return snapshot(); },
    get speakingIds() { return speakingIds(); },
    join, leave, rejoin, renew, setMic, toggleMic: () => setMic(state.mic !== 'on'), toggleJoin: () => state.status === 'joined' || state.status === 'joining' || state.status === 'rejoining' ? leave('user') : join(),
    setTransmit, setDeafened, setPeerMuted, unlockAudio, setAvailable, sync,
    onConnectionLost(terminal) { if (['joined', 'joining', 'rejoining'].includes(state.status)) leave('connection', { rejoinWanted: !terminal }); },
    playerFor: identity => identityToPlayer.get(identity) ?? null,
    debug() { return { ...snapshot(), peers: Object.fromEntries(snapshot().peers), speaking: [...speakingIds()], wanted, micGranted, hasRoom: Boolean(room), hasAudioContext: Boolean(audioContext), renewScheduled: renewTimer !== null, statuses: STATUSES }; },
    dispose() {
      if (disposed) return;
      leave('dispose');
      disposed = true;
      unsubscribe();
      for (const off of listeners.splice(0)) off();
      try { void audioContext?.close?.(); } catch { /* already closed */ }
      audioContext = null;
    },
  };
}
