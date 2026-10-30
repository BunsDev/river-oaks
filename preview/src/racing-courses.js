import {CatmullRomCurve3,Vector3} from 'three';
export const RACING_COURSES=[
 {id:'garden-sweep',name:'Garden Sweep',description:'Wide flowing bends. Build speed, settle the steering, and hold a clean arc.',width:12,nodes:[[0,0],[-35,0],[-60,25],[-35,55],[10,60],[40,35],[35,0]]},
 {id:'rose-slalom',name:'Rose Slalom',description:'Linked S bends. Change lean smoothly and look one gate ahead.',width:10,nodes:[[0,0],[-25,-12],[-50,9],[-75,-12],[-100,8],[-115,40],[-75,65],[-25,60],[15,35]]},
 {id:'crown-hairpins',name:'Crown Hairpins',description:'Two tight switchbacks. Brake early, rotate, then accelerate out.',width:10,nodes:[[0,0],[-40,0],[-65,15],[-40,30],[0,30],[25,45],[0,60],[-60,60],[-85,40],[-95,-20],[-45,-35],[20,-25]]},
];
export function createCourse(id,{airborne=false}={}) {
 const spec=RACING_COURSES.find(course=>course.id===id);
 if(!spec)throw new Error('Unknown course');
 const curve=new CatmullRomCurve3(spec.nodes.map(([x,z])=>new Vector3(x,0,z)),true,'centripetal');
 const points=curve.getSpacedPoints(240),gates=Array.from({length:12},(_,i)=>{
  const p=curve.getPointAt(i/12),d=curve.getTangentAt(i/12);
  return {x:p.x,z:p.z,dx:d.x,dz:d.z,halfWidth:spec.width/2,...(airborne?{altitude:8+5*(1-Math.cos(i/12*Math.PI*4))/2,halfHeight:2.5}:{})};
 });
 return {...spec,airborne,points,gates};
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
