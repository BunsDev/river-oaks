import {CatmullRomCurve3,Vector3} from 'three';
export const RACING_COURSES=[
 {id:'garden-sweep',name:'Garden Sweep',description:'Wide flowing bends. Build speed, settle the steering, and hold a clean arc.',width:12,nodes:[[0,0],[-35,0],[-60,25],[-35,55],[10,60],[40,35],[35,0]]},
 {id:'rose-slalom',name:'Rose Slalom',description:'Linked S bends. Change lean smoothly and look one gate ahead.',width:10,nodes:[[0,0],[-25,-12],[-50,9],[-75,-12],[-100,8],[-115,40],[-75,65],[-25,60],[15,35]]},
 {id:'crown-hairpins',name:'Crown Hairpins',description:'Two tight switchbacks. Brake early, rotate, then accelerate out.',width:10,nodes:[[0,0],[-40,0],[-65,15],[-40,30],[0,30],[25,45],[0,60],[-60,60],[-85,40],[-95,-20],[-45,-35],[20,-25]]},
];
// Kickers (Val, 2026-10-31): three wedges per road course, each on the straightest stretch
// of its third of the lap and clear of the gates, leaving a lane on either side for anyone
// who would rather not jump. The aerial courses have none.
export const RAMP={length:7,height:1.3,margin:1.6,thirds:[[.1,.37],[.37,.63],[.63,.9]],gateClearance:.035};
const rampSpots=curve=>{
 const chosen=[];
 for(const [from,to] of RAMP.thirds){
  let best=null;
  for(let t=from;t<=to+1e-9;t+=.005){
   if(Array.from({length:12},(_,i)=>i/12).some(gate=>Math.abs(gate-t)<RAMP.gateClearance)||chosen.some(c=>Math.abs(c-t)<.08))continue;
   const a=curve.getTangentAt(Math.max(0,t-.03)),b=curve.getTangentAt(Math.min(1,t+.03)),bend=Math.acos(Math.max(-1,Math.min(1,a.dot(b))));
   if(!best||bend<best.bend)best={t,bend};
  }
  chosen.push(best.t);
 }
 return chosen;
};
export function createCourse(id,{airborne=false}={}) {
 const spec=RACING_COURSES.find(course=>course.id===id);
 if(!spec)throw new Error('Unknown course');
 const curve=new CatmullRomCurve3(spec.nodes.map(([x,z])=>new Vector3(x,0,z)),true,'centripetal');
 const points=curve.getSpacedPoints(240),gates=Array.from({length:12},(_,i)=>{
  const p=curve.getPointAt(i/12),d=curve.getTangentAt(i/12);
  return {x:p.x,z:p.z,dx:d.x,dz:d.z,halfWidth:spec.width/2,...(airborne?{altitude:8+5*(1-Math.cos(i/12*Math.PI*4))/2,halfHeight:2.5}:{})};
 });
 const ramps=airborne?[]:rampSpots(curve).map(t=>{const p=curve.getPointAt(t),d=curve.getTangentAt(t);return {x:p.x,z:p.z,dx:d.x,dz:d.z,length:RAMP.length,height:RAMP.height,halfWidth:spec.width/2-RAMP.margin};});
 return {...spec,airborne,points,gates,ramps};
}
/** The road surface height: a kicker's slope where one lies under this point, else level tarmac. */
export function rampHeightAt(course,x,z) {
 let height=0;
 for(const ramp of course.ramps??[]) {
  const rx=x-ramp.x,rz=z-ramp.z,along=rx*ramp.dx+rz*ramp.dz+ramp.length/2,across=-rx*ramp.dz+rz*ramp.dx;
  if(along<0||along>ramp.length||Math.abs(across)>ramp.halfWidth)continue;
  height=Math.max(height,ramp.height*along/ramp.length);
 }
 return height;
}
export function onTrack(course,x,z,margin=0) {
 const radius=course.width/2-margin;if(radius<=0)return false;
 for(let i=1;i<course.points.length;i++){
  const a=course.points[i-1],b=course.points[i],dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
  if((x-a.x-t*dx)**2+(z-a.z-t*dz)**2<=radius*radius)return true;
 }
 return false;
}
