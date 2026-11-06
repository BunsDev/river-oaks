import test from 'node:test';
import assert from 'node:assert/strict';
import { aboardAnotherRide, garageKeyAction } from '../src/garage-keys.js';

// #791: every account has a garage since #767, and its buttons promise Q (call) and G (ride).
// The keys must work for a visitor too, and must stay off when the player is aboard a ride that
// is not their own, so a Ribbonwing passenger's G only steps out of the pilot's craft.
const key = (code, extra = {}) => ({ code, repeat: false, defaultPrevented: false, metaKey: false, ctrlKey: false, altKey: false, isComposing: false,
  getModifierState: () => false, target: { ownerDocument: null, closest: () => null }, ...extra });
const onFoot = { position: [0, 0, 0], riding: null };
const visitor = { hasGarage: true, pose: onFoot, ownRiding: false };

test('a visitor with a garage calls with Q and rides with G', () => {
  assert.equal(garageKeyAction(key('KeyQ'), visitor), 'call');
  assert.equal(garageKeyAction(key('KeyG'), visitor), 'ride');
  assert.equal(garageKeyAction(key('KeyW'), visitor), null, 'other keys are not the garage\'s');
});

test('G steps out of your own ride: riding it is not riding another', () => {
  const riding = { ...visitor, pose: { ...onFoot, riding: { kind: 'motorcycle', driver: true } }, ownRiding: true };
  assert.equal(garageKeyAction(key('KeyG'), riding), 'ride');
  assert.equal(aboardAnotherRide(riding.pose, true), false);
});

test('a passenger in another pilot\'s craft, or a rider on a plaza bike, leaves Q and G to that ride', () => {
  for (const riding of [{ kind: 'hover', driver: false }, { kind: 'bicycle', driver: true }]) {
    const aboard = { ...visitor, pose: { ...onFoot, riding }, ownRiding: false };
    assert.equal(aboardAnotherRide(aboard.pose, false), true);
    assert.equal(garageKeyAction(key('KeyG'), aboard), null, `${riding.kind}: G is not the garage's`);
    assert.equal(garageKeyAction(key('KeyQ'), aboard), null, `${riding.kind}: Q does not call a ride from aboard another`);
  }
});

test('no garage, a held key, a key another ride took, a chord or a form field: no garage action', () => {
  assert.equal(garageKeyAction(key('KeyQ'), { ...visitor, hasGarage: false }), null);
  assert.equal(garageKeyAction(key('KeyG', { repeat: true }), visitor), null);
  assert.equal(garageKeyAction(key('KeyG', { defaultPrevented: true }), visitor), null);
  assert.equal(garageKeyAction(key('KeyQ', { metaKey: true }), visitor), null);
  assert.equal(garageKeyAction(key('KeyQ', { target: { ownerDocument: null, closest: selector => selector.includes('select') ? {} : null } }), visitor), null);
  assert.equal(garageKeyAction(key('KeyQ'), { ...visitor, pose: null }), 'call', 'no pose yet: the button decides (it is disabled)');
});
