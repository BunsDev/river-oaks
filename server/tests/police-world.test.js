import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSharedWorld } from '../world.js';
const district = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
function fixture(data=district) {
  let time = 5000000;
  const options = { now: () => time, isAdmin: id => id === 'owner' };
  const world = createSharedWorld(data, options);
  for (const userId of ['owner', 'a']) world.join({ userId, name: userId });
  assert.equal(world.command('owner', { type: 'worldPolicy', action: 'update', expectedRevision: 0,
    changes: { violence: { mode: 'forced', zones: ['westcreek-lane'] } } }).ok, true);
  const target = world.snapshot().crime.targets[0];
  world.players.get('a').position = [target.position[0] + 1.2, target.position[1], target.position[2]];
  assert.equal(world.command('a', { type: 'attack', targetId: target.id, attackKind: 'melee' }).ok, true);
  return { world, options, tick(ms = 100) { time += ms; world.step(ms / 1000); } };
}
test('actual town pursues, accepts surrender, arrests once at safe arrival and restores mid-arrest', () => {
  const f = fixture(); f.tick();
  assert.equal(f.world.snapshot().police.units.length, 1);
  assert.equal(f.world.command('a', { type: 'surrender', userId: 'owner' }).error, 'invalid_surrender');
  assert.equal(f.world.command('a', { type: 'surrender' }).ok, true);
  const player = f.world.players.get('a'), original = [...player.position];
  assert.equal(f.world.command('a', { type: 'pose', position: [original[0] + .1, original[1], original[2]], yaw: 0, altitude: 0 }).error, 'surrendered');
  let saved;
  for (let i = 0; i < 100; i++) {
    f.tick(); if (f.world.snapshot().police.units.some(unit => unit.state === 'arrest')) { saved = f.world.checkpoint(); break; }
  }
  assert.ok(saved, 'officer reached real street target');
  const restored = createSharedWorld(district, f.options); assert.equal(restored.restore(saved).ok, true);
  for (let i = 0; i < 25; i++) { f.tick(); restored.step(.1); }
  assert.equal(restored.snapshot().crime.wanted.length, 0);
  assert.ok(Math.hypot(restored.players.get('a').position[0] - original[0], restored.players.get('a').position[1] - original[1]) > 10);
  assert.equal(restored.snapshot().police.surrendered.length, 0);
});
test('emergency off and disconnect immediately cancel police and surrender', () => {
  const f = fixture(); f.tick(); f.world.command('a', { type: 'surrender' });
  assert.equal(f.world.command('owner', { type: 'worldPolicy', action: 'emergencyOff' }).ok, true);
  assert.ok(f.world.snapshot().police.units.every(unit => unit.state === 'return'));
  assert.deepEqual(f.world.snapshot().police.surrendered, []);
  const g = fixture(); g.tick(); g.world.command('a', { type: 'surrender' }); g.world.leave('a');
  assert.deepEqual(g.world.snapshot().police.surrendered, []);
  assert.ok(g.world.snapshot().police.units.every(unit => unit.targetId !== 'a'));
});

test('current checkpoints require explicit valid police state and a rejected restore is atomic', async () => {
  const { createHash } = await import('node:crypto');
  const f=fixture(),saved=f.world.checkpoint();
  for(const police of [null,undefined,{units:[],surrendered:[],cursor:-1}]) {
    const bad=structuredClone(saved);bad.payload.police=police;
    const envelope={version:bad.version,worldId:bad.worldId,worldFingerprint:bad.worldFingerprint,payload:bad.payload};
    bad.checksum=createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
    const before=f.world.checkpoint();assert.equal(f.world.restore(bad).ok,false);assert.deepEqual(f.world.checkpoint(),before);
  }
});

test('incapacitated capture restores health through a mid-arrest checkpoint and returns to walkable ground', async () => {
  const {createWalkingEnvironment}=await import('../../preview/src/walking.js');
  const f=fixture();f.world.players.get('a').health=0;
  let saved;
  for(let i=0;i<100;i++){f.tick();if(f.world.snapshot().police.units.some(unit=>unit.state==='arrest')){saved=f.world.checkpoint();break;}}
  assert.ok(saved);const restored=createSharedWorld(district,f.options);assert.equal(restored.restore(saved).ok,true);
  for(let i=0;i<25;i++){f.tick();restored.step(.1);}
  const player=restored.players.get('a'),environment=createWalkingEnvironment(district);
  assert.equal(player.health,100);assert.equal(restored.snapshot().crime.wanted.length,0);
  assert.ok(environment.isFree(player.position[0],-player.position[1]));
  assert.equal(player.position[2],environment.groundAt(player.position[0],-player.position[1]));
});

test('actual sight geometry prevents acquisition through a wall', () => {
  const x=-2905.5,n=-1320;
  const walled={...district,collisionPolygons:[...district.collisionPolygons,[[x-.1,n-3],[x+.1,n-3],[x+.1,n+3],[x-.1,n+3],[x-.1,n-3]]]};
  const f=fixture(walled);for(let i=0;i<10;i++)f.tick();
  assert.equal(f.world.snapshot().crime.wanted.length,1);
  assert.equal(f.world.snapshot().police.units.length,0,'a wall hides the wanted player from the authored post');
});
test('emergency off during the arrest transition never clears stars or relocates the player', () => {
  const f=fixture();f.world.command('a',{type:'surrender'});
  for(let i=0;i<50 && !f.world.snapshot().police.units.some(unit=>unit.state==='arrest');i++)f.tick();
  assert.ok(f.world.snapshot().police.units.some(unit=>unit.state==='arrest'));
  const before=[...f.world.players.get('a').position];
  f.world.command('owner',{type:'worldPolicy',action:'emergencyOff'});
  for(let i=0;i<25;i++)f.tick();
  assert.equal(f.world.snapshot().crime.wanted.length,1);
  assert.deepEqual(f.world.players.get('a').position,before);
  assert.deepEqual(f.world.snapshot().police.surrendered,[]);
});

test('leaving the danger zone releases surrender and ends pursuit without forgiving wanted stars', () => {
  const f=fixture();f.tick();
  assert.equal(f.world.command('a',{type:'surrender'}).ok,true);
  const safe=[...f.world.players.get('owner').position];
  f.world.players.get('a').position=[...safe];f.tick();
  const snapshot=f.world.snapshot();
  assert.deepEqual(snapshot.crime.wanted,[['a',1]]);
  assert.ok(snapshot.police.units.every(unit=>unit.targetId!=='a'));
  assert.ok(!snapshot.police.surrendered.includes('a'));
  assert.ok(!snapshot.police.eligible.includes('a'));
  for(let i=0;i<25;i++)f.tick();
  assert.deepEqual(f.world.players.get('a').position,safe,'safe-ground departure is not an arrest relocation');
  assert.equal(f.world.command('a',{type:'surrender'}).error,'not_wanted');
});

test('an officer holds a readable arrest distance instead of walking into a healthy wanted player', () => {
  const f=fixture();for(let i=0;i<30;i++)f.tick();
  const player=f.world.players.get('a'),units=f.world.snapshot().police.units;
  assert.equal(units.length,1);assert.equal(units[0].state,'pursue');
  const separation=Math.hypot(units[0].position[0]-player.position[0],units[0].position[1]-player.position[1]);
  assert.ok(separation>=1.2 && separation<=1.5,`officer separation ${separation} m must remain in reach without body overlap`);
  assert.equal(f.world.command('a',{type:'surrender'}).ok,true);
  for(let i=0;i<25;i++)f.tick();assert.equal(f.world.snapshot().crime.wanted.length,0);
});

test('police reach wanted players on the walkable west side of Westcreek outside the resident site ring', () => {
  const f=fixture(),player=f.world.players.get('a'),target=f.world.snapshot().crime.targets[0];
  player.position=[target.position[0]-1.2,target.position[1],target.position[2]];
  assert.equal(f.world.command('a',{type:'surrender'}).ok,true,'the west side is inside the active danger zone');
  let saved;
  for(let i=0;i<150 && f.world.snapshot().crime.wanted.length;i++){
    f.tick();
    if(!saved && f.world.snapshot().police.units.some(unit=>unit.state==='arrest'))saved=f.world.checkpoint();
  }
  assert.equal(f.world.snapshot().crime.wanted.length,0,'a surrendered player is reachable across the actual walkable street');
  assert.deepEqual(f.world.snapshot().police.surrendered,[]);
  assert.ok(saved,'capture crosses the old resident boundary');
  const restored=createSharedWorld(district,f.options);
  assert.equal(restored.restore(saved).ok,true,'restored police use the same full walking area');
  restored.step(.1);assert.equal(restored.snapshot().crime.wanted.length,0);
});
