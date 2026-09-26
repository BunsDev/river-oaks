const smooth=t=>t*t*t*(t*(t*6-15)+10);
const closure=t=>t<=0||t>=.29?0:t<.085?smooth(t/.085):t<.13?1:1-smooth((t-.13)/.16);

// Shared timing for the skin, brows and lashes of one face. Cached geometry is
// immutable; each cloned Mesh owns its own morph influence array.
export function createFacialMotion(model,{seed='',reducedMotion=false}={}) {
 const bindings=[];model.traverse(mesh=>{
  const keys=mesh.morphTargetDictionary;
  if(keys?.eyeBlinkLeft!==undefined&&keys.eyeBlinkRight!==undefined)bindings.push({mesh,left:keys.eyeBlinkLeft,right:keys.eyeBlinkRight});
 });
 let randomState=2166136261;
 for(const char of String(seed))randomState=Math.imul(randomState^char.charCodeAt(0),16777619)>>>0;
 const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
 let time=0,nextAt=2+random()*3,started=-Infinity;
 const pose={left:0,right:0};
 return {
  get pose(){return {...pose};},
  update(delta) {
   if(reducedMotion||!bindings.length||!Number.isFinite(delta)||delta<=0||delta>.25)return pose;
   time+=Math.min(.08,delta);
   while(time>=nextAt){started=nextAt;nextAt+=.3+2.8+random()*3.5;}
   pose.left=closure(time-started);pose.right=closure(time-started-.008);
   for(const {mesh,left,right}of bindings){mesh.morphTargetInfluences[left]=pose.left;mesh.morphTargetInfluences[right]=pose.right;}
   return pose;
  },
 };
}
