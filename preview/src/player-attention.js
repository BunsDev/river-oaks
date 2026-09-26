import {personPosition,personEyeHeight} from './person-position.js';

const finitePoint=point=>Array.isArray(point)&&point.length===3&&point.every(Number.isFinite);

// Attention turns the rendered standing body, never the walking camera or seat.
export function createPlayerAttention() {
 let velocity=0,pose={mode:'none',target:null,facing:null};
 return {
  get pose(){return {...pose,target:pose.target?.slice()??null};},
  update(delta,{position,heading,speed=0,flying=false,riding=false,conversation=null,spell=null}) {
   let target=null,mode='none';
   if(finitePoint(spell)){target=spell.slice();mode='spell';}
   else if(conversation&&!conversation.abducted&&finitePoint(conversation.position)){
    const point=personPosition(conversation);target=[point[0],point[2]+personEyeHeight(conversation),-point[1]];
    if(finitePoint(target))mode='conversation';else target=null;
   }
   pose={mode,target,facing:null};
   if(mode==='spell'||speed>.05||riding||flying||!finitePoint(position)||!Number.isFinite(heading)){velocity=0;return pose;}
   if(mode==='none'&&Math.abs(velocity)<1e-6){velocity=0;return pose;}
   pose.facing=heading;
   if(!Number.isFinite(delta)||delta<=0||delta>.25)return pose;
   const dt=Math.min(delta,.08);
   if(mode==='none'){const decay=Math.exp(-8*dt);pose.facing=heading+velocity*(1-decay)/8;velocity*=decay;return pose;}
   const dx=target[0]-position[0],dz=target[2]-position[2];
   if(Math.hypot(dx,dz)<.25){velocity=0;return pose;}
   const difference=Math.atan2(Math.sin(Math.atan2(dx,dz)-heading),Math.cos(Math.atan2(dx,dz)-heading));
   const desired=Math.max(-1.4,Math.min(1.4,difference*3));
   velocity+=(desired-velocity)*(1-Math.exp(-8*dt));
   const step=velocity*dt;
   if(Math.sign(step)===Math.sign(difference)&&Math.abs(step)>Math.abs(difference)){pose.facing=heading+difference;velocity=0;}
   else pose.facing=heading+step;
   return pose;
  },
 };
}
