import test from 'node:test';
import assert from 'node:assert/strict';
import {stepCarriage,carriageTyreClearances} from '../src/carriage-motion.js';
const environment={groundAt:()=>0,canOccupy:()=>true};
const bike=()=>({vehicle:'motorcycle',position:[0,0,0],yaw:0,speed:0,distance:0});
test('motorcycle builds bounded lean into corners while tyres remain grounded',()=>{
 const state=bike();
 for(let i=0;i<180;i++)stepCarriage(state,environment,{forward:1,turn:1},1/60);
 assert.ok(state.lean>0.05&&state.lean<0.6);
 assert.ok(Math.abs(state.pitch-state.lean)<1e-9);
 assert.ok(carriageTyreClearances(state,environment.groundAt).every(v=>Math.abs(v)<1e-6));
 for(let i=0;i<180;i++)stepCarriage(state,environment,{},1/60);
 assert.ok(Math.abs(state.lean)<.001);
});
test('motorcycle acceleration and engine braking are bounded and frame-rate stable',()=>{
 const a=bike(),b=bike();
 stepCarriage(a,environment,{forward:1},1/60);
 assert.ok(a.speed<=4.5/60,'no instant throttle surge');
 Object.assign(a,bike());
 for(let i=0;i<120;i++)stepCarriage(a,environment,{forward:1,turn:.5},1/60);
 for(let i=0;i<60;i++)stepCarriage(b,environment,{forward:1,turn:.5},1/30);
 assert.ok(Math.abs(a.distance-b.distance)<.001);
 assert.ok(Math.abs(a.yaw-b.yaw)<.001);
 assert.ok(a.speed<=6);
});
test('hard safety brake still stops immediately and relaxes lean',()=>{
 const state=bike();
 for(let i=0;i<120;i++)stepCarriage(state,environment,{forward:1,turn:1},1/60);
 for(let i=0;i<120;i++)stepCarriage(state,environment,{brake:true},1/60);
 assert.equal(state.speed,0);assert.ok(Math.abs(state.lean)<.001);
});

test('race checkpoints require ordered forward crossings and finish only after a complete lap',async()=>{
 const {createRace,advanceRace}=await import('../src/racing-rules.js');
 const gates=[{x:0,z:0,dx:1,dz:0},{x:10,z:0,dx:1,dz:0},{x:20,z:0,dx:1,dz:0}];
 const race=createRace(gates);
 advanceRace(race,[19,0],[21,0],1);assert.equal(race.next,1);
 advanceRace(race,[11,0],[9,0],1);assert.equal(race.next,1);
 advanceRace(race,[9,20],[11,20],1);assert.equal(race.next,1);
 advanceRace(race,[9,0],[11,0],1);assert.equal(race.next,2);
 advanceRace(race,[19,0],[21,0],1);assert.equal(race.next,0);assert.equal(race.finished,false);
 advanceRace(race,[-1,0],[1,0],1);assert.equal(race.finished,true);assert.equal(race.elapsed,6);
 advanceRace(race,[-1,0],[1,0],4);assert.equal(race.elapsed,6);
});
test('race reset has no carried progress and rejects invalid movement/time',async()=>{
 const {createRace,advanceRace}=await import('../src/racing-rules.js');
 const gates=[{x:0,z:0,dx:1,dz:0},{x:10,z:0,dx:1,dz:0}];
 const race=createRace(gates);
 advanceRace(race,[9,0],[11,0],NaN);assert.equal(race.next,1);assert.equal(race.elapsed,0);
 advanceRace(race,[NaN,0],[11,0],1);assert.equal(race.elapsed,0);
 assert.deepEqual(createRace(gates),race);
});
test('each practice course closes, supports its start and rejects outside ground',async()=>{
 const {RACING_COURSES,createCourse,onTrack}=await import('../src/racing-courses.js');
 assert.equal(RACING_COURSES.length,3);
 for(const spec of RACING_COURSES){const course=createCourse(spec.id);
 assert.ok(course.gates.length>=8);assert.ok(onTrack(course,course.points[0].x,course.points[0].z));
 assert.equal(onTrack(course,1000,1000),false);
 assert.ok(course.points[0].distanceTo(course.points.at(-1))<1e-6);
 }
});

test('all three courses can be completed by the real vehicle integrator',async()=>{
 const {RACING_COURSES,createCourse,onTrack}=await import('../src/racing-courses.js');
 const {createRace,advanceRace}=await import('../src/racing-rules.js');
 for(const kind of ['motorcycle','rolls','bicycle'])for(const spec of RACING_COURSES){
  const course=createCourse(spec.id),g=course.gates[0];
  const state={...bike(),vehicle:kind,position:[g.x,0,g.z],yaw:Math.atan2(g.dz,-g.dx)},race=createRace(course.gates);
  for(let frame=0;frame<18000&&!race.finished;frame++){
   let nearest=0,distance=Infinity;
   for(let i=0;i<240;i++){const p=course.points[i],d=(p.x-state.position[0])**2+(p.z-state.position[2])**2;if(d<distance){distance=d;nearest=i;}}
   const target=course.points[(nearest+2)%240],yaw=Math.atan2(target.z-state.position[2],-(target.x-state.position[0]));
   const error=Math.atan2(Math.sin(yaw-state.yaw),Math.cos(yaw-state.yaw));
   const before=[state.position[0],state.position[2]];
   stepCarriage(state,{...environment,canOccupy:p=>onTrack(course,p.position[0],p.position[2],2.5)},{forward:.45,turn:Math.max(-1,Math.min(1,error*6))},1/60);
   advanceRace(race,before,[state.position[0],state.position[2]],1/60);
  }
  assert.equal(race.finished,true,`${kind} on ${spec.id}: gate ${race.next}, position ${state.position}`);
 }
});

test('banked motorcycle contacts stay grounded on a slope using rendered tyre geometry',async()=>{
 const {createRoadVehicle}=await import('../src/road-vehicles.js');
 const model=createRoadVehicle('motorcycle'),groundAt=(x,z)=>.02*x+.03*z;
 try{for(const turn of [-1,1]){const state=bike();for(let i=0;i<120;i++)stepCarriage(state,{...environment,groundAt,wheelTreads:model.wheelTreads},{forward:1,turn},1/60);
 assert.equal(Math.sign(state.lean),turn);
 assert.ok(carriageTyreClearances(state,groundAt,model.wheelTreads).every(gap=>Math.abs(gap)<1e-6));
 }}finally{model.dispose();}
});

test('Ribbonwing turns in hover without translating and banks smoothly in forward flight',()=>{
 const state={...bike(),vehicle:'hover',altitude:8,verticalSpeed:0};
 for(let i=0;i<60;i++)stepCarriage(state,environment,{turn:1},1/60);
 assert.ok(state.yaw>.3);assert.equal(state.distance,0);assert.ok(Math.abs(state.pitch)<.01);
 for(let i=0;i<180;i++)stepCarriage(state,environment,{forward:1,turn:1},1/60);
 assert.ok(state.pitch>.05&&state.pitch<.36);assert.ok(state.speed<=9);
});
test('Ribbonwing lift is frame-rate stable, settles at target, and cannot descend into an obstacle',async()=>{
 const {stepHoverLift}=await import('../src/carriage-motion.js');
 const a={...bike(),vehicle:'hover',altitude:8,liftTarget:8},b=structuredClone(a),env={...environment,canFly:()=>true,flightCeiling:32};
 for(let i=0;i<120;i++)stepHoverLift(a,env,{lift:1},1/60);
 for(let i=0;i<60;i++)stepHoverLift(b,env,{lift:1},1/30);
 assert.ok(Math.abs(a.altitude-b.altitude)<.0001);
 for(let i=0;i<600;i++)stepHoverLift(a,env,{},1/60);
 assert.ok(Math.abs(a.altitude-a.liftTarget)<.001);assert.ok(Math.abs(a.verticalSpeed)<.001);
 const blocked={...b,altitude:8,liftTarget:1,verticalSpeed:-3};
 stepHoverLift(blocked,{...env,canFly:(_x,y)=>y>=8.4},{},.08);
 assert.equal(blocked.altitude,8);assert.equal(blocked.verticalSpeed,0);
});

test('aerial gates reject crossings above or below their altitude window',async()=>{
 const {createRace,advanceRace}=await import('../src/racing-rules.js');
 const gates=[{x:0,z:0,dx:1,dz:0,altitude:8,halfHeight:2},{x:10,z:0,dx:1,dz:0,altitude:12,halfHeight:2}],race=createRace(gates);
 advanceRace(race,[9,0,0],[11,0,0],1);assert.equal(race.next,1);
 advanceRace(race,[9,0,20],[11,0,20],1);assert.equal(race.next,1);
 advanceRace(race,[9,0,12],[11,0,12],1);assert.equal(race.next,0);
 advanceRace(race,[-1,0],[1,0],1);assert.equal(race.finished,false,'missing altitude never passes an aerial gate');
});

test('Ribbonwing can complete each aerial course at the required gate altitudes',async()=>{
 const {RACING_COURSES,createCourse}=await import('../src/racing-courses.js');
 const {createRace,advanceRace}=await import('../src/racing-rules.js');
 const {stepHoverLift}=await import('../src/carriage-motion.js');
 for(const spec of RACING_COURSES){const course=createCourse(spec.id,{airborne:true}),g=course.gates[0],race=createRace(course.gates);
 const state={...bike(),vehicle:'hover',position:[g.x,0,g.z],yaw:Math.atan2(g.dz,-g.dx),altitude:8,liftTarget:8};
 for(let frame=0;frame<18000&&!race.finished;frame++){
 let nearest=0,distance=Infinity;for(let i=0;i<240;i++){const p=course.points[i],d=(p.x-state.position[0])**2+(p.z-state.position[2])**2;if(d<distance){distance=d;nearest=i;}}
 const p=course.points[(nearest+3)%240],yaw=Math.atan2(p.z-state.position[2],-(p.x-state.position[0])),error=Math.atan2(Math.sin(yaw-state.yaw),Math.cos(yaw-state.yaw));
 const before=[state.position[0],state.position[2],state.altitude],height=course.gates[race.next].altitude-state.liftTarget;
 stepHoverLift(state,{...environment,canFly:()=>true},{lift:Math.abs(height)>.06?Math.sign(height):0},1/60);
 stepCarriage(state,environment,{forward:.4,turn:Math.max(-1,Math.min(1,error*3))},1/60);
 advanceRace(race,before,[state.position[0],state.position[2],state.altitude],1/60);
 }
 assert.equal(race.finished,true,`${spec.id}: gate ${race.next}`);
 }
});
