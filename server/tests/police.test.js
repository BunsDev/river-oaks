import test from 'node:test';
import assert from 'node:assert/strict';
import { createPolice, POLICE_RULES as R } from '../police.js';

function fixture() {
  let at = 1000, visible = true, enabled = true, arrests = [];
  const players = new Map([['a', { id: 'a', position: [8, 0, 0] }]]), stars = new Map([['a', 1]]);
  const navigation = { free: () => true, canTravel: () => true, route: (a, b) => [[...b]] };
  const options = { players, starsOf: id => stars.get(id) ?? 0, eligible: () => enabled,
    navigation, posts: [[0, 0, 0]], sight: () => visible, changed() {},
    arrest(player) { arrests.push(player.id); stars.delete(player.id); player.position = [30, 30, 0]; } };
  const police = createPolice(options);
  return { police, players, stars, arrests, options, navigation, tick(ms = 100) { at += ms; police.step(at, ms / 1000); },
    hide() { visible = false; }, off() { enabled = false; } };
}

test('one wanted player gets one stable officer approaching only along walkable segments', () => {
  const f = fixture(); f.tick(); f.tick();
  const first = f.police.snapshot().units[0];
  assert.equal(first.targetId, 'a'); assert.equal(first.state, 'pursue');
  assert.ok(first.position[0] > 0 && first.position[0] < 1);
  f.tick(); const next = f.police.snapshot().units[0];
  assert.equal(next.id, first.id); assert.ok(next.position[0] > first.position[0]);
  f.navigation.canTravel = () => false; f.navigation.route = () => null;
  f.tick(); assert.deepEqual(f.police.snapshot().units[0].position, next.position);
});

test('sight loss searches the last seen point without tracking the hidden player', () => {
  const f = fixture(); f.tick(); f.hide(); f.players.get('a').position = [20, 20, 0]; f.tick();
  const unit = f.police.snapshot().units[0]; assert.equal(unit.state, 'search');
  assert.deepEqual(f.police.checkpoint().units[0].lastSeen, [8, 0, 0]);
  for (let i = 0; i < R.searchMs / 100 + 2; i++) f.tick();
  assert.ok(f.police.snapshot().units.every(unit => unit.state === 'return'));
});

test('hidden or peaceful players never acquire police and emergency off cancels capture', () => {
  const f = fixture(); f.hide(); f.tick(); assert.equal(f.police.snapshot().units.length, 0);
  const g = fixture(); g.stars.clear(); g.tick(); assert.equal(g.police.snapshot().units.length, 0);
  const h = fixture(); h.players.get('a').position = [1, 0, 0]; h.tick();
  assert.equal(h.police.surrender('a', { type: 'surrender' }).ok, true); h.tick(); h.off(); h.tick();
  assert.equal(h.arrests.length, 0); assert.deepEqual(h.police.snapshot().surrendered, []);
  assert.ok(h.police.snapshot().units.every(unit => unit.state === 'return'));
});

test('surrender is strict authenticated intent and arrest happens once across restore', () => {
  const f = fixture(); f.players.get('a').position = [1, 0, 0]; f.tick();
  assert.equal(f.police.surrender('a', { type: 'surrender', userId: 'b' }).ok, false);
  assert.equal(f.police.surrender('missing', { type: 'surrender' }).ok, false);
  assert.equal(f.police.surrender('a', { type: 'surrender' }).ok, true); f.tick();
  assert.equal(f.police.snapshot().units[0].state, 'arrest');
  const saved = f.police.checkpoint(), restored = createPolice(f.options); restored.load(restored.validate(saved));
  for (let i = 0; i < 30; i++) restored.step(1300 + i * 100, .1);
  assert.deepEqual(f.arrests, ['a']);
  const again = createPolice(f.options); again.load(again.validate(restored.checkpoint()));
  again.step(10000, .1); assert.deepEqual(f.arrests, ['a']);
});

test('global cap holds with extra units by stars, and responses rotate fairly under saturation', () => {
  const f = fixture(); f.players.clear(); f.stars.clear();
  for (let i = 0; i < 10; i++) { const id = String(i); f.players.set(id, { id, position: [8, i * .2, 0] }); f.stars.set(id, 5); }
  const seen = new Set();
  for (let i = 0; i < 500; i++) { f.tick(); const units = f.police.snapshot().units;
    assert.ok(units.length <= R.maxUnits); units.forEach(unit => { if (unit.targetId) seen.add(unit.targetId); }); }
  assert.equal(seen.size, 10, 'every wanted account receives a bounded response turn');
});

test('invalid checkpoints fail without mutating live officers', () => {
  const f = fixture(); f.tick(); const saved = f.police.checkpoint(), before = f.police.snapshot();
  for (const mutate of [s => s.units.push(s.units[0]), s => s.units[0].position[0] = Infinity,
    s => s.units[0].state = 'teleport', s => s.surrendered.push('missing'), s => s.cursor = -1]) {
    const bad = structuredClone(saved); mutate(bad); assert.throws(() => f.police.validate(bad));
    assert.deepEqual(f.police.snapshot(), before);
  }
});

test('the existing navigation routes officers around a real wall without crossing it', async () => {
  const { createResidentNavigation } = await import('../../preview/src/navigation.js');
  const nav = createResidentNavigation({ scene:'district', bounds_m:[-20,-20,20,20],
    collisionPolygons:[[[-3,-8],[3,-8],[3,8],[-3,8],[-3,-8]]] }, { allowRoads:true });
  const players = new Map([['a',{ id:'a',position:[10,0,0] }]]);
  const police = createPolice({ players, starsOf:()=>1, eligible:()=>true, navigation:nav,
    posts:[[-10,0,0]], sight:()=>true, arrest(){}, changed(){} });
  let previous = [-10,0,0];
  for(let tick=0;tick<180;tick++) {
    police.step(1000+tick*100,.1); const next=police.snapshot().units[0].position;
    assert.ok(nav.canTravel(previous,next),'every authoritative step clears the actual wall');
    previous=next;
  }
  assert.ok(previous[0]>8,'officer reaches the other side by going around');
});

test('six officers share one route-search budget per tick and incapacitation captures without surrender', () => {
  const f=fixture();f.stars.set('a',5);
  f.players.set('b',{id:'b',position:[10,1,0]});f.stars.set('b',5);
  let calls=0;f.navigation.route=(a,b)=>{calls++;return [[...b]];};
  f.tick();assert.equal(f.police.snapshot().units.length,R.maxUnits);
  for(let i=0;i<20;i++){calls=0;f.tick();assert.ok(calls<=1);}
  const g=fixture();g.players.get('a').position=[1,0,0];g.players.get('a').health=0;
  for(let i=0;i<25;i++)g.tick();
  assert.deepEqual(g.arrests,['a']);
});

test('a newly wanted account receives a first response before existing accounts retain extras', () => {
  const f=fixture();f.stars.set('a',5);f.players.set('b',{id:'b',position:[8,1,0]});f.stars.set('b',5);f.tick();
  assert.equal(f.police.snapshot().units.length,6);
  f.players.set('c',{id:'c',position:[8,2,0]});f.stars.set('c',1);
  for(let i=0;i<160;i++)f.tick();
  assert.ok(f.police.snapshot().units.some(unit=>unit.targetId==='c'),'a later wanted player cannot starve behind extras');
});
test('dynamic geometry cannot spawn an officer inside a blocked post', () => {
  const f=fixture();f.navigation.free=()=>false;f.tick();assert.equal(f.police.snapshot().units.length,0);
});
test('restore rejects nonwalkable or underground units, absent targets and inconsistent transition times', () => {
  const f=fixture();f.navigation.ground=()=>0;f.tick();const saved=f.police.checkpoint();
  for(const mutate of [s=>s.units[0].position=[999999,999999,0],s=>s.units[0].position[2]=-10000,
    s=>s.units[0].targetId='not-a-player',s=>s.units[0].since=s.units[0].assignedAt-1,
    s=>{s.units[0].state='arrest';s.units[0].arrestAt=s.units[0].since-1;}]) {
    const bad=structuredClone(saved);mutate(bad);
    assert.throws(()=>f.police.validate(bad,new Set(f.players.keys()),{
      free:p=>Math.abs(p[0])<100 && Math.abs(p[1])<100,ground:()=>0
    }));
  }
});

test('an unseen wanted account does not reserve unreachable first responses ahead of visible star-scaled units', () => {
  const f=fixture();f.stars.set('a',5);f.players.set('hidden',{id:'hidden',position:[1000,0,0]});f.stars.set('hidden',1);
  f.tick();assert.equal(f.police.snapshot().units.filter(unit=>unit.targetId==='a').length,3);
  assert.ok(f.police.snapshot().units.every(unit=>unit.targetId!=='hidden'));
});
