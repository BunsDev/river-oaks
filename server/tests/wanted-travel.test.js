import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSharedWorld } from '../world.js';

// #785 (#599 fair chase): a wanted player under active pursuit cannot step out of the chase with a
// `travel` command. Travel stays open while merely wanted (no officer on them, the star cooling) and
// again once the officers have lost them (search) or stood down.
const district = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
function fixture() {
  let time = 5000000;
  const options = { now: () => time, isAdmin: id => id === 'owner' };
  const world = createSharedWorld(district, options);
  for (const userId of ['owner', 'a']) world.join({ userId, name: userId });
  assert.equal(world.command('owner', { type: 'worldPolicy', action: 'update', expectedRevision: 0,
    changes: { violence: { mode: 'forced', zones: ['westcreek-lane'] } } }).ok, true);
  const target = world.snapshot().crime.targets[0];
  world.players.get('a').position = [target.position[0] + 1.2, target.position[1], target.position[2]];
  assert.equal(world.command('a', { type: 'attack', targetId: target.id, attackKind: 'melee' }).ok, true);
  time += 300; world.step(.05); // the strike lands at contact; the star is earned
  const far = [world.players.get('a').position[0] + 3, world.players.get('a').position[1]]; // a free spot beside the lane (bounds-checked, accepted by the arrival geometry)
  return { world, options, far, tick(ms = 100) { time += ms; world.step(ms / 1000); }, stars: () => world.snapshot().crime.wanted.find(([userId]) => userId === 'a')?.[1] ?? 0,
    units: () => world.snapshot().police.units.filter(unit => unit.targetId === 'a') };
}
const travel = f => f.world.command('a', { type: 'travel', position: f.far });

test('a wanted player no officer is on can still travel, and keeps the star', () => {
  const f = fixture(); f.tick();
  assert.equal(f.stars(), 1);
  assert.deepEqual(f.units().map(unit => unit.state), ['pursue'], 'the officer is dispatched in the step the strike lands');
  // On foot out of the danger zone (the authoritative position moves by pose; the fixture sets it): the
  // officers stand down and the star keeps cooling. That walk is the fair chase; the travel after it is free.
  const player = f.world.players.get('a');
  player.position = [player.position[0] + 60, player.position[1], player.position[2]];
  for (let i = 0; i < 20 && f.units().length; i++) f.tick();
  assert.deepEqual(f.units(), [], 'no officer is on the player outside the zone');
  const reply = travel(f);
  assert.equal(reply.ok, true, `no chase, no refusal: ${reply.error ?? ''}`);
  assert.equal(f.stars(), 1, 'travelling keeps the star');
});

test('a player an officer is pursuing cannot travel away; the refusal names the chase', () => {
  const f = fixture(); f.tick();
  assert.deepEqual(f.units().map(unit => unit.state), ['pursue']);
  const before = [...f.world.players.get('a').position];
  const reply = travel(f);
  assert.equal(reply.ok, false);
  assert.equal(reply.error, 'pursued');
  assert.match(reply.message ?? '', /officer|police|pursu/i);
  assert.deepEqual(f.world.players.get('a').position, before, 'a refused travel moves nobody');
  // Grab and arrest are the same chase.
  for (let i = 0; i < 100 && !f.units().some(unit => ['grab', 'arrest'].includes(unit.state)); i++) f.tick();
  assert.ok(f.units().some(unit => ['grab', 'arrest'].includes(unit.state)), 'the officer reaches the player');
  assert.equal(travel(f).error, 'pursued');
});

test('travel opens again when the chase ends: emergency off, or the officers stand down', () => {
  const f = fixture(); f.tick();
  assert.equal(travel(f).error, 'pursued');
  assert.equal(f.world.command('owner', { type: 'worldPolicy', action: 'emergencyOff' }).ok, true);
  assert.ok(f.units().every(unit => unit.state === 'return'));
  assert.equal(travel(f).ok, true, 'a returning officer is not a pursuit');
});
