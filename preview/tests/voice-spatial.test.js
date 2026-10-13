import test from 'node:test';
import assert from 'node:assert/strict';
import { spatialGain, spatialPan, spatialDistance, speakerFromPlayer, listenerFromPose, subscriptionDecision, VOICE_NEAR, VOICE_FAR, VOICE_RESUBSCRIBE } from '../src/voice-spatial.js';

test('full gain inside talking reach, silence past the far edge, falling monotonically between', () => {
  assert.equal(spatialGain(0), 1);
  assert.equal(spatialGain(VOICE_NEAR), 1);
  assert.equal(spatialGain(VOICE_FAR), 0);
  assert.equal(spatialGain(40), 0);
  let previous = 1;
  for (let d = VOICE_NEAR; d <= VOICE_FAR; d += 0.5) { const gain = spatialGain(d); assert.ok(gain <= previous && gain >= 0 && gain <= 1, `gain at ${d}`); previous = gain; }
  assert.equal(spatialGain(NaN), 1, 'an unknown distance plays at full gain rather than silence');
});

test('pan follows the listener yaw: a speaker on the right pans right, behind pans centre, and never exceeds ±0.8', () => {
  const listener = { position: [0, 1.6, 0], yaw: 0 };
  assert.ok(spatialPan(listener, [3, 1.6, 0]) > 0.7, 'to the right');
  assert.ok(spatialPan(listener, [-3, 1.6, 0]) < -0.7, 'to the left');
  assert.ok(Math.abs(spatialPan(listener, [0, 1.6, -3])) < 1e-9, 'straight ahead');
  assert.ok(Math.abs(spatialPan(listener, [0, 1.6, 3])) < 1e-9, 'straight behind');
  const turned = { position: [0, 1.6, 0], yaw: Math.PI / 2 };
  assert.ok(Math.abs(spatialPan(turned, [-3, 1.6, 0])) < 1e-9, 'after turning left, what was on the left is ahead');
  assert.equal(spatialPan(listener, [0, 1.6, 0]), 0, 'on top of the listener');
  for (const point of [[1, 0, 1], [-5, 2, 3], [7, 0, -2]]) assert.ok(Math.abs(spatialPan(listener, point)) <= 0.8 + 1e-9);
});

test('altitude counts toward distance and coordinates match remote-players (x, ground + altitude, -north)', () => {
  const speaker = speakerFromPlayer({ position: [3, 4, 1], altitude: 2 });
  assert.deepEqual(speaker, [3, 3, -4]);
  const listener = listenerFromPose({ position: [0, 3, -4], yaw: 0.3 });
  assert.equal(spatialDistance(listener, speaker), 3);
  assert.equal(spatialDistance(listenerFromPose({ position: [3, 0, -4], yaw: 0 }), speaker), 3, 'three metres up is three metres away');
  assert.deepEqual(listenerFromPose({ position: [1, 1.68, 2], ground: 0, altitude: 0, yaw: 0 }).position, [1, 0, 2], 'the walking eye is measured at the feet');
  assert.deepEqual(listenerFromPose({ position: [1, 7, 2], ground: 1, altitude: 4, yaw: 0 }).position, [1, 5, 2], 'flying keeps the altitude');
  assert.equal(listenerFromPose(null), null);
});

test('subscriptions use hysteresis between the far and resubscribe edges', () => {
  assert.equal(subscriptionDecision(10, true), true);
  assert.equal(subscriptionDecision(VOICE_FAR + 0.1, true), false);
  assert.equal(subscriptionDecision(VOICE_FAR - 0.5, false), false, 'between the edges a silenced resident stays silenced');
  assert.equal(subscriptionDecision(VOICE_FAR - 0.5, true), true, 'between the edges a playing resident keeps playing');
  assert.equal(subscriptionDecision(VOICE_RESUBSCRIBE - 0.1, false), true);
  assert.equal(subscriptionDecision(NaN, true), true);
});
test('office listeners hear speakers at office-local positions rather than their street return point',()=>{
 const speaker=speakerFromPlayer({position:[-2700,-1380,18],altitude:0,office:{id:'jevica-office',position:[1,3],yaw:0}});
 const listener=listenerFromPose({position:[0,1.68,-3],ground:0,altitude:0,yaw:0});
 assert.equal(spatialDistance(listener,speaker),1);assert.ok(spatialPan(listener,speaker)>0);
});
