import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSharedWorld } from '../world.js';

const data={scene:'district',bounds_m:[-30,-30,30,30],walkSpawn:[-12,0,0],stores:[],buildings:[],collisionPolygons:[],communityLocations:[]};
function setup(){
  let time=1000;
  const world=createSharedWorld(data,{now:()=>time,isAdmin:()=>false});
  for(const id of ['a','b','c'])world.join({userId:id,name:id});
  // Trusted geometry fixture; actual commands still enforce reach and collision.
  world.players.get('a').position=[-12,0,0];world.players.get('b').position=[-12,1,0];world.players.get('c').position=[-12,2,0];
  const command=(id,action,extra={})=>world.command(id,{type:'interaction',action,...extra});
  const invite=(kind='handshake')=>command('a','invite',{peerId:'b',kind});
  return {world,command,invite,advance(ms){time+=ms;},restore(){const other=createSharedWorld(data,{now:()=>time,isAdmin:()=>false});assert.deepEqual(other.restore(world.checkpoint()),{ok:true});return other;}};
}

test('handshake requires its recipient to accept and shares the same phase and facing',()=>{
  const f=setup(),invitation=f.invite();assert.equal(invitation.ok,true);
  assert.ok(f.world.snapshot().players.every(p=>p.gesture===null));
  const id=invitation.interaction.id;
  assert.equal(f.command('a','accept',{id}).ok,false);
  assert.equal(f.command('c','accept',{id}).ok,false);
  assert.equal(f.command('b','accept',{id}).ok,true);
  const [a,b]=f.world.snapshot().players;
  assert.equal(a.gesture,'handshake');assert.equal(b.gesture,'handshake');
  assert.equal(a.interaction.elapsed,b.interaction.elapsed);
  assert.ok(Math.abs(Math.cos(a.interaction.heading-b.interaction.heading)+1)<1e-6);
  assert.equal(a.canBuild,false);assert.equal(b.canGrantWishes,false);
  f.advance(5000);assert.ok(f.world.snapshot().players.every(p=>p.gesture===null));
});

test('invitations are bounded, exclusive, cancellable and expire',()=>{
  const f=setup(),first=f.invite('dance');assert.equal(first.ok,true);
  assert.equal(f.command('c','invite',{peerId:'b',kind:'dance'}).ok,false);
  assert.equal(f.command('b','decline',{id:first.interaction.id}).ok,true);
  assert.equal(f.command('b','accept',{id:first.interaction.id}).ok,false);
  assert.equal(f.invite().ok,false,'repeat invitation is rate limited');
  f.advance(5000);assert.equal(f.invite().ok,true);
  f.advance(16000);assert.equal(f.world.snapshot().interactions.length,0);
});

test('reach, line of sight, identity and on-foot restrictions are rechecked on acceptance',()=>{
  for(const mutate of [p=>p.position=[10,0,0],p=>p.altitude=1,p=>p.vehicle='rolls',p=>p.sitting={buildId:'missing',slot:0}]){
    const f=setup(),invitation=f.invite();assert.equal(invitation.ok,true);
    mutate(f.world.players.get('b'));
    assert.equal(f.command('b','accept',{id:invitation.interaction.id}).ok,false);
    assert.equal(f.world.snapshot().interactions.length,0);
  }
  const f=setup();
  for(const extra of [{peerId:'a',kind:'dance'},{peerId:'missing',kind:'dance'},{peerId:'b',kind:'forged'},{peerId:'b',kind:'dance',position:[0,0,0]}])assert.equal(f.command('a','invite',extra).ok,false);
  const wall=createSharedWorld({...data,collisionPolygons:[[[-13,.4],[-11,.4],[-11,.6],[-13,.6]]]});
  wall.join({userId:'a',name:'a'});wall.join({userId:'b',name:'b'});
  wall.players.get('a').position=[-12,0,0];wall.players.get('b').position=[-12,1,0];
  assert.equal(wall.command('a',{type:'interaction',action:'invite',peerId:'b',kind:'dance'}).ok,false);
});

test('movement, departure, travel and explicit stop end the dance for both people',()=>{
  for(const end of ['move','leave','travel','cancel','gesture']){
    const f=setup(),invitation=f.invite('dance');assert.equal(invitation.ok,true);
    assert.equal(f.command('b','accept',{id:invitation.interaction.id}).ok,true);f.advance(2000);
    if(end==='move')assert.equal(f.world.command('b',{type:'pose',position:[-12,1.5,0],yaw:0,altitude:0,interactionId:invitation.interaction.id}).ok,true);
    if(end==='leave')f.world.leave('b');
    if(end==='travel')assert.equal(f.world.command('b',{type:'travel',position:[-15,5]}).ok,true);
    if(end==='cancel')assert.equal(f.command('b','cancel',{id:invitation.interaction.id}).ok,true);
    if(end==='gesture')assert.equal(f.world.command('b',{type:'gesture',kind:'wave'}).ok,true);
    assert.equal(f.world.snapshot().interactions.length,0,end);
    assert.ok(f.world.snapshot().players.every(p=>p.gesture!=='dance'),end);
  }
});

test('checkpoint recovery retains consent and timing and rejects malformed interactions atomically',()=>{
  const f=setup(),invitation=f.invite('dance');assert.equal(invitation.ok,true);
  let restored=f.restore();assert.equal(restored.snapshot().interactions[0].status,'pending');
  assert.equal(f.command('b','accept',{id:invitation.interaction.id}).ok,true);f.advance(1000);
  restored=f.restore();assert.equal(restored.snapshot().players[0].interaction.elapsed,1);
  const corrupt=f.world.checkpoint();corrupt.payload.interactions[0].toId='missing';
  const {checksum,...envelope}=corrupt;corrupt.checksum=createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
  assert.equal(restored.restore(corrupt).ok,false);assert.equal(restored.snapshot().players[0].gesture,'dance');
  f.advance(15000);assert.equal(restored.snapshot().interactions.length,0);
});

test('handshake alignment corrects in-flight poses and refuses occupied space',()=>{
  const f=setup(),invitation=f.invite();assert.equal(invitation.ok,true);
  const original=[...f.world.players.get('b').position];
  assert.equal(f.command('b','accept',{id:invitation.interaction.id}).ok,true);
  f.advance(1200);
  const result=f.world.command('b',{type:'pose',position:original,yaw:1,altitude:0});
  assert.equal(result.error,'greeting_aligning');assert.ok(result.correction.interaction);
  assert.equal(f.world.command('b',{type:'pose',position:result.correction.position,yaw:2,altitude:0,interactionId:invitation.interaction.id}).ok,true);
  assert.equal(f.world.snapshot().interactions.length,1,'looking around does not cancel');
  const blocked=setup();blocked.world.players.get('c').position=[-12,.8,0];
  const next=blocked.invite();assert.equal(next.ok,true);
  assert.equal(blocked.command('b','accept',{id:next.interaction.id}).error,'interaction_space');
  assert.deepEqual(blocked.world.players.get('b').position,[-12,1,0],'failed alignment is atomic');
});

test('interaction checkpoints use a new writer version and still recover version 4 worlds',()=>{
  const f=setup(),current=f.world.checkpoint();assert.equal(current.version,5);
  const legacy={...current,version:4};delete legacy.payload.interactions;
  const {checksum,...envelope}=legacy;legacy.checksum=createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
  assert.equal(f.world.restore(legacy).ok,true);
  assert.equal(f.world.snapshot().interactions.length,0);
});
