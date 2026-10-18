import test from 'node:test';
import assert from 'node:assert/strict';
import { SCREENING_MEDIA } from '../src/screening-contract.js';
import { panelClearance, screeningCommand, screeningControls, screeningFilmDetails, screeningStatusText } from '../src/ipic-screening-ui.js';

const FILM = SCREENING_MEDIA['ipic-fixture-v1'];
const shared = (status, more = {}) => ({ venueId: 'ipic', status, revision: 4, epoch: 'e1', mediaId: status === 'stopped' ? null : FILM.id, ...more });
const visible = controls => controls.filter(item => !item.hidden).map(item => item.id);

test('viewers get local controls only; the host also gets the shared ones', () => {
  const viewer = screeningControls({ shared: shared('playing'), local: 'playing', canHost: false, inAuditorium: true, sound: false, captions: true });
  assert.deepEqual(visible(viewer), ['sound', 'volume', 'captions', 'transcript', 'stop-watching']);
  const host = screeningControls({ shared: shared('playing'), local: 'playing', canHost: true, inAuditorium: true, sound: false, captions: true });
  assert.deepEqual(visible(host), ['host-pause', 'host-stop', 'sound', 'volume', 'captions', 'transcript', 'stop-watching']);
  assert.deepEqual(visible(screeningControls({ shared: shared('paused'), local: 'paused', canHost: true, inAuditorium: true })), ['host-play', 'host-stop', 'sound', 'volume', 'captions', 'transcript', 'stop-watching']);
  assert.deepEqual(visible(screeningControls({ shared: shared('stopped'), local: 'idle', canHost: true, inAuditorium: true })), ['host-start']);
  assert.deepEqual(visible(screeningControls({ shared: shared('ended'), local: 'ended', canHost: true, inAuditorium: true })), ['host-start', 'host-stop', 'sound', 'volume', 'captions', 'transcript', 'stop-watching']);
  assert.deepEqual(visible(screeningControls({ shared: shared('stopped'), local: 'idle', canHost: false, inAuditorium: true })), [], 'nothing to show a viewer before a film');
});

test('local trouble offers its own way out, never a shared change', () => {
  const blocked = screeningControls({ shared: shared('playing'), local: 'blocked', canHost: false, inAuditorium: true });
  assert.equal(blocked.find(item => item.id === 'play-local').hidden, false);
  for (const local of ['error', 'unsupported']) {
    const controls = screeningControls({ shared: shared('playing'), local, canHost: false, inAuditorium: true });
    assert.equal(controls.find(item => item.id === 'retry').hidden, local === 'unsupported', local);
    assert.equal(controls.find(item => item.id === 'stop-watching').hidden, false, `${local} keeps a way out`);
  }
  const lounge = screeningControls({ shared: shared('playing'), local: 'playing', canHost: false, inAuditorium: false, sound: true });
  assert.equal(lounge.find(item => item.id === 'sound').disabled, true, 'sound plays only in the auditorium');
});

test('status text separates the shared film from this viewer’s decoder', () => {
  assert.match(screeningStatusText({ shared: shared('playing'), local: 'buffering' }), /Playing for everyone.*Buffering/);
  assert.match(screeningStatusText({ shared: shared('playing'), local: 'blocked' }), /Press Play film/);
  assert.match(screeningStatusText({ shared: shared('playing'), local: 'unsupported' }), /can.t play this film/i);
  assert.match(screeningStatusText({ shared: shared('paused'), local: 'paused' }), /Paused by the host/);
  assert.match(screeningStatusText({ shared: shared('stopped'), local: 'idle' }), /Waiting for the host/);
  assert.match(screeningStatusText({ shared: shared('playing'), local: 'playing' }), new RegExp(FILM.label.replace(/[()]/g, '.')));
});

test('host commands carry the current epoch, revision and one id per intent', () => {
  const view = shared('paused');
  assert.deepEqual(screeningCommand(view, 'play', 'op-abcdef12'), { type: 'screening', action: 'play', venueId: 'ipic', epoch: 'e1', expectedRevision: 4, operationId: 'op-abcdef12' });
  // Starting from a stopped screen plays the venue's first film: the approved short (#365).
  assert.deepEqual(screeningCommand(shared('stopped'), 'start', 'op-abcdef13'), { type: 'screening', action: 'start', venueId: 'ipic', epoch: 'e1', expectedRevision: 4, operationId: 'op-abcdef13', mediaId: 'ipic-original-v1' });
  assert.equal(screeningCommand(view, 'seek', 'op-abcdef14'), null);
});

test('the panel clears the walking card, so Stand up stays reachable under it', () => {
  // Measured seated in a recliner: the card is 94 px tall, 20 px up on desktop and 72 px up on a phone.
  assert.equal(panelClearance({ top: 786, width: 310, height: 94 }, 900), 122);
  assert.equal(panelClearance({ top: 678, width: 310, height: 94 }, 844), 174);
  // A taller card (the voice row) lifts the panel with it.
  assert.equal(panelClearance({ top: 640, width: 310, height: 132 }, 844), 212);
  assert.equal(panelClearance({ top: 678.4, width: 310, height: 94 }, 844, 10), 176);
  // No card on screen: the stylesheet's own offset applies.
  for (const card of [null, undefined, { top: 0, width: 0, height: 0 }, { top: 500, width: 310, height: 0 }]) assert.equal(panelClearance(card, 844), null);
});

test('a failed film says why, and every failure keeps Retry and a way out (#498)', () => {
  const texts = Object.fromEntries(['decode', 'network', 'stalled', 'playback'].map(failure => [failure, screeningStatusText({ shared: shared('playing'), local: 'error', failure })]));
  assert.match(texts.decode, /couldn.t decode/);
  assert.match(texts.network, /couldn.t download.*connection/);
  assert.match(texts.stalled, /stopped loading/);
  assert.match(texts.playback, /didn.t start/);
  for (const text of Object.values(texts)) assert.match(text, /Retry, or stay and talk|Retry, or stay/);
  assert.equal(new Set(Object.values(texts)).size, 4, 'each failure has its own words');
  assert.match(screeningStatusText({ shared: shared('playing'), local: 'error' }), /couldn.t decode/, 'an unknown failure reads as a decode failure');
  assert.match(screeningStatusText({ shared: shared('playing'), local: 'blocked', failure: 'autoplay' }), /Press Play film/, 'autoplay refusal asks for a gesture, not Retry');
  const controls = screeningControls({ shared: shared('playing'), local: 'error', canHost: false, inAuditorium: true });
  assert.deepEqual(['retry', 'stop-watching'].map(id => controls.find(item => item.id === id).hidden), [false, false]);
});

test('Start carries the host’s chosen film, not the film that just ended (#499)', () => {
  const ended = shared('ended', { mediaId: 'ipic-original-v1' });
  assert.deepEqual(screeningCommand(ended, 'start', 'op-abcdef21', { mediaId: FILM.id }),
    { type: 'screening', action: 'start', venueId: 'ipic', epoch: 'e1', expectedRevision: 4, operationId: 'op-abcdef21', mediaId: FILM.id });
  assert.equal(screeningCommand(shared('stopped'), 'start', 'op-abcdef22').mediaId, 'ipic-original-v1', 'no choice: the venue’s named default');
  assert.equal(screeningCommand(ended, 'start', 'op-abcdef23').mediaId, 'ipic-original-v1', 'an ended film is not chosen implicitly');
  for (const mediaId of ['ipic-unknown-v9', '/x.mp4', 'constructor']) assert.equal(screeningCommand(ended, 'start', 'op-abcdef24', { mediaId }), null, `no command for ${mediaId}`);
  assert.equal(screeningCommand(shared('paused'), 'play', 'op-abcdef25', { mediaId: FILM.id }).mediaId, undefined, 'only Start names a film');
});

test('a film this version does not know is unsupported here, never the previous film (#499)', () => {
  assert.match(screeningStatusText({ shared: shared('playing', { mediaId: 'ipic-later-v1' }), local: 'unsupported', failure: 'unknown' }), /newer version.*Reload/);
});

test('the chooser describes each film as the catalog records it: length, sound, captions (#499)', () => {
  assert.equal(screeningFilmDetails(SCREENING_MEDIA['ipic-original-v1']), '0:53 · Silent · English captions', 'the approved short is silent; nothing claims dialogue');
  assert.equal(screeningFilmDetails(FILM), '0:30 · Test tone · English captions');
  assert.equal(screeningFilmDetails({ durationMs: 75_400, audio: 'dialogue and music', captions: null }), '1:15 · Dialogue and music · No captions');
});

// Viewing (#500): a seated viewer may focus the camera on the screen and return; local only.
test('a seated viewer can focus on the screen and look around again; standing viewers cannot', () => {
  const seated = screeningControls({ shared: shared('playing'), local: 'playing', inAuditorium: true, seated: true, focused: false });
  const focus = seated.find(item => item.id === 'focus');
  assert.deepEqual([focus.hidden, focus.label, focus.pressed], [false, 'Focus on screen', false]);
  const focused = screeningControls({ shared: shared('playing'), local: 'playing', inAuditorium: true, seated: true, focused: true }).find(item => item.id === 'focus');
  assert.deepEqual([focused.label, focused.pressed], ['Look around', true]);
  assert.equal(screeningControls({ shared: shared('playing'), local: 'playing', inAuditorium: true, seated: false }).find(item => item.id === 'focus').hidden, true, 'standing: no focus');
  assert.equal(screeningControls({ shared: shared('stopped'), local: 'idle', inAuditorium: true, seated: true }).find(item => item.id === 'focus').hidden, true, 'nothing showing: no focus');
  for (const local of ['error', 'blocked']) assert.equal(screeningControls({ shared: shared('playing'), local, inAuditorium: true, seated: true, focused: true }).find(item => item.id === 'stop-watching').hidden, false, `${local}: the way out stays`);
});

test('the volume slider is offered only where it changes the sound; mute always works (#500)', () => {
  const visibleIds = more => visible(screeningControls({ shared: shared('playing'), local: 'playing', inAuditorium: true, ...more }));
  assert.ok(visibleIds({ volumeSupported: true }).includes('volume'));
  assert.ok(!visibleIds({ volumeSupported: false }).includes('volume'), 'no decorative slider where programmatic volume is ignored');
  assert.ok(visibleIds({ volumeSupported: false }).includes('sound'), 'sound on and off still works');
  assert.match(screeningStatusText({ shared: shared('playing'), local: 'blocked', sound: true }), /Sound is on.*Play film/, 'a refused sound start is not shown as sound');
});
