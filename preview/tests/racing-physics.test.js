import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaceState,stepRace,describeAir,landsUpright,RACE_TUNING,raceDriven} from '../src/racing-physics.js';
import {RACING_COURSES,createCourse,onTrack,rampHeightAt,RAMP} from '../src/racing-courses.js';
import {createRace,advanceRace} from '../src/racing-rules.js';

const flat={groundAt:()=>0,onTrack:()=>true,bounds:1e6};
const bike=(kind='motorcycle')=>createRaceState(kind,{position:[0,0,0],yaw:0});
const run=(state,env,input,seconds,hz=60)=>{for(let i=0;i<Math.round(seconds*hz);i++)stepRace(state,env,input,1/hz);return state;};
const planar=state=>Math.hypot(state.velocity[0],state.velocity[1]);

test('practice kinds are the road vehicles; the Ribbonwing keeps its flight model',()=>{
 for(const kind of ['motorcycle','rolls','bicycle'])assert.ok(raceDriven(kind));
 assert.equal(raceDriven('hover'),false);assert.throws(()=>createRaceState('hover'));
});

test('throttle is bounded, frame-rate stable and capped at the practice top speed',()=>{
 const a=bike(),b=bike();
 stepRace(a,flat,{forward:1},1/60);assert.ok(a.speed<=RACE_TUNING.motorcycle.accel/60+1e-9,'no instant surge');
 Object.assign(a,bike());
 run(a,flat,{forward:1,turn:.3},4,60);run(b,flat,{forward:1,turn:.3},4,30);
 assert.ok(Math.abs(a.distance-b.distance)<1e-6&&Math.abs(a.yaw-b.yaw)<1e-6,'120 Hz substeps make 30 and 60 fps identical');
 run(a,flat,{forward:1},20);assert.ok(a.speed<=RACE_TUNING.motorcycle.top&&a.speed>RACE_TUNING.motorcycle.top*.75,`settles near top: ${a.speed}`);
 run(a,flat,{forward:1,boost:true},20);assert.ok(a.speed>RACE_TUNING.motorcycle.top&&a.speed<=RACE_TUNING.motorcycle.boostTop,`boost lifts the cap: ${a.speed}`);
 run(a,flat,{},45);assert.equal(a.speed,0,'rolling resistance brings it to rest');
});

test('brake, reverse and the held handbrake all stop the vehicle; forward from reverse brakes first',()=>{
 const state=run(bike(),flat,{forward:1},5);
 run(state,flat,{forward:-1},5);assert.ok(state.speed<0&&state.speed>=-RACE_TUNING.motorcycle.reverseTop-1e-9,`reverses within its cap: ${state.speed}`);
 run(state,flat,{forward:1},.2);assert.ok(state.speed>-3&&state.speed<=0,'throttle while reversing brakes before it drives');
 run(state,flat,{forward:1},5);run(state,flat,{handbrake:true},4);
 assert.equal(state.speed,0);assert.equal(planar(state),0);
});

test('cornering within grip keeps speed; the handbrake lets the rear step out and spins the chassis faster',()=>{
 const grip=run(bike(),flat,{forward:1},4),speed=grip.speed;
 run(grip,flat,{forward:.3,turn:.2},1);
 assert.ok(Math.abs(grip.lateral)<1,`tyres hold a gentle bend: lateral ${grip.lateral}`);assert.ok(grip.speed>speed*.6);
 const slide=run(bike(),flat,{forward:1},4),yawBefore=slide.yaw;
 run(slide,flat,{turn:1,handbrake:true},.5);
 const yawGrip=run(run(bike(),flat,{forward:1},4),flat,{turn:1},.5).yaw;
 assert.ok(Math.abs(slide.lateral)>.6,`handbrake slides: lateral ${slide.lateral}`);
 assert.ok(slide.yaw-yawBefore>yawGrip*1.2,`handbrake rotates more: ${slide.yaw-yawBefore} vs ${yawGrip}`);
 assert.ok(slide.lean>0&&slide.lean<=RACE_TUNING.motorcycle.leanLimit+1e-9,'the motorcycle leans into it');
});

test('grass slows and loosens the vehicle; the world edge stops it',()=>{
 const road=run(bike(),flat,{forward:1},6).speed,grass=run(bike(),{groundAt:()=>0,onTrack:()=>false},{forward:1},6).speed;
 assert.ok(grass<road*.8,`grass top speed ${grass} vs ${road}`);
 const edge=run(bike(),{...flat,bounds:20},{forward:1},10);
 assert.ok(Math.abs(edge.position[0])<=20);
 assert.equal(planar(edge),0);
});

test('a hop leaves the ground, flies ballistically and lands flat with speed kept, throttle held or not',()=>{
 const state=run(bike(),flat,{forward:1},4),speed=state.speed;
 stepRace(state,flat,{forward:1,jump:true},1/60);
 assert.equal(state.airborne,true);assert.equal(state.event?.type,'takeoff');assert.ok(state.vy>3);
 let peak=0,landed=null;
 for(let i=0;i<180&&!landed;i++){stepRace(state,flat,{forward:1,turn:1},1/60);peak=Math.max(peak,state.position[1]);if(state.event?.type==='landing'||state.event?.type==='crash')landed=state.event;}
 assert.ok(peak>.8&&peak<1.2,`hop height ${peak}`);
 assert.equal(landed?.type,'landing');assert.equal(landed.label,'');assert.equal(state.tricks.score,0,'a plain hop scores nothing');
 assert.ok(Math.abs(state.speed-speed)<speed*.1,`speed kept through the air: ${state.speed} vs ${speed}`);
 assert.equal(state.airborne,false);assert.equal(state.position[1],0);
});

test('a full backflip landed on the wheels scores; holding the flip too long crashes and bleeds speed',()=>{
 const high={groundAt:()=>-30,onTrack:()=>true};
 const clean=run(bike(),flat,{forward:1},4);
 stepRace(clean,flat,{forward:1,jump:true},1/60);
 const one=2*Math.PI/RACE_TUNING.motorcycle.flip;
 run(clean,high,{forward:1,flip:-1},one+.1);
 assert.ok(clean.airborne&&Math.abs(clean.air.flip+2*Math.PI)<.6,`one rotation back: ${clean.air.flip}`);
 stepRace(clean,{groundAt:()=>clean.position[1]-.01,onTrack:()=>true},{},1/60);
 assert.equal(clean.event?.type,'landing');assert.equal(clean.event.label,'Backflip');assert.equal(clean.event.score,100);assert.equal(clean.tricks.score,100);
 const crash=run(bike(),flat,{forward:1},4),speed=crash.speed;
 stepRace(crash,flat,{forward:1,jump:true},1/60);
 run(crash,high,{forward:1,flip:1},one/2);
 run(crash,high,{},.2);stepRace(crash,{groundAt:()=>crash.position[1]+.5,onTrack:()=>true},{},1/60);
 assert.equal(crash.event?.type,'crash');assert.ok(crash.speed<speed*.5,`crash bleeds speed: ${crash.speed}`);
 assert.equal(crash.tricks.score,0);assert.equal(crash.nose,0);
});

test('trick names and scores follow the rotation and hang time',()=>{
 const tau=Math.PI*2;
 assert.deepEqual(describeAir({flip:tau,barrel:0,spin:0,time:.8}),{label:'Frontflip',score:100});
 assert.deepEqual(describeAir({flip:-tau*2,barrel:0,spin:0,time:1}),{label:'Double backflip',score:200});
 assert.deepEqual(describeAir({flip:0,barrel:tau,spin:Math.PI,time:1}),{label:'Barrel roll + 180 spin',score:150});
 assert.deepEqual(describeAir({flip:0,barrel:0,spin:tau,time:.5}),{label:'360 spin',score:100});
 assert.deepEqual(describeAir({flip:0,barrel:0,spin:0,time:1.4}),{label:'Big air',score:25});
 assert.deepEqual(describeAir({flip:.4,barrel:0,spin:0,time:.4}),{label:'',score:0});
 assert.ok(landsUpright(0,0)&&landsUpright(.8,0)&&!landsUpright(Math.PI/2,0)&&!landsUpright(0,2));
});

test('course kickers rise along their slope, drop at the lip and launch a vehicle that drives over one',()=>{
 const course=createCourse('garden-sweep');
 assert.equal(course.ramps.length,RAMP.thirds.length);
 for(const ramp of course.ramps)assert.ok(course.gates.every(g=>Math.hypot(g.x-ramp.x,g.z-ramp.z)>8),'kickers keep clear of the gates');assert.equal(createCourse('garden-sweep',{airborne:true}).ramps.length,0);
 const ramp=course.ramps[0];
 const at=(along,across=0)=>rampHeightAt(course,ramp.x+ramp.dx*(along-ramp.length/2)-ramp.dz*across,ramp.z+ramp.dz*(along-ramp.length/2)+ramp.dx*across);
 assert.equal(at(-.5),0);assert.ok(Math.abs(at(ramp.length/2)-ramp.height/2)<1e-9);assert.ok(Math.abs(at(ramp.length-1e-6)-ramp.height)<1e-3);assert.equal(at(ramp.length+.01),0);
 assert.equal(at(ramp.length/2,ramp.halfWidth+.1),0,'a lane stays beside the kicker');
 assert.ok(onTrack(course,ramp.x,ramp.z),'kickers sit on the road');
 // Drive straight at the kicker from 30 m behind it, along its direction.
 const state=createRaceState('motorcycle',{position:[ramp.x-ramp.dx*30,0,ramp.z-ramp.dz*30],yaw:Math.atan2(ramp.dz,-ramp.dx)});
 const env={groundAt:(x,z)=>rampHeightAt(course,x,z),onTrack:()=>true};
 let airborne=false,peak=0,landing=null,maxNose=0;
 for(let i=0;i<600&&!landing;i++){stepRace(state,env,{forward:1},1/60);if(state.airborne){airborne=true;peak=Math.max(peak,state.position[1]);maxNose=Math.min(maxNose,state.nose);}if(state.event?.type==='landing'||state.event?.type==='crash')landing=state.event;}
 assert.ok(airborne,'the kicker launches the motorcycle');assert.ok(peak>ramp.height+.25,`it rises above the lip: ${peak}`);
 assert.ok(maxNose<-.05,'it leaves the lip nose up');
 assert.equal(landing?.type,'landing',`an untouched jump lands clean: ${JSON.stringify(landing)}`);
 assert.ok(state.position[1]===0&&state.speed>5);
});

test('every road course can be lapped by each practice vehicle under the new physics, kickers included',()=>{
 for(const kind of ['motorcycle','rolls','bicycle'])for(const spec of RACING_COURSES){
  const course=createCourse(spec.id),g=course.gates[0],race=createRace(course.gates);
  const state=createRaceState(kind,{position:[g.x,0,g.z],yaw:Math.atan2(g.dz,-g.dx)});
  const env={groundAt:(x,z)=>rampHeightAt(course,x,z),onTrack:(x,z)=>onTrack(course,x,z)};
  let airtime=0,stalled=0,backing=0;
  for(let frame=0;frame<18000&&!race.finished;frame++){
   let nearest=0,distance=Infinity;
   for(let i=0;i<240;i++){const p=course.points[i],d=(p.x-state.position[0])**2+(p.z-state.position[2])**2;if(d<distance){distance=d;nearest=i;}}
   const target=course.points[(nearest+4)%240],yaw=Math.atan2(target.z-state.position[2],-(target.x-state.position[0]));
   const error=Math.atan2(Math.sin(yaw-state.yaw),Math.cos(yaw-state.yaw));
   const before=[state.position[0],state.position[2]];
   // A plain follower: ease off as the target swings away, reverse with opposite lock when it is behind.
   // Wedged against a kicker's side (a player would reverse): back out for a second.
   stalled=!state.airborne&&Math.abs(state.speed)<.3&&frame>60?stalled+1:0;if(stalled>30){backing=60;stalled=0;}
   const reversing=backing>0||Math.abs(error)>1.2;if(backing>0)backing--;
   stepRace(state,env,{forward:reversing?-.4:.45*Math.max(.2,1-Math.abs(error)),turn:Math.max(-1,Math.min(1,(reversing?-1:1)*error*3))},1/60);
   if(state.airborne)airtime+=1/60;
   advanceRace(race,before,[state.position[0],state.position[2]],1/60);
  }
  assert.equal(race.finished,true,`${kind} on ${spec.id}: gate ${race.next}, position ${state.position}`);
  assert.ok(airtime>.3,`${kind} on ${spec.id} took air over a kicker`);
 }
});
