// Garden Circuit practice physics (Val, 2026-10-31): a planar body with tyre grip and
// slip, a vertical axis for kickers, hops and tricks, and a trick ledger. Local practice
// only. The shared town keeps its own contract (carriage-motion.js, server/world.js);
// nothing here crosses the network or changes a server speed cap.
import { VEHICLES } from './vehicle-config.js';
import { fitCarriageToGround } from './carriage-motion.js';

export const GRAVITY=9.81;
const TAU=Math.PI*2;
const clamp=(value,limit)=>Math.max(-limit,Math.min(limit,value));
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
const control=value=>typeof value==='number'&&Number.isFinite(value)?clamp(value,1):0;

// Per-kind handling (m, m/s, m/s², rad, rad/s). `top` is the practice top speed and
// `boostTop` the boosted one; `gripAccel` is the lateral acceleration the tyres hold
// before the rear steps out, `driftAccel` what they hold with the handbrake pulled.
export const RACE_TUNING={
 motorcycle:{accel:9,top:18,boostTop:23,reverseTop:3,brake:13,handbrake:9,drag:.006,rolling:.5,gripAccel:12,gripRate:12,driftAccel:3.5,driftRate:2,steerLimit:.55,steerRate:9,steerSpeed:20,jump:4.4,flip:7,barrel:8,spin:5.5,leanLimit:.55},
 rolls:{accel:7.5,top:16,boostTop:21,reverseTop:3,brake:12,handbrake:8,drag:.008,rolling:.5,gripAccel:11,gripRate:12,driftAccel:3,driftRate:2,steerLimit:.48,steerRate:7,steerSpeed:18,jump:3.8,flip:5.5,barrel:6,spin:4.5,leanLimit:0},
 bicycle:{accel:3.8,top:9,boostTop:12.5,reverseTop:1.5,brake:7,handbrake:6,drag:.015,rolling:.4,gripAccel:9,gripRate:12,driftAccel:3,driftRate:2.5,steerLimit:.6,steerRate:10,steerSpeed:12,jump:3.4,flip:6.5,barrel:7,spin:5.5,leanLimit:.5},
};

/** Whether this kind drives under the practice physics (the Ribbonwing flies under carriage-motion.js). */
export const raceDriven=kind=>Object.hasOwn(RACE_TUNING,kind);

export function createRaceState(kind,{position=[0,0,0],yaw=0}={}) {
 if(!raceDriven(kind))throw new Error('Unknown practice vehicle');
 return {vehicle:kind,position:[position[0],position[1]??0,position[2]],yaw,pitch:0,roll:0,speed:0,lateral:0,velocity:[0,0],vy:0,groundVy:0,airborne:false,steering:0,lean:0,distance:0,altitude:0,wheelOffsets:VEHICLES[kind].wheels.map(()=>0),
  nose:0,bank:0,flipRate:0,barrelRate:0,spinRate:0,settle:{nose:0,bank:0},air:null,event:null,tricks:{score:0,count:0,best:''},grass:false};
}

/** Reads one frame's controls: forward/turn drive on the ground; flip, barrel and spin act in the air. */
export function raceInput(value) {
 const input=value&&typeof value==='object'?value:{};
 return {forward:control(input.forward),turn:control(input.turn),flip:control(input.flip),barrel:control(input.barrel),spin:control(input.spin),handbrake:input.handbrake===true,boost:input.boost===true,jump:input.jump===true};
}

const count=n=>n===1?'':n===2?'Double ':n===3?'Triple ':`${n}× `;
/** Names and scores one flight from its accumulated rotation and hang time. */
export function describeAir(air) {
 const flips=Math.round(Math.abs(air.flip)/TAU),rolls=Math.round(Math.abs(air.barrel)/TAU),halves=Math.round(Math.abs(air.spin)/Math.PI),parts=[];
 if(flips)parts.push(`${count(flips)}${air.flip>0?'frontflip':'backflip'}`);
 if(rolls)parts.push(`${count(rolls)}barrel roll`);
 if(halves)parts.push(`${halves*180} spin`);
 const label=parts.length?parts.join(' + ').replace(/^./,c=>c.toUpperCase()):air.time>=1?'Big air':'';
 return {label,score:flips*100+rolls*100+halves*50+(parts.length||air.time<1?0:25)};
}

/** Whether a body at these angles would land on its wheels (within about 55° of upright). */
export const landsUpright=(nose,bank)=>Math.cos(nose)*Math.cos(bank)>.55;

// Render angles: `roll` is the nose angle (about the chassis Z axis, up is negative) and
// `pitch` the bank, the convention fitCarriageToGround and the vehicle meshes share.
function pose(state,groundAt,wheelTreads) {
 if(state.airborne){state.pitch=state.bank;state.roll=state.nose;state.wheelOffsets=state.wheelOffsets.map(()=>0);return;}
 fitCarriageToGround(state,groundAt,wheelTreads);
 if(state.vehicle==='bicycle')state.pitch+=state.lean*.7;
 state.pitch+=state.settle.bank;state.roll+=state.settle.nose;
}

/**
 * Advances one practice vehicle. `environment.groundAt(x,z)` is the surface (kickers
 * included), `environment.onTrack(x,z)` whether that point is tarmac rather than grass,
 * `environment.bounds` the half-size of the drivable square.
 */
export function stepRace(state,environment,input,delta) {
 state.event=null;
 if(!Number.isFinite(delta)||delta<=0)return state;
 const tuning=RACE_TUNING[state.vehicle],spec=VEHICLES[state.vehicle];
 const duration=Math.min(.08,delta),steps=Math.ceil(duration*120),dt=duration/steps;
 const controls=raceInput(input),groundAt=environment.groundAt??(()=>0),bounds=environment.bounds??280;
 let jump=controls.jump;
 for(let i=0;i<steps;i++) {
  const x0=state.position[0],z0=state.position[2],y0=state.position[1];
  if(!state.airborne) {
   state.grass=environment.onTrack?environment.onTrack(x0,z0)===false:false;
   const grass=state.grass?.6:1,u=state.speed,moving=Math.abs(u)>.05;
   // Steering: speed-sensitive lock, then a kinematic yaw rate the tyres can hold.
   const lock=tuning.steerLimit/(1+(Math.abs(u)/tuning.steerSpeed)**2);
   state.steering+=(controls.turn*lock-state.steering)*(1-Math.exp(-tuning.steerRate*dt));
   const held=(controls.handbrake?tuning.driftAccel:tuning.gripAccel)*grass;
   let yawRate=u*Math.tan(state.steering)/spec.wheelbase;
   if(Math.abs(u)>.5)yawRate=clamp(yawRate,held*1.25/Math.abs(u));
   if(controls.handbrake&&moving)yawRate+=(state.steering/tuning.steerLimit)*1.8*Math.min(1,Math.abs(u)/6)*Math.sign(u);
   state.yaw+=yawRate*dt;
   // Velocity in the new body frame: whatever the chassis swung past is lateral slip.
   const c=Math.cos(state.yaw),s=Math.sin(state.yaw);
   let forward=-state.velocity[0]*c+state.velocity[1]*s,lateral=state.velocity[0]*s+state.velocity[1]*c;
   const top=controls.boost?tuning.boostTop:tuning.top,power=(controls.boost?1.5:1)*(state.grass?.55:1);
   let accel=0;
   if(controls.forward>0)accel=forward<-.1?tuning.brake*controls.forward:tuning.accel*controls.forward*power*Math.max(.15,1-Math.max(0,forward)/top);
   else if(controls.forward<0)accel=forward>.3?-tuning.brake*-controls.forward:-tuning.accel*.5*-controls.forward*Math.max(0,1+forward/tuning.reverseTop);
   else if(moving)accel=-Math.sign(forward)*tuning.rolling;
   accel-=tuning.drag*forward*Math.abs(forward)+(state.grass?Math.sign(forward)*2.5:0);
   forward+=accel*dt;
   if(controls.handbrake){const stop=tuning.handbrake*dt;forward=Math.abs(forward)<=stop?0:forward-Math.sign(forward)*stop;}
   if(Math.abs(forward)<.06&&controls.forward===0)forward=0;
   const gripRate=controls.handbrake?tuning.driftRate:tuning.gripRate,relax=clamp(lateral*gripRate,held)*dt;
   lateral=Math.abs(relax)>=Math.abs(lateral)?0:lateral-relax;
   state.speed=forward;state.lateral=lateral;
   state.velocity=[-forward*c+lateral*s,forward*s+lateral*c];
   const leanTarget=tuning.leanLimit?clamp(Math.atan(forward*yawRate/GRAVITY),tuning.leanLimit):0;
   state.lean+=(leanTarget-state.lean)*(1-Math.exp(-8*dt));
   const x=x0+state.velocity[0]*dt,z=z0+state.velocity[1]*dt;
   if(Math.abs(x)>bounds||Math.abs(z)>bounds){state.position[0]=clamp(x,bounds);state.position[2]=clamp(z,bounds);state.velocity=[0,0];state.speed=0;state.lateral=0;continue;}
   const ground=groundAt(x,z);
   if(ground-y0>.45){state.velocity=[0,0];state.speed=forward*-.15;state.lateral=0;continue;}
   state.position[0]=x;state.position[2]=z;state.distance+=forward*dt;
   const freefall=y0+state.groundVy*dt-GRAVITY*dt*dt;
   const ahead=groundAt(x-c*spec.wheelbase/2,z+s*spec.wheelbase/2);
   const launch=jump||freefall>ground+.05||(state.groundVy>.5&&ground-ahead>.3);
   if(launch) {
    const hop=jump;jump=false;
    state.airborne=true;state.vy=hop?Math.max(state.groundVy,0)+tuning.jump:state.groundVy;
    state.position[1]=hop?y0:Math.max(y0,ground);state.air={flip:0,barrel:0,spin:0,time:0};
    // Leave the ramp at the chassis angle the fit gave it; the hop keeps the bike level.
    state.nose=state.roll-state.settle.nose;state.bank=(state.vehicle==='motorcycle'?state.pitch-state.lean:state.pitch)-state.settle.bank;
    state.settle.nose=0;state.settle.bank=0;state.flipRate=0;state.barrelRate=0;state.spinRate=0;
    state.event={type:'takeoff'};
   } else {
    state.groundVy=(ground-y0)/dt;state.position[1]=ground;
   }
   state.settle.nose*=Math.exp(-9*dt);state.settle.bank*=Math.exp(-9*dt);
   continue;
  }
  // Airborne: ballistic flight with tricks. Front/back flips, left/right barrel rolls and
  // spins come from the air controls (the page sends only keys pressed after takeoff, so a
  // held throttle never flips); with no flip the nose follows the arc and lands flat.
  const air=state.air;air.time+=dt;
  state.vy-=GRAVITY*dt;
  const x=clamp(x0+state.velocity[0]*dt,bounds),z=clamp(z0+state.velocity[1]*dt,bounds),y=y0+state.vy*dt;
  state.position[0]=x;state.position[2]=z;state.distance+=state.speed*dt;
  const planar=Math.hypot(state.velocity[0],state.velocity[1]);
  const flipTarget=controls.flip?controls.flip*tuning.flip:Math.abs(wrap(state.nose))<1?(clamp(-Math.atan2(state.vy,Math.max(3,planar))*.6,.4)-wrap(state.nose))*3:0;
  state.flipRate+=(flipTarget-state.flipRate)*(1-Math.exp(-10*dt));
  state.barrelRate+=(controls.barrel*tuning.barrel-state.barrelRate)*(1-Math.exp(-10*dt));
  state.spinRate+=(controls.spin*tuning.spin-state.spinRate)*(1-Math.exp(-10*dt));
  state.nose+=state.flipRate*dt;state.bank+=state.barrelRate*dt;state.yaw+=state.spinRate*dt;
  air.flip+=state.flipRate*dt;air.barrel+=state.barrelRate*dt;air.spin+=state.spinRate*dt;
  state.lean*=Math.exp(-6*dt);state.steering*=Math.exp(-6*dt);
  const ground=groundAt(x,z);
  // Still rising, the body rides over whatever launched it (the lip of a kicker under the
  // rear wheel); only a falling body touches down.
  if(y>ground||state.vy>0){if(y<ground)state.vy+=GRAVITY*dt;state.position[1]=Math.max(y,ground);continue;}
  // Touchdown: on the wheels the lap goes on with the flight's score; otherwise a crash.
  state.airborne=false;state.position[1]=ground;state.groundVy=0;
  const c=Math.cos(state.yaw),s=Math.sin(state.yaw);
  state.speed=-state.velocity[0]*c+state.velocity[1]*s;state.lateral=state.velocity[0]*s+state.velocity[1]*c;
  const upright=landsUpright(state.nose,state.bank),{label,score}=describeAir(air);
  if(upright) {
   state.settle.nose=wrap(state.nose);state.settle.bank=wrap(state.bank);
   if(score){state.tricks.score+=score;state.tricks.count++;state.tricks.best=label;}
   state.event={type:'landing',label,score,time:air.time};
  } else {
   state.speed*=.3;state.lateral=0;state.velocity=[-state.speed*c,state.speed*s];state.settle.nose=0;state.settle.bank=0;
   state.event={type:'crash',label:label?`Crashed out of ${label.toLowerCase()}`:'Crash landing',score:0,time:air.time};
  }
  state.nose=0;state.bank=0;state.flipRate=0;state.barrelRate=0;state.spinRate=0;state.air=null;
 }
 pose(state,groundAt,environment.wheelTreads);
 return state;
}
