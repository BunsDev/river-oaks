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
  state.roll=Math.atan((groundAt(x+c*halfBase*scale,z-s*halfBase*scale)-groundAt(x-c*halfBase*scale,z+s*halfBase*scale))/(2*halfBase*scale));
  state.pitch=-Math.atan((groundAt(x+s*halfTrack*scale,z+c*halfTrack*scale)-groundAt(x-s*halfTrack*scale,z-c*halfTrack*scale))/(2*halfTrack*scale));
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
  const forward=controls.forward,turn=Math.max(-1,Math.min(1,controls.turn-controls.strafe));
  for(let i=0;i<steps;i++) {
    const target=forward*(forward<0?1.4:(spec?.maxSpeed??4));
    state.speed+=(target-state.speed)*(1-Math.exp(-(forward?2:5)*dt));
    if(Math.abs(state.speed)<.0001)state.speed=0;
    state.steering=(state.steering??0)+(turn*(spec?.steeringLimit??.25)-(state.steering??0))*(1-Math.exp(-8*dt));
    const travelled=state.speed*dt,yaw=state.yaw+(spec?Math.tan(state.steering)*travelled/spec.wheelbase:turn*travelled/3.4*.75);
    const next={...state,position:[state.position[0]-Math.cos(yaw)*travelled,state.position[1],state.position[2]+Math.sin(yaw)*travelled],yaw};
    if(!environment.canOccupy(next)){state.speed=0;break;}
    state.position=next.position;state.yaw=yaw;state.distance+=travelled;
  }
  fitCarriageToGround(state,environment.groundAt,environment.wheelTreads);
  return state;
}

export function findCarriageExit(placement,environment,people=[]) {
  const c=Math.cos(placement.yaw),s=Math.sin(placement.yaw);
  for(const side of [1,-1])for(const along of [-1.9,0,1.9])for(const distance of [3,3.5,4]) {
    const x=placement.position[0]+along*c+side*distance*s,z=placement.position[2]-along*s+side*distance*c;
    const y=environment.groundAt(x,z);
    if(!environment.isFree(x,z)||environment.roomAt?.(x,z)||carriageContains(placement,x,y+.9,z,.45))continue;
    if(people.some(p=>!p.indoor&&Math.hypot(p.position[0]-x,p.position[1]+z)<.9))continue;
    return [x,y,z];
  }
  return null;
}
