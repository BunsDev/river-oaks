import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSharedWorld } from '../world.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';
const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const owner = JEVICA_ADMIN_USER_IDS[0], id = 'jevica-office';
function setup() {
  let time = 10000;
  const world = createSharedWorld(data, {now: () => time});
  for (const userId of [owner, 'guest', 'stranger']) assert.ok(world.join({userId, name: userId === owner ? 'Jevica' : 'Jevica'}).ok);
  const send = (user, action, more = {}) => {time += 1000;return world.command(user, {type: 'office', action, officeId: id, ...more});};
  const lobby = user => {const office = send(user, 'list').offices[0];time += 2000;assert.ok(world.command(user, {type:'travel', position:office.entrance}).ok);};
  return {world, send, lobby};
}
test('only authenticated Jevica accounts own offices; requesting or naming Jevica grants nothing', () => {
  const {send, lobby} = setup();
  const listing = send(owner, 'list');assert.equal(listing.ok, true);assert.equal(listing.offices[0].access, 'owner');
  assert.equal(send('guest', 'list').offices[0].access, null);
  lobby('guest');assert.equal(send('guest', 'enter').error, 'office_permission_required');
  assert.equal(send('guest', 'invite', {peerId:'stranger'}).error, 'office_owner_required');
  assert.equal(send('guest', 'request').ok, false);
  assert.equal(send('guest', 'enter').error, 'office_permission_required');
  assert.equal(send('guest', 'enter', {ownerId:owner}).ok, false);
});
test('owner invitations allow entry; revocation ejects and persists', () => {
  const {world, send, lobby} = setup();
  assert.ok(send(owner, 'invite', {peerId:'guest'}).ok);
  assert.equal(send('guest', 'list').offices[0].access, 'invited');
  assert.equal(send('stranger', 'list').offices[0].requests, undefined);
  assert.equal(send('guest', 'enter').error, 'office_lobby_required');
  lobby('guest');assert.ok(send('guest', 'enter').ok);
  assert.equal(world.snapshot().players.find(p=>p.id==='guest').office.id, id);
  assert.equal(world.voiceSpaceOf('guest'), 'office:jevica-office');
  assert.ok(send(owner, 'revoke', {peerId:'guest'}).ok);
  assert.equal(world.snapshot().players.find(p=>p.id==='guest').office, null);
  assert.equal(send('guest', 'enter').error, 'office_permission_required');
  assert.ok(send(owner, 'invite', {peerId:'stranger'}).ok);
  const restored = createSharedWorld(data);assert.ok(restored.restore(world.checkpoint()).ok);
  assert.equal(restored.command('stranger', {type:'office', action:'list', officeId:id}).offices[0].access, 'invited');
});
test('office movement is swept, bounded and separated from street actions; exit returns to lobby', () => {
  const {world, send, lobby} = setup();lobby(owner);assert.ok(send(owner, 'enter').ok);
  assert.equal(send(owner, 'move', {position:[0, 100], yaw:0}).ok, false);
  assert.equal(send(owner, 'move', {position:[-4, 2.2], yaw:0}).ok, false);
  assert.ok(send(owner, 'move', {position:[0, 2], yaw:0}).ok);
  assert.equal(world.command(owner, {type:'travel', position:data.walkSpawn.slice(0,2)}).error, 'leave_office_first');
  const before = world.players.get(owner).position;
  assert.equal(world.command(owner, {type:'pose', position:before, yaw:0, altitude:0}).ok, false);
  const checkpoint = world.checkpoint(), restored = createSharedWorld(data);
  assert.ok(restored.restore(checkpoint).ok);assert.deepEqual(restored.snapshot().players.find(p=>p.id===owner).office.position, [0,2]);
  assert.ok(send(owner, 'leave').ok);assert.equal(world.snapshot().players.find(p=>p.id===owner).office, null);
});
test('unjoined users, unknown offices and invalid grants fail closed', () => {
  const {world, send} = setup();
  assert.equal(world.command('unknown',{type:'office',action:'enter',officeId:id}).error,'not_joined');
  assert.equal(send(owner,'enter',{officeId:'unknown'}).ok,false);
  assert.equal(send(owner,'approve',{peerId:'stranger'}).ok,false);
  assert.equal(send(owner,'invite',{peerId:'__proto__'}).ok,false);
});
test('leaving the world clears visit presence; private office state cannot be forged through checkpoints',()=>{
 const {world,send,lobby}=setup();lobby(owner);send(owner,'enter');world.leave(owner);assert.ok(world.restore(world.checkpoint()).ok);
});
test('checkpoint version fences old writers and retains permissions on geography migration',async()=>{
 const {migrateWorldCheckpoint}=await import('../world.js');
 const {createHash}=await import('node:crypto');const {world,send}=setup();send(owner,'invite',{peerId:'guest'});send('stranger','request');
 const checkpoint=world.checkpoint();assert.equal(checkpoint.version,12);
 const migrated=migrateWorldCheckpoint({fromData:data,toData:{...data,title:'Updated district'},checkpoint});assert.ok(migrated.ok);
 assert.deepEqual(migrated.checkpoint.payload.offices.grants,checkpoint.payload.offices.grants);assert.deepEqual(migrated.checkpoint.payload.offices.requests,[]);
 const resign=v=>{const {checksum,...envelope}=v;v.checksum=createHash('sha256').update(JSON.stringify(envelope)).digest('hex');};
 const bad=structuredClone(checkpoint);bad.payload.offices.visits=[['guest',{id:'jevica-office',position:[0,999],yaw:0,at:0,budget:1}]];resign(bad);assert.equal(world.restore(bad).ok,false);
 const old=structuredClone(checkpoint);old.version=5;resign(old);assert.equal(world.restore(old).ok,false,'office data cannot masquerade as a v5 checkpoint');delete old.payload.offices;delete old.payload.screenings;resign(old);assert.equal(world.restore(old).ok,true,'real v5 checkpoint upgrades');
});
