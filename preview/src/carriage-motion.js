import { VEHICLES, drivingInput } from './vehicle-config.js';
// Carriage locomotion and terrain contact are independent of rendering and UI.
import { Euler, Quaternion, Vector3 } from 'three';
import { carriageContains } from './carriage-parking.js';

export const CARRIAGE_WHEELS=[[-1.78,.70,-1.16],[-1.78,.70,1.16],[1.66,.82,-1.16],[1.66,.82,1.16]];
const WHEEL_UP=new Vector3(0,1,0);
const orientation=p=>new Quaternion().setFromEuler(new Euler(p.pitch??0,p.yaw,p.roll??0,'YXZ'));

export function carriageTyreClearances(state,groundAt,wheelTreads) {
  const q=orientation(state),point=new Vector3(),scale=state.scale??1,spec=VEHICLES[state.vehicle];
  return (VEHICLES[state.vehicle]?.wheels??CARRIAGE_WHEELS).map(([x,r,z],i)=>{
    let clearance=Infinity;
    const samples=wheelTreads?.[i];
    if(samples) {
      const angle=(state.distance??0)/(r*scale),c=Math.cos(angle),s=Math.sin(angle);
      for(const sample of samples) {
        point.set(sample.x*c-sample.y*s,sample.x*s+sample.y*c,sample.z*(spec?1:(Math.sign(z)||1)));
        if(spec&&i<spec.steeredWheels)point.applyAxisAngle(WHEEL_UP,state.steering??0);
        point.x+=x;point.y+=r;point.z+=z;point.multiplyScalar(scale).applyQuaternion(q);
        point.x+=state.position[0];point.y+=state.position[1]+(state.wheelOffsets?.[i]??0);point.z+=state.position[2];
        clearance=Math.min(clearance,point.y-groundAt(point.x,point.z));
      }
      return clearance;
    }
    // Sample both tread edges; wheel ornamentation stays inside this envelope.
    for(let n=0;n<96;n++)for(const edge of [-.018,.018]) {
      const a=n/96*Math.PI*2;
      point.set(x+r*Math.cos(a),r+r*Math.sin(a),z+edge).multiplyScalar(scale).applyQuaternion(q);
      point.x+=state.position[0];point.y+=state.position[1]+(state.wheelOffsets?.[i]??0);point.z+=state.position[2];
      clearance=Math.min(clearance,point.y-groundAt(point.x,point.z));
    }
    return clearance;
  });
}

export function fitCarriageToGround(state,groundAt,wheelTreads) {
  const [x,,z]=state.position,c=Math.cos(state.yaw),s=Math.sin(state.yaw),scale=state.scale??1;
  const spec=VEHICLES[state.vehicle],halfBase=(spec?.wheelbase??3.44)/2,halfTrack=spec?Math.max(.3,...spec.wheels.map(w=>Math.abs(w[2]))):1.16;
  state.position[1]=groundAt(x,z);
  // Airborne, the hull hangs level over the ground it follows; position[1] stays that ground
  // (the shared pose carries altitude separately) and nothing presses on the suspension.
  if((state.altitude??0)>.1){state.roll=state.flightPitch??0;state.pitch=state.flightBank??0;state.wheelOffsets=(spec?.wheels??CARRIAGE_WHEELS).map(()=>0);return state;}
  state.roll=Math.atan((groundAt(x+c*halfBase*scale,z-s*halfBase*scale)-groundAt(x-c*halfBase*scale,z+s*halfBase*scale))/(2*halfBase*scale));
  state.pitch=-Math.atan((groundAt(x+s*halfTrack*scale,z+c*halfTrack*scale)-groundAt(x-s*halfTrack*scale,z-c*halfTrack*scale))/(2*halfTrack*scale));
  // Local X is the two-wheeler longitudinal axis. Solve contacts after banking.
  if(state.vehicle==='motorcycle')state.pitch+=state.lean??0;
  state.wheelOffsets=(spec?.wheels??CARRIAGE_WHEELS).map(()=>0);
  // World-vertical suspension leaves every contact sample's X/Z unchanged.
  // One solve is exact, including road seams that would defeat iteration along
  // a tilted chassis axis by moving a sample back and forth over an edge.
  state.wheelOffsets=carriageTyreClearances(state,groundAt,wheelTreads).map(gap=>-gap);
  return state;
}

export function stepCarriage(state,environment,input,delta) {
  if(!Number.isFinite(delta)||delta<=0)return state;
  const duration=Math.min(.08,delta),steps=Math.ceil(duration*120),dt=duration/steps;
  const controls=drivingInput(input),spec=VEHICLES[state.vehicle];
  if(controls.brake){state.speed=0;state.lean=(state.lean??0)*Math.exp(-8*duration);state.yawRate=0;state.flightBank=(state.flightBank??0)*Math.exp(-5*duration);state.flightPitch=(state.flightPitch??0)*Math.exp(-5*duration);fitCarriageToGround(state,environment.groundAt,environment.wheelTreads);return state;}
  const forward=controls.forward,turn=Math.max(-1,Math.min(1,controls.turn-controls.strafe));
  for(let i=0;i<steps;i++) {
    const top=controls.sprint||!spec?.cruiseSpeed?(spec?.maxSpeed??4):spec.cruiseSpeed;
    const target=forward*(forward<0?1.4:top);
    if(state.vehicle==='motorcycle') {
      // Bounded throttle and engine braking, stronger braking before reversing.
      const rate=!forward?3:Math.sign(target)!==Math.sign(state.speed)&&state.speed!==0?7:4.5;
      state.speed+=Math.max(-rate*dt,Math.min(rate*dt,target-state.speed));
    } else if(spec?.flies&&(state.altitude??0)>.1) {
      const rate=!forward?1.8:target*state.speed<0?5:3;
      state.speed+=Math.max(-rate*dt,Math.min(rate*dt,target-state.speed));
    } else state.speed+=(target-state.speed)*(1-Math.exp(-(forward?2:5)*dt));
    if(Math.abs(state.speed)<.0001)state.speed=0;
    state.steering=(state.steering??0)+(turn*(spec?.steeringLimit??.25)-(state.steering??0))*(1-Math.exp(-8*dt));
    if(state.vehicle==='motorcycle') {
      const lateral=state.speed*state.speed*Math.tan(state.steering)/spec.wheelbase;
      const lean=Math.max(-.5,Math.min(.5,Math.atan(lateral/9.81)));
      state.lean=(state.lean??0)+(lean-(state.lean??0))*(1-Math.exp(-8*dt));
    }
    const flying=spec?.flies&&(state.altitude??0)>.1;
    if(flying){
      const rate=(state.steering/spec.steeringLimit)*(.9-.35*Math.min(1,Math.abs(state.speed)/spec.maxSpeed));
      state.yawRate=(state.yawRate??0)+(rate-(state.yawRate??0))*(1-Math.exp(-6*dt));
      const clearance=Math.max(0,Math.min(1,(state.altitude-1)/3));
      const bank=Math.max(-.32,Math.min(.32,Math.atan(state.speed*state.yawRate/9.81)))*clearance;
      const pitch=-Math.max(-.18,Math.min(.18,Math.atan2(state.verticalSpeed??0,Math.max(3,Math.abs(state.speed)))*Math.min(1,Math.abs(state.speed)/3)))*clearance;
      state.flightBank=(state.flightBank??0)+(bank-(state.flightBank??0))*(1-Math.exp(-5*dt));
      state.flightPitch=(state.flightPitch??0)+(pitch-(state.flightPitch??0))*(1-Math.exp(-5*dt));
    }else{state.yawRate=0;state.flightBank=0;state.flightPitch=0;}
    const travelled=state.speed*dt,yaw=state.yaw+(flying?state.yawRate*dt:(spec?Math.tan(state.steering)*travelled/spec.wheelbase:turn*travelled/3.4*.75));
    const next={...state,position:[state.position[0]-Math.cos(yaw)*travelled,state.position[1],state.position[2]+Math.sin(yaw)*travelled],yaw};
    if(!environment.canOccupy(next)){state.speed=0;break;}
    state.position=next.position;state.yaw=yaw;state.distance+=travelled;
  }
  fitCarriageToGround(state,environment.groundAt,environment.wheelTreads);
  return state;
}

// Whether a flying vehicle's hull is clear of buildings and trees at its altitude: the
// hull's plan (front is -X) sampled at two heights above the ground beneath each point.
export function hoverClear(state,environment) {
  const spec=VEHICLES[state.vehicle];if(!spec?.flies)return false;
  const fly=environment.canFly??((x,_height,z)=>environment.isFree(x,z)),c=Math.cos(state.yaw),s=Math.sin(state.yaw),hl=spec.length/2,hw=spec.width/2;
  for(const [a,b] of [[0,0],[-hl,0],[hl,0],[0,-hw],[0,hw],[-hl*.7,-hw],[-hl*.7,hw],[hl*.7,-hw],[hl*.7,hw]]) {
    const x=state.position[0]+a*c+b*s,z=state.position[2]-a*s+b*c,ground=environment.groundAt(x,z);
    for(const height of [.4,spec.bodyHeight])if(!fly(x,ground+state.altitude+height,z))return false;
  }
  return true;
}

// Lift (Space up, C down, as in flight.js) moves a flying vehicle's altitude target at 4 m/s;
// the hull follows at up to 3 m/s, under the server's lift budget, never into a blocked sky
// and never above the flight ceiling. A landing vehicle ignores lift until it is down.
export function stepHoverLift(state,environment,input,delta) {
  const spec=VEHICLES[state.vehicle];if(!spec?.flies||!Number.isFinite(delta)||delta<=0)return state;
  const duration=Math.min(.08,delta),steps=Math.ceil(duration*120),dt=duration/steps,limit=environment.flightCeiling??32;
  const value=Number(input?.lift),lift=Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
  state.altitude??=0;state.liftTarget??=0;state.verticalSpeed??=0;
  for(let i=0;i<steps;i++){
    if(state.landing)state.liftTarget=0;else if(lift)state.liftTarget=Math.max(0,Math.min(limit,state.liftTarget+lift*4*dt));
    const difference=state.liftTarget-state.altitude,desired=Math.sign(difference)*Math.min(3,Math.sqrt(6*Math.abs(difference)));
    state.verticalSpeed+=Math.max(-3*dt,Math.min(3*dt,desired-state.verticalSpeed));
    let next=Math.max(0,Math.min(limit,state.altitude+state.verticalSpeed*dt));
    if((state.liftTarget-state.altitude)*(state.liftTarget-next)<=0){next=state.liftTarget;state.verticalSpeed=0;}
    if(next!==state.altitude&&!hoverClear({...state,altitude:next},environment)){state.verticalSpeed=0;state.liftTarget=state.altitude;break;}
    state.altitude=next;
    if(state.altitude<=.02&&state.liftTarget<=0){state.altitude=0;state.verticalSpeed=0;state.landing=false;break;}
  }
  return state;
}

// The follow camera's collision bubble (walking.js flightRadius): an exit
// closer than this to the vehicle collapses the camera into the rider.
const EXIT_CAMERA_CLEARANCE=1.3;
export function findCarriageExit(placement,environment,people=[]) {
  const c=Math.cos(placement.yaw),s=Math.sin(placement.yaw);
  for(const side of [1,-1])for(const along of [-1.9,0,1.9])for(const distance of [3,3.5,4]) {
    const x=placement.position[0]+along*c+side*distance*s,z=placement.position[2]-along*s+side*distance*c;
    const y=environment.groundAt(x,z);
    if(!environment.isFree(x,z)||environment.roomAt?.(x,z)||carriageContains(placement,x,y+.9,z,.45)||carriageContains(placement,x,y+1.68,z,EXIT_CAMERA_CLEARANCE))continue;
    if(people.some(p=>!p.indoor&&Math.hypot(p.position[0]-x,p.position[1]+z)<.9))continue;
    return [x,y,z];
  }
  return null;
}
