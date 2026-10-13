import test from 'node:test';
import assert from 'node:assert/strict';
import { createPeerGraph, spatialGain } from '../src/voice-spatial.js';
import { createVoiceChat } from '../src/voice-chat.js';
import { createVoicePreferences } from '../src/voice-preferences.js';

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
function fakeContext() {
  const nodes = [];
  const param = () => ({ value: 0, targets: [], setTargetAtTime(value) { this.value = value; this.targets.push(value); } });
  const node = (kind, extra = {}) => { const n = { kind, connections: [], disconnected: 0, connect(target) { this.connections.push(target); }, disconnect() { this.disconnected++; }, ...extra }; nodes.push(n); return n; };
  return { nodes, currentTime: 0, state: 'running', destination: { kind: 'destination' }, resume() {}, suspend() {}, close() {},
    createMediaStreamSource: stream => node('source', { stream }), createGain: () => node('gain', { gain: param() }), createStereoPanner: () => node('panner', { pan: param() }) };
}
const fakeTrack = () => { const element = { muted: false, volume: 1, srcObject: null }; return { kind: 'audio', mediaStream: { id: 'stream' }, element, attached: 0, detached: 0, attach() { this.attached++; element.srcObject = this.mediaStream; return element; }, detach() { this.detached++; } }; };

test('a peer graph attaches a muted element, starts silent, ramps gain and pan, and disconnects everything once', () => {
  const context = fakeContext(), track = fakeTrack();
  const graph = createPeerGraph(context, track);
  assert.equal(track.attached, 1);
  assert.equal(track.element.muted, true);
  assert.equal(track.element.volume, 0);
  assert.equal(graph.gain, 0);
  const [source, gain, panner] = context.nodes;
  assert.deepEqual([source.connections[0], gain.connections[0], panner.connections[0]], [gain, panner, context.destination]);
  graph.update(0.5, -0.3);
  assert.equal(gain.gain.value, 0.5);
  assert.equal(panner.pan.value, -0.3);
  graph.update(7, 4);
  assert.deepEqual([gain.gain.value, panner.pan.value], [1, 1], 'levels are clamped');
  graph.dispose(); graph.dispose();
  assert.deepEqual(context.nodes.map(n => n.disconnected), [1, 1, 1]);
  assert.equal(track.detached, 1);
  assert.equal(track.element.srcObject, null);
  graph.update(1, 0);
  assert.equal(gain.gain.value, 1, 'a disposed graph ignores updates');
  assert.throws(() => createPeerGraph(context, { kind: 'audio', attach: () => null }));
});

function harness() {
  const graphs = [];
  const context = fakeContext();
  let listener = { position: [0, 0, 0], yaw: 0 };
  const sdk = { loads: 0, rooms: [] };
  class Room {
    constructor() { this.handlers = {}; this.remoteParticipants = new Map(); this.localParticipant = { async setMicrophoneEnabled() {} }; this.canPlaybackAudio = true; sdk.rooms.push(this); }
    on(event, handler) { (this.handlers[event] ??= []).push(handler); return this; }
    emit(event, ...args) { for (const handler of this.handlers[event] ?? []) handler(...args); }
    async connect() {} async disconnect() { this.disconnected = true; }
    addPeer(identity) { const track = fakeTrack(), publication = { isSubscribed: true, calls: [], setSubscribed(value) { this.isSubscribed = value; this.calls.push(value); } }; const participant = { identity, trackPublications: new Map([['t', publication]]) }; this.remoteParticipants.set(identity, participant); this.emit('participantConnected', participant); this.emit('trackSubscribed', track, publication, participant); return { track, publication, participant }; }
  }
  sdk.Room = Room;
  sdk.RoomEvent = { Connected: 'connected', Disconnected: 'disconnected', ParticipantConnected: 'participantConnected', ParticipantDisconnected: 'participantDisconnected', ActiveSpeakersChanged: 'activeSpeakersChanged', AudioPlaybackStatusChanged: 'audioPlaybackChanged', MediaDevicesError: 'mediaDevicesError', TrackSubscribed: 'trackSubscribed', TrackUnsubscribed: 'trackUnsubscribed' };
  const preferences = createVoicePreferences({ storage: null });
  const voice = createVoiceChat({ request: async action => action === 'join' ? { status: 200, data: { ok: true, url: 'wss://x', token: 't', space: 'outdoor', participantIdentity: 'me', expiresAt: 9e12, renewMs: 15_000 } } : { status: 200, data: { ok: true } },
    preferences, loadTransport: async () => sdk, createAudioContext: () => context, getListener: () => listener, schedule: () => 0, cancel: () => {},
    buildGraph: (ctx, track) => { const graph = createPeerGraph(ctx, track); graphs.push(graph); return graph; }, document: { addEventListener() {}, removeEventListener() {} }, window: { addEventListener() {}, removeEventListener() {} } });
  const player = (id, identity, east, north, altitude = 0) => ({ id, name: id, position: [east, north, 0], altitude, voice: { space: 'outdoor', id: identity } });
  return { voice, context, graphs, room: () => sdk.rooms.at(-1), player, setListener: value => { listener = value; } };
}

test('a subscribed track gets a graph whose gain and pan follow the resident\'s distance and bearing from the snapshot', async () => {
  const h = harness();
  h.voice.setAvailable(true, 'outdoor'); await h.voice.join(); await settle();
  const bob = h.room().addPeer('pb');
  assert.equal(h.graphs.length, 1);
  assert.equal(h.graphs[0].gain, 0, 'silent until the snapshot names the player');
  h.voice.sync([h.player('bob', 'pb', 2, 0), h.player('me', 'me', 0, 0)], 'me');
  let peer = h.voice.state.peers.get('bob');
  assert.equal(peer.gain, 1);
  assert.ok(peer.pan > 0.7, 'two metres east of a listener facing north pans right');
  assert.equal(peer.distance, 2);
  h.voice.sync([h.player('bob', 'pb', 0, -12, 0), h.player('me', 'me', 0, 0)], 'me');
  peer = h.voice.state.peers.get('bob');
  assert.ok(peer.gain > 0 && peer.gain < 1, `mid range gain ${peer.gain}`);
  assert.ok(Math.abs(peer.pan) < 1e-9, 'twelve metres behind pans centre');
  h.voice.sync([h.player('bob', 'pb', 30, 0), h.player('me', 'me', 0, 0)], 'me');
  peer = h.voice.state.peers.get('bob');
  assert.equal(peer.subscribed, false, 'past 25 m the track is unsubscribed');
  assert.equal(bob.publication.isSubscribed, false);
  assert.equal(peer.gain, 0);
  h.voice.sync([h.player('bob', 'pb', 23, 0), h.player('me', 'me', 0, 0)], 'me');
  assert.equal(h.voice.state.peers.get('bob').subscribed, false, 'hysteresis: not yet inside 22 m');
  h.voice.sync([h.player('bob', 'pb', 10, 0), h.player('me', 'me', 0, 0)], 'me');
  assert.equal(h.voice.state.peers.get('bob').subscribed, true);
  assert.ok(Math.abs(h.graphs[0].gain - spatialGain(10)) < 1e-9, 'the graph carries the curve value at ten metres');
  h.room().emit('trackUnsubscribed', bob.track, bob.publication, bob.participant);
  assert.equal(h.context.nodes.filter(n => n.disconnected).length, 3, 'an unsubscribed track releases its graph');
  assert.deepEqual(h.voice.debug().graphs, []);
});

test('mute, deafen and leave silence through the graph and dispose it once', async () => {
  const h = harness();
  h.voice.setAvailable(true, 'outdoor'); await h.voice.join(); await settle();
  const bob = h.room().addPeer('pb');
  h.voice.sync([h.player('bob', 'pb', 1, 0), h.player('me', 'me', 0, 0)], 'me');
  assert.equal(h.graphs[0].gain, 1);
  h.voice.setPeerMuted('bob', true);
  assert.equal(h.graphs[0].gain, 0);
  assert.equal(bob.publication.isSubscribed, false);
  h.voice.setPeerMuted('bob', false);
  assert.equal(h.graphs[0].gain, 1);
  h.voice.setDeafened(true);
  assert.equal(h.graphs[0].gain, 0);
  h.voice.setDeafened(false);
  assert.equal(h.graphs[0].gain, 1);
  h.voice.leave();
  assert.deepEqual(h.context.nodes.map(n => n.disconnected), [1, 1, 1]);
  assert.deepEqual(h.voice.debug().graphs, []);
  assert.equal(h.voice.state.peers.size, 0);
  h.voice.dispose();
  assert.deepEqual(h.context.nodes.map(n => n.disconnected), [1, 1, 1], 'dispose after leave releases nothing twice');
});
