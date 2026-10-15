import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceChat } from '../src/voice-chat.js';
import { createVoicePreferences } from '../src/voice-preferences.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

function fakeSdk() {
  const sdk = { rooms: [], loads: 0, micCalls: [], micError: null, connectError: null, connectGate: null };
  class Publication { constructor() { this.isSubscribed = true; this.calls = []; } setSubscribed(value) { this.isSubscribed = value; this.calls.push(value); } }
  class Participant { constructor(identity) { this.identity = identity; this.trackPublications = new Map([['t-' + identity, new Publication()]]); } get publication() { return this.trackPublications.get('t-' + this.identity); } }
  class LocalParticipant { constructor(room) { this.room = room; this.micEnabled = false; } async setMicrophoneEnabled(on) { if (on && sdk.micError) throw sdk.micError; this.micEnabled = on; sdk.micCalls.push(on); } }
  class Room {
    constructor(options) { this.options = options; this.handlers = {}; this.localParticipant = new LocalParticipant(this); this.remoteParticipants = new Map(); this.state = 'disconnected'; this.canPlaybackAudio = true; this.disconnected = 0; this.switched = []; sdk.rooms.push(this); }
    on(event, handler) { (this.handlers[event] ??= []).push(handler); return this; }
    emit(event, ...args) { for (const handler of this.handlers[event] ?? []) handler(...args); }
    async connect(url, token, options) { this.connectCalls = [url, token, options]; if (sdk.connectGate) await sdk.connectGate; if (sdk.connectError) throw sdk.connectError; this.state = 'connected'; }
    async disconnect(stopTracks) { this.state = 'disconnected'; this.disconnected++; this.stopTracks = stopTracks; }
    async startAudio() { this.startedAudio = true; this.canPlaybackAudio = true; }
    async switchActiveDevice(kind, id) { this.switched.push([kind, id]); }
    addParticipant(identity) { const participant = new Participant(identity); this.remoteParticipants.set(identity, participant); this.emit('participantConnected', participant); return participant; }
  }
  sdk.Room = Room;
  sdk.RoomEvent = { Connected: 'connected', Disconnected: 'disconnected', ParticipantConnected: 'participantConnected', ParticipantDisconnected: 'participantDisconnected', ActiveSpeakersChanged: 'activeSpeakersChanged', AudioPlaybackStatusChanged: 'audioPlaybackChanged', MediaDevicesError: 'mediaDevicesError', TrackSubscribed: 'trackSubscribed', TrackUnsubscribed: 'trackUnsubscribed' };
  return sdk;
}

function harness({ prefs = {}, storage = new Map(), getListener } = {}) {
  const sdk = fakeSdk(), calls = [], queue = { join: [], renew: [], leave: [] }, timers = [], changes = [], listeners = {};
  let time = 1_000_000;
  const lease = (over = {}) => ({ status: 200, data: { ok: true, url: 'wss://x.livekit.cloud', token: 't1', space: 'outdoor', participantIdentity: 'p1', expiresAt: time + 45_000, renewMs: 15_000, ...over } });
  const request = async (action, body, options) => { calls.push([action, body, options]); const next = queue[action].length ? queue[action].shift() : action === 'join' ? lease() : { status: 200, data: { ok: true } }; if (next instanceof Error) throw next; return next; };
  const preferences = createVoicePreferences({ storage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } });
  if (Object.keys(prefs).length) preferences.set(prefs);
  const schedule = (fn, ms) => { timers.push({ fn, ms, fired: false, cancelled: false }); return timers.length - 1; };
  const cancel = id => { if (timers[id]) timers[id].cancelled = true; };
  const fire = () => { const due = timers.filter(timer => !timer.fired && !timer.cancelled); for (const timer of due) { timer.fired = true; timer.fn(); } return due.length; };
  const pendingTimers = () => timers.filter(timer => !timer.fired && !timer.cancelled);
  const audio = { state: 'suspended', resumes: 0, suspends: 0, closes: 0, resume() { this.state = 'running'; this.resumes++; }, suspend() { this.state = 'suspended'; this.suspends++; }, close() { this.closes++; } };
  const target = () => ({ addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); }, removeEventListener: (type, fn) => { listeners[type] = (listeners[type] ?? []).filter(item => item !== fn); } });
  const doc = { ...target(), visibilityState: 'visible' }, win = target();
  const voice = createVoiceChat({ ...(getListener ? { getListener } : {}), request, preferences, loadTransport: async () => { sdk.loads++; return sdk; }, createAudioContext: () => audio, now: () => time, schedule, cancel, document: doc, window: win, onChange: state => changes.push(`${state.status}/${state.mic}`) });
  const players = (...entries) => entries.map(([id, identity, space = 'outdoor']) => ({ id, name: id, position: [0, 0, 0], altitude: 0, voice: { space, id: identity } }));
  return { voice, sdk, calls, queue, preferences, timers, fire, pendingTimers, audio, doc, win, lease, changes, players, storage,
    emit: (type, ...args) => { for (const fn of listeners[type] ?? []) fn(...args); }, advance: ms => { time += ms; }, room: () => sdk.rooms.at(-1),
    async ready() { voice.setAvailable(true, 'outdoor'); const ok = await voice.join(); await settle(); return ok; } };
}

test('voice stays unavailable until the snapshot reports it, and join is a no-op before the town connects', async () => {
  const h = harness();
  assert.equal(h.voice.state.status, 'unavailable');
  assert.equal(await h.voice.join(), false);
  assert.equal(h.calls.length, 0);
  h.voice.setAvailable(true, 'outdoor');
  assert.equal(h.voice.state.status, 'idle');
  h.voice.setAvailable(false);
  assert.equal(h.voice.state.status, 'unavailable');
});

test('join requests a lease, loads the transport once, connects with the lease token and keeps the microphone off', async () => {
  const h = harness();
  assert.equal(await h.ready(), true);
  assert.deepEqual(h.calls, [['join', {}, undefined]]);
  assert.equal(h.sdk.loads, 1);
  assert.deepEqual(h.room().connectCalls, ['wss://x.livekit.cloud', 't1', { autoSubscribe: true }]);
  assert.equal(h.room().options.disconnectOnPageLeave, true);
  assert.equal(h.room().options.audioCaptureDefaults.echoCancellation, true);
  assert.equal(h.voice.state.status, 'joined');
  assert.equal(h.voice.state.mic, 'off');
  assert.equal(h.voice.state.participantIdentity, 'p1');
  assert.deepEqual(h.sdk.micCalls, []);
  assert.equal(h.audio.resumes, 1, 'the audio context is created and resumed inside the join gesture');
  h.voice.leave();
  await settle();
  assert.equal(await h.voice.join(), true);
  assert.equal(h.sdk.loads, 1, 'the transport module is loaded once');
});

test('a join result that arrives after leave is inert and its room is disconnected', async () => {
  const h = harness();
  h.voice.setAvailable(true, 'outdoor');
  let release;
  h.sdk.connectGate = new Promise(resolve => { release = resolve; });
  const joining = h.voice.join();
  await settle();
  assert.equal(h.voice.state.status, 'joining');
  h.voice.leave();
  release();
  assert.equal(await joining, false);
  await settle();
  assert.equal(h.voice.state.status, 'idle');
  assert.equal(h.room().disconnected, 1, 'the late room is torn down');
  assert.ok(h.calls.some(([action, body]) => action === 'leave' && body.participantIdentity === 'p1'), 'the late lease is released on the server');
});

test('unmute asks for the microphone only on that action and reports denial or missing hardware without leaving', async () => {
  const h = harness();
  await h.ready();
  assert.equal(await h.voice.setMic(true), true);
  assert.deepEqual(h.sdk.micCalls, [true]);
  assert.equal(h.voice.state.mic, 'on');
  assert.equal(h.voice.state.message, 'Voice on · microphone on');
  await h.voice.setMic(false);
  h.sdk.micError = { name: 'NotAllowedError' };
  assert.equal(await h.voice.setMic(true), false);
  assert.equal(h.voice.state.mic, 'denied');
  assert.equal(h.voice.state.status, 'joined');
  h.sdk.micError = { name: 'NotFoundError' };
  await h.voice.toggleMic();
  assert.equal(h.voice.state.mic, 'none');
  assert.equal(h.voice.state.status, 'joined');
});

test('renew runs on the lease cadence; a refused renewal leaves with an authorization message and no timers remain', async () => {
  const h = harness();
  await h.ready();
  assert.deepEqual(h.pendingTimers().map(timer => timer.ms), [15_000]);
  h.advance(15_000);
  h.queue.renew.push({ status: 200, data: { ok: true, token: 't2', expiresAt: 1_000_000 + 60_000, renewMs: 15_000, space: 'outdoor' } });
  h.fire(); await settle();
  assert.deepEqual(h.calls.at(-1), ['renew', { participantIdentity: 'p1' }, undefined]);
  assert.equal(h.voice.state.expiresAt, 1_060_000);
  assert.deepEqual(h.pendingTimers().map(timer => timer.ms), [15_000]);
  h.queue.renew.push({ status: 409, data: { ok: false, error: 'no_lease' } });
  h.fire(); await settle();
  assert.equal(h.voice.state.status, 'idle');
  assert.equal(h.voice.state.message, 'Voice access ended.');
  assert.equal(h.pendingTimers().length, 0);
  assert.equal(h.room().disconnected, 1);
  assert.ok(h.calls.some(([action]) => action === 'leave'));
});

test('a space change from a renewal or the snapshot rejoins the new space while keeping deafen and resident mutes', async () => {
  const h = harness();
  await h.ready();
  const first = h.room();
  h.voice.setDeafened(true);
  h.voice.setPeerMuted('bob', true);
  h.queue.renew.push({ status: 409, data: { ok: false, error: 'space_changed', space: 'osm-node-1' } });
  h.queue.join.push(h.lease({ space: 'osm-node-1', participantIdentity: 'p2', token: 't3' }));
  h.fire(); await settle();
  assert.equal(h.voice.state.status, 'joined');
  assert.equal(h.voice.state.space, 'osm-node-1');
  assert.equal(h.voice.state.participantIdentity, 'p2');
  assert.equal(h.voice.state.deafened, true);
  assert.equal(h.preferences.isMuted('bob'), true);
  assert.equal(first.disconnected, 1);
  assert.deepEqual(h.room().connectCalls, ['wss://x.livekit.cloud', 't3', { autoSubscribe: false }]);
  assert.equal(h.voice.state.message, 'Rejoined voice · microphone off');
  // The snapshot can say it first: our own space differs from the lease.
  h.queue.join.push(h.lease({ space: 'outdoor', participantIdentity: 'p3' }));
  h.voice.sync(h.players(['me', null, 'outdoor']), 'me'); await settle();
  assert.equal(h.voice.state.space, 'outdoor');
  assert.equal(h.voice.state.participantIdentity, 'p3');
});

test('leave, sign-out, pagehide and dispose stop capture, disconnect and release the audio graph once', async () => {
  const h = harness();
  await h.ready();
  await h.voice.setMic(true);
  h.voice.leave('sign-out'); await settle();
  assert.equal(h.room().disconnected, 1);
  assert.equal(h.room().stopTracks, true);
  assert.equal(h.audio.suspends, 1);
  assert.deepEqual(h.calls.at(-1), ['leave', { participantIdentity: 'p1' }, { keepalive: true }]);
  assert.equal(h.voice.state.status, 'idle');
  assert.equal(h.voice.state.mic, 'off');
  await h.voice.join(); await settle();
  h.emit('pagehide'); await settle();
  assert.equal(h.voice.state.status, 'idle');
  assert.deepEqual(h.calls.at(-1), ['leave', { participantIdentity: 'p1' }, { keepalive: true }]);
  const leaves = h.calls.filter(([action]) => action === 'leave').length;
  h.voice.dispose(); await settle();
  assert.equal(h.audio.closes, 1);
  assert.equal(h.calls.filter(([action]) => action === 'leave').length, leaves, 'nothing left to release');
  assert.equal(await h.voice.join(), false, 'disposed controllers never join again');
});

test('hiding the tab mutes the microphone and showing it again does not unmute', async () => {
  const h = harness();
  await h.ready();
  await h.voice.setMic(true);
  h.doc.visibilityState = 'hidden'; h.emit('visibilitychange'); await settle();
  assert.equal(h.voice.state.mic, 'off');
  assert.deepEqual(h.sdk.micCalls, [true, false]);
  h.doc.visibilityState = 'visible'; h.emit('visibilitychange'); await settle();
  assert.equal(h.voice.state.mic, 'off');
  assert.equal(h.voice.state.status, 'joined', 'listening continues');
});

test('deafen unsubscribes every resident and mutes the microphone; undeafen restores only unmuted residents', async () => {
  const h = harness();
  await h.ready();
  h.voice.sync([...h.players(['alice', 'pa'], ['bob', 'pb']), { id: 'me', position: [0, 0, 0], altitude: 0, voice: { space: 'outdoor', id: 'p1' } }], 'me');
  const alice = h.room().addParticipant('pa'), bob = h.room().addParticipant('pb');
  await h.voice.setMic(true);
  h.voice.setDeafened(true);
  assert.equal(alice.publication.isSubscribed, false);
  assert.equal(bob.publication.isSubscribed, false);
  await settle();
  assert.equal(h.voice.state.mic, 'off');
  assert.equal(h.voice.state.message, 'Voice on · deafened');
  assert.equal(await h.voice.setMic(true), false, 'no talking while deafened');
  h.voice.setPeerMuted('bob', true);
  h.voice.setDeafened(false);
  assert.equal(alice.publication.isSubscribed, true);
  assert.equal(bob.publication.isSubscribed, false);
  assert.equal(h.voice.state.peers.get('bob').muted, true);
  h.voice.setPeerMuted('bob', false);
  assert.equal(bob.publication.isSubscribed, true);
});

test('a resident mute silences and unsubscribes that resident only and survives a reload', async () => {
  const storage = new Map();
  const h = harness({ storage });
  await h.ready();
  h.voice.sync([...h.players(['alice', 'pa'], ['bob', 'pb']), { id: 'me', position: [0, 0, 0], altitude: 0, voice: { space: 'outdoor', id: 'p1' } }], 'me');
  const alice = h.room().addParticipant('pa'), bob = h.room().addParticipant('pb');
  h.voice.setPeerMuted('bob', true);
  assert.equal(alice.publication.isSubscribed, true);
  assert.equal(bob.publication.isSubscribed, false);
  const reloaded = harness({ storage });
  assert.equal(reloaded.preferences.isMuted('bob'), true);
  await reloaded.ready();
  reloaded.voice.sync([...reloaded.players(['bob', 'pb']), { id: 'me', position: [0, 0, 0], altitude: 0, voice: { space: 'outdoor', id: 'p1' } }], 'me');
  const again = reloaded.room().addParticipant('pb');
  assert.equal(again.publication.isSubscribed, false);
});

test('blocked playback exposes an unlock action that resumes the context and starts room audio', async () => {
  const h = harness();
  await h.ready();
  h.room().canPlaybackAudio = false;
  h.room().emit('audioPlaybackChanged');
  assert.equal(h.voice.state.playbackBlocked, true);
  await h.voice.unlockAudio();
  assert.equal(h.room().startedAudio, true);
  assert.equal(h.voice.state.playbackBlocked, false);
});

test('a network failure during join returns to idle with a retry message, and a 409 explains itself', async () => {
  const h = harness();
  h.voice.setAvailable(true, 'outdoor');
  h.queue.join.push(new Error('network'));
  assert.equal(await h.voice.join(), false);
  assert.equal(h.voice.state.status, 'idle');
  assert.equal(h.voice.state.message, 'Voice could not connect. Try again.');
  h.queue.join.push({ status: 409, data: { ok: false, error: 'not_connected' } });
  await h.voice.join();
  assert.equal(h.voice.state.message, 'Join the town first.');
  h.queue.join.push({ status: 409, data: { ok: false, error: 'no_space' } });
  await h.voice.join();
  assert.equal(h.voice.state.message, 'No voice in this place.');
  h.queue.join.push({ status: 503, data: { ok: false, error: 'voice_unavailable' } });
  await h.voice.join();
  assert.equal(h.voice.state.message, 'Voice unavailable');
  assert.equal(h.voice.state.status, 'idle');
  assert.equal(h.sdk.rooms.length, 0, 'no room is created without a lease');
});

test('speaking events map participants to players through the snapshot voice identity', async () => {
  const h = harness();
  await h.ready();
  h.voice.sync([...h.players(['alice', 'pa'], ['bob', 'pb']), { id: 'me', position: [0, 0, 0], altitude: 0, voice: { space: 'outdoor', id: 'p1' } }], 'me');
  h.room().addParticipant('pa'); h.room().addParticipant('stranger');
  h.room().emit('activeSpeakersChanged', [{ identity: 'pa' }, { identity: 'stranger' }]);
  assert.deepEqual([...h.voice.speakingIds], ['alice']);
  assert.equal(h.voice.playerFor('stranger'), null, 'an identity the snapshot never named maps to nobody');
  h.room().emit('activeSpeakersChanged', []);
  assert.deepEqual([...h.voice.speakingIds], []);
  h.room().emit('participantDisconnected', { identity: 'pa' });
  assert.equal(h.voice.state.peers.has('alice'), false);
});

test('push to talk unmutes while held and releases on blur', async () => {
  const h = harness({ prefs: { pushToTalk: true } });
  await h.ready();
  h.voice.setTransmit(true); await settle();
  assert.equal(h.voice.state.mic, 'on');
  h.emit('blur'); await settle();
  assert.equal(h.voice.state.mic, 'off');
  assert.deepEqual(h.sdk.micCalls, [true, false]);
  const open = harness();
  await open.ready();
  open.voice.setTransmit(true); await settle();
  assert.equal(open.voice.state.mic, 'off', 'open-microphone mode ignores the hold');
});

test('our own revocation in the snapshot ends voice, but not before the room tick has had time to stamp us', async () => {
  const h = harness();
  await h.ready();
  h.voice.sync([{ id: 'me', position: [0, 0, 0], altitude: 0, voice: { space: 'outdoor', id: null } }], 'me'); await settle();
  assert.equal(h.voice.state.status, 'joined', 'unstamped right after joining');
  h.advance(3000);
  h.voice.sync([{ id: 'me', position: [0, 0, 0], altitude: 0, voice: { space: 'outdoor', id: null } }], 'me'); await settle();
  assert.equal(h.voice.state.status, 'idle');
  assert.equal(h.voice.state.message, 'Voice access ended.');
});

test('a lost town connection leaves quietly and rejoins once the town is back, with the microphone as it was', async () => {
  const h = harness();
  const back = () => h.voice.sync([{ id: 'me', position: [0, 0, 0], altitude: 0, voice: { space: 'outdoor', id: null } }], 'me');
  await h.ready();
  await h.voice.setMic(true);
  const leaves = h.calls.filter(([action]) => action === 'leave').length;
  h.voice.onConnectionLost(false); await settle();
  assert.equal(h.voice.state.status, 'idle');
  assert.equal(h.calls.filter(([action]) => action === 'leave').length, leaves, 'the server already knows: the lease dies with the connection');
  h.advance(5_000); back(); await settle();
  assert.equal(h.voice.state.status, 'joined');
  assert.equal(h.voice.state.mic, 'on', 'a quick reconnect keeps the resident talking');
  // After a long outage the microphone stays off until the resident turns it on.
  h.voice.onConnectionLost(false); await settle();
  h.advance(61_000); back(); await settle();
  assert.equal(h.voice.state.status, 'joined');
  assert.equal(h.voice.state.mic, 'off');
  // A microphone that was off stays off.
  h.voice.onConnectionLost(false); await settle();
  h.advance(1_000); back(); await settle();
  assert.equal(h.voice.state.mic, 'off');
  h.voice.onConnectionLost(true); await settle();
  back(); await settle();
  assert.equal(h.voice.state.status, 'idle', 'a terminal close does not come back by itself');
});

test('a move to a fresh town socket takes a fresh voice lease and keeps the microphone and deafen', async () => {
  const h = harness();
  await h.ready();
  await h.voice.setMic(true);
  const joins = h.calls.filter(([action]) => action === 'join').length;
  h.voice.onConnectionChanged(); await settle();
  assert.equal(h.calls.filter(([action]) => action === 'join').length, joins + 1, 'a lease for the fresh connection');
  assert.equal(h.voice.state.status, 'joined');
  assert.equal(h.voice.state.mic, 'on');
  // Nothing to do when voice is not joined.
  h.voice.leave('user'); await settle();
  const after = h.calls.filter(([action]) => action === 'join').length;
  h.voice.onConnectionChanged(); await settle();
  assert.equal(h.calls.filter(([action]) => action === 'join').length, after);
});

test('a changed microphone preference switches the live room\'s input device', async () => {
  const h = harness();
  await h.ready();
  h.preferences.set({ deviceId: 'mic-2' });
  await settle();
  assert.deepEqual(h.room().switched, [['audioinput', 'mic-2']]);
});

test('a performer on the plaza stage is heard across the plaza, where someone talking is not', async () => {
  const listener = { position: [0, 0, 0], yaw: 0 };
  const h = harness({ getListener: () => listener });
  await h.ready();
  // Both residents stand 30 m away; Alice is performing on the stage.
  const far = [{ id: 'alice', name: 'Alice', position: [30, 0, 0], altitude: 0, performing: true, voice: { space: 'outdoor', id: 'pa' } },
    { id: 'bob', name: 'Bob', position: [0, 30, 0], altitude: 0, performing: false, voice: { space: 'outdoor', id: 'pb' } },
    { id: 'me', position: [0, 0, 0], altitude: 0, voice: { space: 'outdoor', id: 'p1' } }];
  h.voice.sync(far, 'me');
  const alice = h.room().addParticipant('pa'), bob = h.room().addParticipant('pb');
  h.voice.sync(far, 'me');
  assert.equal(alice.publication.isSubscribed, true);
  assert.ok(h.voice.state.peers.get('alice').gain > 0, 'the performer carries 30 m');
  assert.equal(bob.publication.isSubscribed, false);
  assert.equal(h.voice.state.peers.get('bob').gain, 0);
  // Stepping down from the stage brings Alice back to talking reach.
  h.voice.sync(far.map(player => player.id === 'alice' ? { ...player, performing: false } : player), 'me');
  assert.equal(alice.publication.isSubscribed, false);
});
