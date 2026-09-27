// @ts-check
import { STREET } from './street-profile.js';
import { drivingInput, chauffeurCommand } from './vehicle-config.js';
/** @typedef {[number,number]} Point */
/** @typedef {{position:number[],yaw:number,speed:number}} Pose */
/** Build a scenic drive along an existing mapped lane; never invent a cross-lot shortcut.
 * @param {{roads?:{kind?:string,points:number[][]}[]}} world @param {Pose} pose @returns {Point[]}
 */
export function scenicRoute(world,pose) {
 /** @type {{score:number,points:Point[]}|null} */ let best=null;
 for(const road of world.roads??[]) {
  if(['footway','pedestrian','path','steps'].includes(road.kind??''))continue;
  const points=road.points.map(p=>/** @type {Point} */([p[0],-p[1]]));
  for(let i=1;i<points.length;i++) {
   const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.1)continue;
   const t=Math.max(0,Math.min(1,((pose.position[0]-a[0])*dx+(pose.position[2]-a[1])*dz)/length**2));
   const center=/** @type {Point} */([a[0]+dx*t,a[1]+dz*t]);
   const alignment=(-Math.cos(pose.yaw)*dx+Math.sin(pose.yaw)*dz)/length;
   const tail=alignment>=0?points.slice(i):points.slice(0,i).reverse();
   const gap=Math.hypot(center[0]-pose.position[0],center[1]-pose.position[2]);
   if(gap>5||Math.abs(alignment)<.55||!tail.length)continue;
   const remaining=Math.hypot(tail[0][0]-center[0],tail[0][1]-center[1]);if(remaining<6)continue;
   const score=gap+(1-Math.abs(alignment))*8;
   if(!best||score<best.score){
    const lane=Math.max(0,(road.width_m??8.4)/2-STREET.gutterWidth)/2,path=[center,...tail];
    const shifted=path.map((p,j)=>{const a=path[Math.max(0,j-1)],b=path[Math.min(path.length-1,j+1)],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz)||1;return [p[0]-dz/length*lane,p[1]+dx/length*lane];});
    best={score,points:shifted};
   }
  }
 }
 if(!best)return [];
 const dense=/** @type {Point[]} */([]);
 for(let i=1;i<best.points.length;i++) {
  const a=best.points[i-1],b=best.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.ceil(length/3);
  for(let n=1;n<=steps;n++)dense.push([a[0]+(b[0]-a[0])*n/steps,a[1]+(b[1]-a[1])*n/steps]);
 }
 return dense;
}
export function createChauffeur({fetcher=(...args)=>fetch(...args),clock=()=>performance.now()}={}) {
 let route=[],index=0,active=false,label='Jev is ready',generation=0,tick=0,pending=null,nextPoll=0,leaseUntil=0,action=null,stalled=0,source=null;
 const cancel=()=>{generation++;pending?.abort();pending=null;leaseUntil=0;action=null;source=null;};
 const poll=(pose,error,remaining,roadClear)=>{
  const now=clock();if(pending||now<nextPoll)return;
  const controller=new AbortController();pending=controller;nextPoll=now+1500;
  const request={schema_version:1,tick:++tick,generation,vehicle:pose.vehicle??'rolls',speed:Math.min(20,Math.abs(pose.speed)),remaining_m:Math.min(100000,remaining),turn_radians:error,road_clear:roadClear,
   candidates:['cruise','slow','yield','stop'].map(action=>({id:action,action,label:action}))};
  const timer=setTimeout(()=>controller.abort(),1800);
  const timeout=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('Aborted')),{once:true}));
  Promise.race([fetcher('/v1/chauffeur',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('Unavailable');return r.json();}),timeout]).then(answer=>{
   if(!active||generation!==request.generation||controller.signal.aborted)return;
   const thresholds={cruise:.6,slow:.5,yield:.4,stop:.4};
   const valid=answer.schema_version===1&&answer.tick===request.tick&&answer.generation===request.generation&&answer.source==='jev'&&Object.hasOwn(thresholds,answer.candidate_id)&&Number.isFinite(answer.confidence)&&answer.confidence>=thresholds[answer.candidate_id]&&answer.confidence<=1;
   if(!valid){leaseUntil=0;action=null;source=null;label=answer.reason==='not_configured'?'Add your Jev API key in Settings':'Jev unavailable · holding';return;}
   action=answer.candidate_id;source='jev';leaseUntil=clock()+2800;label=action==='cruise'?'Jev smart driving':action==='slow'?'Jev is slowing down':action==='yield'?'Jev is yielding':'Jev has stopped';
  }).catch(()=>{if(generation===request.generation){leaseUntil=0;action=null;source=null;label='Jev unavailable · holding';}}).finally(()=>{clearTimeout(timer);if(pending===controller)pending=null;});
 };
 return {
  get status(){return {active,label,source,remaining:Math.max(0,route.length-index)};},
  request(command,points=[]) {
   const mode=chauffeurCommand(command);if(!mode)return false;
   if(mode==='stop'){cancel();active=false;route=[];label='Jev is ready';return true;}
   if(points.length<2||points.some(p=>p.length!==2||!p.every(Number.isFinite)))return false;
   cancel();route=points.map(p=>[...p]);index=0;stalled=0;active=true;nextPoll=0;label='Connecting to Jev…';return true;
  },
  input(pose,manual,dt,{roadClear=true}={}) {
   const controls=drivingInput(manual);
   if(controls.forward||controls.turn||controls.strafe){if(active)cancel();active=false;label='Manual directions';return controls;}
   if(!active)return controls;
   while(index<route.length-1&&Math.hypot(route[index][0]-pose.position[0],route[index][1]-pose.position[2])<4)index++;
   const target=route[index],dx=target[0]-pose.position[0],dz=target[1]-pose.position[2],gap=Math.hypot(dx,dz);
   if(index===route.length-1&&gap<2){cancel();active=false;label='Scenic drive complete';return controls;}
   const angle=Math.atan2(dz,-dx)-pose.yaw,error=Math.atan2(Math.sin(angle),Math.cos(angle));
   if(Math.abs(error)>Math.PI*.65){cancel();active=false;label='Jev needs room to turn';return controls;}
   let remaining=gap;for(let i=index+1;i<route.length;i++)remaining+=Math.hypot(route[i][0]-route[i-1][0],route[i][1]-route[i-1][1]);
   poll(pose,error,remaining,roadClear);
   if(!roadClear){label='Jev is waiting for a clear road';return controls;}
   if(clock()>=leaseUntil||!['cruise','slow'].includes(action))return controls;
   stalled=Math.abs(pose.speed)<.03?stalled+Math.max(0,Math.min(.08,dt)):0;
   if(stalled>2){cancel();active=false;label='Jev is waiting for a clear road';return controls;}
   return drivingInput({forward:Math.min(action==='slow'?.22:.55,Math.max(.18,Math.cos(error)*.55),gap/8),turn:error*2.4,strafe:0});
  },
  dispose(){cancel();active=false;},
 };
}
