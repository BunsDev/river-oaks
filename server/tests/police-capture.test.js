import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPolice, POLICE_RULES as R } from '../police.js';
import { createSharedWorld } from '../world.js';
import { CRIME_RULES, CRIME_TARGETS } from '../crime.js';

// #640 increment 2: officers see in front of them (with a close-contact exception), watching a
// wanted player pauses their stars' cooldown, and a refusing player can be grabbed only through a
// telegraphed, avoidable, server-checked contact that hands over to the existing arrest.
function fixture({ player = [8, 0, 0], stars = 1 } = {}) {
  let at = 1000, visible = true, enabled = true, evadingUntil = -Infinity;
  const bystanders = new Set();
  const arrests = [], observed = [];
  const players = new Map([['a', { id: 'a', position: [...player] }]]), wanted = new Map([['a', stars]]);
  const navigation = { free: () => true, canTravel: () => true, route: (a, b) => [[...b]] };
  const options = { players, starsOf: id => wanted.get(id) ?? 0, eligible: () => enabled,
    navigation, posts: [[0, 0, 0]], sight: () => visible, changed() {},
    observe: (id, when) => observed.push([id, when]), evading: (id, when) => when <= evadingUntil, participating: id => !bystanders.has(id),
    arrest(p) { arrests.push(p.id); wanted.delete(p.id); p.position = [30, 30, 0]; } };
  const police = createPolice(options);
  return { police, players, wanted, arrests, observed, options, navigation, bystanders,
    get at() { return at; }, tick(ms = 100) { at += ms; police.step(at, ms / 1000); },
    hide() { visible = false; }, show() { visible = true; }, off() { enabled = false; }, evade(ms = 350) { evadingUntil = at + ms; },
    unit: () => police.snapshot().units[0], saved: () => police.checkpoint().units[0] };
}
// Walk the officer to the player and wait out the surrender offer (refusalMs) until it grabs.
const close = f => { for (let i = 0; i < 100 && f.unit()?.state !== 'grab'; i++) f.tick(); };

test('an officer sees ahead of it, not behind, except at close contact', () => {
  const f = fixture({ player: [8, 0, 0] }); f.tick();
  const unit = f.saved();
  // Turn the officer away from the player (yaw is atan2(east, -north); forward is (sin, -cos)).
  f.police.load(f.police.validate({ ...f.police.checkpoint(), units: [{ ...unit, position: [0, 0, 0], yaw: -Math.PI / 2, lastSeen: [8, 0, 0] }] }));
  f.players.get('a').position = [8, 0, 0]; f.tick(10);
  assert.equal(f.unit().state, 'search', 'a player 8 m behind the officer is not seen');
  // Searching, it walks toward the last-seen point and faces that way: ahead of it is seen.
  const { position, yaw } = f.unit();
  f.players.get('a').position = [position[0] + 6 * Math.sin(yaw), position[1] - 6 * Math.cos(yaw), 0]; f.observed.length = 0; f.tick(10);
  assert.equal(f.unit().state, 'pursue', 'a player in front is seen again');
  assert.ok(f.observed.length > 0, 'seeing a wanted player is reported as observation');
  const g = fixture({ player: [8, 0, 0] }); g.tick();
  g.police.load(g.police.validate({ ...g.police.checkpoint(), units: [{ ...g.saved(), position: [0, 0, 0], yaw: -Math.PI / 2, lastSeen: [2, 0, 0] }] }));
  g.players.get('a').position = [2, 0, 0]; g.tick(10);
  assert.equal(g.unit().state, 'pursue', 'within close contact an officer notices a player behind it');
});

test('a searching officer looks around the last-seen point and can reacquire a player there', () => {
  const f = fixture({ player: [8, 0, 0] }); f.tick();
  f.police.load(f.police.validate({ ...f.police.checkpoint(), units: [{ ...f.saved(), position: [4, 0, 0], yaw: Math.PI / 2, lastSeen: [4, 0, 0], state: 'search' }] }));
  // Behind the searching officer, beyond close contact.
  f.players.get('a').position = [4, 5, 0];
  let found = false;
  for (let i = 0; i < 40 && !found; i++) { f.tick(); found = f.unit().state === 'pursue'; }
  assert.ok(found, 'the sweep turns the officer toward the hiding player before the search ends');
});

test('a hidden player is not observed; an observed one is, every step', () => {
  // An officer is dispatched at the end of a step and observes from the next one.
  const f = fixture(); f.tick(); f.tick(); f.tick();
  const seen = f.observed.length; assert.ok(seen >= 2);
  f.hide(); f.tick(); f.tick();
  assert.equal(f.observed.length, seen, 'no observation without sight');
});

test('a refusing wanted player is grabbed only after a telegraph, and the grab hands over to arrest once', () => {
  const f = fixture({ player: [1.5, 0, 0] });
  for (let i = 0; i < R.refusalMs / 100 - 2; i++) { f.tick(); assert.notEqual(f.unit()?.state, 'grab', 'the officer first offers surrender'); }
  close(f);
  const grab = f.unit();
  assert.equal(grab.state, 'grab', 'an officer within reach telegraphs a grab');
  assert.ok(grab.remainingMs > 0 && grab.remainingMs <= R.grabWindupMs);
  assert.equal(f.police.held('a'), false, 'the telegraph itself holds nobody');
  f.tick(R.grabWindupMs);
  assert.equal(f.unit().state, 'arrest', 'contact in reach, sight and arc subdues the player');
  assert.equal(f.police.held('a'), true, 'a subdued player is held for the arrest');
  for (let i = 0; i < R.arrestMs / 100 + 2; i++) f.tick();
  assert.deepEqual(f.arrests, ['a']);
  for (let i = 0; i < 20; i++) f.tick();
  assert.deepEqual(f.arrests, ['a'], 'one arrest');
  assert.equal(f.police.held('a'), false, 'the hold ends with the arrest');
});

test('a grab is avoidable: stepping out of reach or out of its arc, or evading at contact, misses', () => {
  for (const escape of ['reach', 'arc', 'evade']) {
    const f = fixture({ player: [1.5, 0, 0] }); close(f);
    assert.equal(f.unit().state, 'grab');
    const officer = f.unit().position;
    if (escape === 'reach') f.players.get('a').position = [officer[0] + 3, 0, 0];
    if (escape === 'arc') f.players.get('a').position = [officer[0], officer[1] + 1.2, 0];
    if (escape === 'evade') f.evade(R.grabWindupMs + 100);
    f.tick(R.grabWindupMs);
    assert.notEqual(f.unit().state, 'arrest', `${escape}: the grab misses`);
    assert.equal(f.police.held('a'), false, `${escape}: nobody is held`);
    // The officer recovers before it can telegraph again.
    if (escape !== 'reach') { f.tick(); assert.notEqual(f.unit().state, 'grab', `${escape}: no instant retry`); }
    f.tick(R.grabRecoverMs);
    assert.deepEqual(f.arrests, []);
  }
});

test('emergency off or ineligibility during a grab or a grab-started arrest cancels it and releases the hold', () => {
  for (const when of ['grab', 'arrest']) {
    const f = fixture({ player: [1.5, 0, 0] }); close(f);
    if (when === 'arrest') f.tick(R.grabWindupMs);
    assert.equal(f.unit().state, when);
    f.off(); f.tick();
    assert.ok(f.police.snapshot().units.every(unit => unit.state === 'return'), `${when}: officers stand down`);
    assert.equal(f.police.held('a'), false, `${when}: the hold is released`);
    for (let i = 0; i < 30; i++) f.tick();
    assert.deepEqual(f.arrests, [], `${when}: nobody is arrested`);
  }
});

test('surrendered or peaceful players are never grabbed', () => {
  const f = fixture({ player: [1.5, 0, 0] }); f.tick();
  assert.equal(f.police.surrender('a', { type: 'surrender' }).ok, true);
  for (let i = 0; i < 10; i++) { f.tick(); assert.notEqual(f.unit()?.state, 'grab'); }
  const g = fixture({ player: [1.5, 0, 0], stars: 0 });
  for (let i = 0; i < 20; i++) g.tick();
  assert.equal(g.police.snapshot().units.length, 0);
  // Wanted but not in a fight (participation lapsed): followed, never grabbed.
  const h = fixture({ player: [1.5, 0, 0] }); h.bystanders.add('a');
  for (let i = 0; i < 100; i++) { h.tick(); assert.notEqual(h.unit()?.state, 'grab'); }
});

test('grabs and subdued players survive a checkpoint exactly once; v16 police state still loads', () => {
  const f = fixture({ player: [1.5, 0, 0] }); close(f);
  const saved = f.police.checkpoint(), restored = createPolice(f.options);
  restored.load(restored.validate(structuredClone(saved), undefined, undefined, 17));
  assert.equal(restored.snapshot().units[0].state, 'grab');
  for (let i = 0; i < (R.grabWindupMs + R.arrestMs) / 100 + 4; i++) restored.step(f.at + (i + 1) * 100, .1);
  assert.deepEqual(f.arrests, ['a']);
  const legacy = structuredClone(saved);
  delete legacy.subdued; for (const unit of legacy.units) { delete unit.grabDirection; delete unit.recoverUntil; delete unit.closeSince; unit.state = 'pursue'; }
  const old = createPolice(f.options); old.load(old.validate(legacy, undefined, undefined, 16));
  assert.equal(old.snapshot().units[0].state, 'pursue');
  assert.throws(() => old.validate(legacy, undefined, undefined, 17), /Invalid police/);
  const garbled = structuredClone(saved); garbled.units[0].grabDirection = [3, 0];
  assert.throws(() => old.validate(garbled, undefined, undefined, 17), /Invalid police/);
});

test('only the officer whose grab landed releases the hold; surrender cannot undo it', () => {
  // Two officers on one player: the second loses her while the first arrests.
  const f = fixture({ player: [1.5, 0, 0], stars: 3 }); close(f);
  const grabber = f.saved(), other = { ...grabber, id: 'police:1', position: [60, 0, 0], state: 'pursue', grabDirection: null, since: f.at, assignedAt: f.at, closeSince: null };
  f.police.load(f.police.validate({ ...f.police.checkpoint(), units: [grabber, other] }));
  f.tick(R.grabWindupMs);
  assert.equal(f.police.held('a'), true);
  f.tick();
  assert.ok(f.police.snapshot().units.some(unit => unit.id === 'police:1' && unit.state === 'search'), 'the far officer lost her');
  assert.equal(f.police.held('a'), true, 'its search does not release another officer\'s hold');
  // Offering surrender and resuming does not escape a landed grab.
  f.police.surrender('a', { type: 'surrender' });
  assert.equal(f.police.surrender('a', { type: 'surrender', action: 'resume' }).ok, false);
  for (let i = 0; i < R.arrestMs / 100 + 2; i++) f.tick();
  assert.deepEqual(f.arrests, ['a']);
});

test('a grab misses a player who stopped fighting or stands a ledge away', () => {
  const f = fixture({ player: [1.5, 0, 0] }); close(f);
  f.bystanders.add('a'); f.tick(R.grabWindupMs);
  assert.equal(f.police.held('a'), false, 'participation lapsed during the windup');
  const g = fixture({ player: [1.5, 0, 1.2] });
  for (let i = 0; i < 100; i++) { g.tick(); assert.notEqual(g.unit()?.state, 'grab', 'no grab up or down a ledge'); }
});

test('a restored town calls off a grab it slept through and keeps timers out of the future', () => {
  const f = fixture({ player: [1.5, 0, 0] }); close(f);
  const saved = f.police.checkpoint();
  const late = createPolice(f.options); late.load(late.validate(structuredClone(saved)), f.at + R.grabWindupMs + 5000);
  assert.equal(late.snapshot().units[0].state, 'pursue');
  for (let i = 0; i < 20; i++) late.step(f.at + R.grabWindupMs + 5000 + i * 100, .1);
  assert.deepEqual(f.arrests, [], 'nobody is grabbed after a pause they could not react to');
  const ahead = structuredClone(saved); ahead.units[0].recoverUntil = f.at + 1e9;
  const clamped = createPolice(f.options); clamped.load(clamped.validate(ahead), f.at);
  assert.ok(clamped.checkpoint().units[0].recoverUntil <= f.at + R.grabRecoverMs);
  // A held player needs the officer holding them; a v16 envelope carries no v17 state.
  const orphan = structuredClone(saved); orphan.subdued = [['a', 'police:5']];
  assert.throws(() => clamped.validate(orphan), /Invalid police/);
  const smuggled = structuredClone(saved); smuggled.units[0].state = 'pursue'; smuggled.units[0].grabDirection = null;
  assert.throws(() => clamped.validate(smuggled, undefined, undefined, 16), /Invalid police/);
});

// The town wires observation to the wanted cooldown: no second clock.
const district = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const RIVAL = CRIME_TARGETS['river-oaks'][0], [RX, RN] = RIVAL.position;
test('a watched wanted player keeps their stars; out of sight they cool off on the existing clock', () => {
  const clock = { time: 5_000_000 }, world = createSharedWorld(district, { now: () => clock.time, isAdmin: id => id === 'owner' });
  for (const id of ['owner', 'alice']) world.join({ userId: id, name: id });
  const ground = world.snapshot().crime.targets[0].position[2], alice = world.players.get('alice');
  const later = ms => { while (ms > 0) { const step = Math.min(ms, 50); clock.time += step; ms -= step; world.step(step / 1000); } };
  clock.time += 1000;
  assert.equal(world.command('owner', { type: 'worldPolicy', action: 'update', expectedRevision: world.worldPolicy().revision, changes: { violence: { mode: 'forced', zones: ['westcreek-lane'] } } }).ok, true);
  alice.position = [RX + 1.2, RN, ground];
  assert.equal(world.command('alice', { type: 'attack', targetId: RIVAL.id, attackKind: 'melee' }).ok, true);
  later(400);
  const stars = () => world.snapshot().crime.wanted.find(([id]) => id === 'alice')?.[1] ?? 0;
  assert.equal(stars(), 1);
  // Keep alice in plain view of her officer but beyond its reach, for longer than one cooldown.
  for (let elapsed = 0; elapsed < CRIME_RULES.starDecayMs + 5000; elapsed += 250) {
    const unit = world.snapshot().police.units.find(item => item.targetId === 'alice');
    if (unit) alice.position = [unit.position[0] - 0.5, unit.position[1] + (unit.position[1] > RN ? -5 : 5), ground];
    later(250);
  }
  assert.equal(stars(), 1, 'stars do not cool off while police watch');
  assert.ok(world.snapshot().police.units.some(unit => unit.targetId === 'alice'), 'the officer is still on her');
  // Unwatched (out of the zone, so officers stand down), the existing 30 s clock runs from the last sighting.
  alice.position = [-2790, -1300, world.snapshot().players.find(p => p.id === 'alice').position[2]];
  later(CRIME_RULES.starDecayMs - 1000);
  assert.equal(stars(), 1, 'not before a full quiet period');
  later(1500);
  assert.equal(stars(), 0, 'one star cools off a quiet period after the last sighting');
});
