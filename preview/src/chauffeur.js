import policy from '../../src/river_oaks/chauffeur-policy.json' with { type: 'json' };
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
 let route=[],index=0,active=false,label='Jev is ready',generation=0,tick=0,pending=null,nextPoll=0,leaseUntil=0,action=null,stalled=0,source=null,paused=false;
 const cancel=()=>{generation++;pending?.abort();pending=null;leaseUntil=0;action=null;source=null;};
 const poll=(pose,error,remaining,roadClear,rearClear,recovery)=>{
  const now=clock();if(pending||now<nextPoll)return;
  const controller=new AbortController();pending=controller;nextPoll=now+1500;
  const request={schema_version:1,tick:++tick,generation,vehicle:pose.vehicle??'rolls',speed:Math.min(20,Math.abs(pose.speed)),remaining_m:Math.min(100000,remaining),turn_radians:error,road_clear:roadClear,rear_clear:rearClear,recovery,
   candidates:Object.keys(policy.thresholds).map(action=>({id:action,action,label:action}))};
  const timer=setTimeout(()=>controller.abort(),2800);
  const timeout=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('Aborted')),{once:true}));
  Promise.race([fetcher('/v1/chauffeur',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('Unavailable');return r.json();}),timeout]).then(answer=>{
   if(!active||generation!==request.generation||controller.signal.aborted)return;
   const thresholds=policy.thresholds;
   const valid=answer.schema_version===1&&answer.tick===request.tick&&answer.generation===request.generation&&answer.source==='jev'&&Object.hasOwn(thresholds,answer.candidate_id)&&Number.isFinite(answer.confidence)&&answer.confidence>=thresholds[answer.candidate_id]&&answer.confidence<=1;
   if(!valid){leaseUntil=0;action=null;source=null;label=answer.reason==='not_configured'?(import.meta.env?.DEV?'Add your Jev API key in Settings':'Jev smart driving is not configured on the server'):'Jev unavailable · holding';return;}
   action=answer.candidate_id;source='jev';leaseUntil=clock()+2800;label=({cruise:'Jev smart driving',accelerate:'Jev is accelerating',slow:'Jev is slowing down',turn_left:'Jev is steering left',turn_right:'Jev is steering right',brake:'Jev is braking',reverse:'Jev is reversing carefully',yield:'Jev is yielding',stop:'Jev has stopped',park:'Jev is parking'})[action];
  }).catch(()=>{if(generation===request.generation){leaseUntil=0;action=null;source=null;label='Jev unavailable · holding';}}).finally(()=>{clearTimeout(timer);if(pending===controller)pending=null;});
 };
 return {
  get status(){return {active,paused,label,source,remaining:Math.max(0,route.length-index)};},
  request(command,points=[]) {
   const mode=chauffeurCommand(command);if(!mode)return false;
   if(mode==='stop'){cancel();active=false;paused=false;route=[];label='Jev is ready';return true;}
   if(mode==='pause'){if(!active)return false;cancel();active=false;paused=true;label='Ride paused';return true;}
   if(mode==='resume'){if(!paused||!route.length)return false;cancel();active=true;paused=false;nextPoll=0;label='Connecting to Jev…';return true;}
   if(points.length<2||points.some(p=>p.length!==2||!p.every(Number.isFinite)))return false;
   cancel();route=points.map(p=>[...p]);index=0;stalled=0;active=true;paused=false;nextPoll=0;label='Connecting to Jev…';return true;
  },
  input(pose,manual,dt,{roadClear=true,rearClear=false}={}) {
   const controls=drivingInput(manual);
   if(controls.forward||controls.turn||controls.strafe||controls.brake){if(active)cancel();active=false;paused=false;route=[];label='Manual directions';return controls;}
   if(!active)return controls;
   while(index<route.length-1&&Math.hypot(route[index][0]-pose.position[0],route[index][1]-pose.position[2])<4)index++;
   const target=route[index],dx=target[0]-pose.position[0],dz=target[1]-pose.position[2],gap=Math.hypot(dx,dz);
      const angle=Math.atan2(dz,-dx)-pose.yaw,error=Math.atan2(Math.sin(angle),Math.cos(angle));
   if(Math.abs(pose.speed)>.03)stalled=0;
   const recovery=Math.abs(error)>Math.PI*.65||stalled>2;
   let remaining=gap;for(let i=index+1;i<route.length;i++)remaining+=Math.hypot(route[i][0]-route[i-1][0],route[i][1]-route[i-1][1]);
   poll(pose,error,remaining,roadClear,rearClear,recovery);
   if(clock()>=leaseUntil)return controls;
   if(action==='park'&&remaining<2){cancel();active=false;route=[];label='Jev has parked';return drivingInput({brake:true});}
   if(action==='reverse')return rearClear&&recovery?drivingInput({forward:-.35,turn:-error*1.5}):controls;
   if(!roadClear){label='Jev is waiting for a clear road';return controls;}
   if(remaining<2||!['cruise','accelerate','slow','turn_left','turn_right'].includes(action)||recovery)return controls;
   if(action==='turn_left'&&error<.12||action==='turn_right'&&error>-.12)return controls;
   stalled=Math.abs(pose.speed)<.03?stalled+Math.max(0,Math.min(.08,dt)):0;
   const throttle=action==='accelerate'?.75:action==='slow'||action.startsWith('turn_')?.25:.55;
   return drivingInput({forward:Math.min(throttle,Math.max(.12,Math.cos(error)*throttle),gap/8),turn:action==='turn_left'?Math.max(.15,error*2.4):action==='turn_right'?Math.min(-.15,error*2.4):error*2.4,strafe:0});
  },
  dispose(){cancel();active=false;},
 };
}
