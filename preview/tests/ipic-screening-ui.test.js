import test from 'node:test';
import assert from 'node:assert/strict';
import { SCREENING_MEDIA } from '../src/screening-contract.js';
import { screeningCommand, screeningControls, screeningStatusText } from '../src/ipic-screening-ui.js';

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
  assert.deepEqual(screeningCommand(shared('stopped'), 'start', 'op-abcdef13'), { type: 'screening', action: 'start', venueId: 'ipic', epoch: 'e1', expectedRevision: 4, operationId: 'op-abcdef13', mediaId: FILM.id });
  assert.equal(screeningCommand(view, 'seek', 'op-abcdef14'), null);
});
