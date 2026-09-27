import * as THREE from 'three';
const Y=new THREE.Vector3(0,1,0),wrap=n=>((n%1)+1)%1;
const smooth=n=>n*n*(3-2*n);

// Four-beat walk with world-space planted hooves. Each animal owns its phase,
// anchors and skeleton; geometry and textures can remain shared.
export function createUnicornGait(rig,{groundAt,phaseOffset=0}) {
  rig.updateMatrixWorld(true);
  const size=rig.getWorldScale(new THREE.Vector3()).y;
  const rest=new Map();rig.traverse(b=>{if(b.isBone)rest.set(b,{position:b.position.clone(),quaternion:b.quaternion.clone()});});
  const roots=[...rest.keys()].filter(b=>!b.parent.isBone);
  const body=rig.getObjectByName('Body'),head=rig.getObjectByName('Head'),neck=rig.getObjectByName('Neck'),tail=rig.getObjectByName('Tail');
  const skins=[];rig.traverse(o=>{if(o.isSkinnedMesh)skins.push(o);});
  const legs=[];
  for(const prefix of ['Front','Hind'])for(const side of ['L','R']){
    const upper=rig.getObjectByName(`${prefix}Upper${side}`),lower=rig.getObjectByName(`${prefix}Lower${side}`),foot=rig.getObjectByName(`${prefix}Hoof${side}`);
    const hip=upper.getWorldPosition(new THREE.Vector3()),knee=lower.getWorldPosition(new THREE.Vector3()),end=foot.getWorldPosition(new THREE.Vector3());
    const axis=end.clone().sub(hip).normalize(),pole=knee.clone().sub(hip);pole.addScaledVector(axis,-pole.dot(axis)).normalize();
    // The almost-straight source foreleg contains a tiny lateral offset;
    // deriving its bend pole from that offset magnifies it into splayed knees.
    if(prefix==='Front')pole.set(0,0,1).transformDirection(rig.matrixWorld);
    const neutral=rig.worldToLocal(new THREE.Vector3(end.x,end.y,hip.z)),sourceSide=hip.x<0?-1:1;
    const phase=prefix==='Front'?(sourceSide<0?0:.5):(sourceSide<0?.75:.25);
    const samples=[];let min=Infinity;
    for(const skin of skins){const index=skin.skeleton.bones.indexOf(lower);if(index<0)continue;skin.skeleton.update();
      const {position,skinIndex,skinWeight}=skin.geometry.attributes;
      for(let i=0;i<position.count;i++){
        let w=0;for(let j=0;j<4;j++)if(skinIndex.getComponent(i,j)===index)w+=skinWeight.getComponent(i,j);
        if(w<.5)continue;const p=skin.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(skin.matrixWorld);
        if(p.y>end.y+.12*size)continue;samples.push({skin,index:i});min=Math.min(min,p.y);
      }
    }
    legs.push({upper,lower,foot,neutral,phase,trotPhase:prefix==='Front'?phase:(sourceSide<0?.5:0),a:hip.distanceTo(knee),b:knee.distanceTo(end),pole:pole.transformDirection(rig.matrixWorld.clone().invert()),soleOffset:end.y-min,samples,anchor:null,liftOff:null,landing:null,swing:false,clearance:0});
  }
  let lastDistance=null,lastOrigin=null,phase=phaseOffset,weight=0,elapsed=0,lastSign=0,settlingHeight=0,recovery=0;
  const point=new THREE.Vector3(),q=new THREE.Quaternion(),parentQ=new THREE.Quaternion();
  function aim(bone,child,target){
    const p=bone.getWorldPosition(new THREE.Vector3()),from=child.getWorldPosition(new THREE.Vector3()).sub(p).normalize(),to=target.clone().sub(p).normalize();
    q.setFromUnitVectors(from,to).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
    bone.parent.getWorldQuaternion(parentQ).invert();bone.quaternion.copy(parentQ.multiply(q));rig.updateMatrixWorld(true);
  }
  function solve(leg,target){
    const hip=leg.upper.getWorldPosition(new THREE.Vector3()),axis=target.clone().sub(hip),d=THREE.MathUtils.clamp(axis.length(),Math.abs(leg.a-leg.b)+.00001,leg.a+leg.b-.00001);axis.normalize();
    const pole=leg.pole.clone().transformDirection(rig.matrixWorld);pole.addScaledVector(axis,-pole.dot(axis)).normalize();
    const along=(leg.a**2-leg.b**2+d*d)/(2*d),height=Math.sqrt(Math.max(0,leg.a**2-along**2));
    const knee=hip.clone().addScaledVector(axis,along).addScaledVector(pole,height);
    aim(leg.upper,leg.lower,knee);aim(leg.lower,leg.foot,target);
  }
  return {
    legs,
    reset(){lastDistance=null;lastOrigin=null;phase=phaseOffset;weight=0;elapsed=0;lastSign=0;settlingHeight=0;recovery=0;for(const leg of legs){leg.anchor=null;leg.swing=false;leg.settle=null;leg.lastNeutral=null;leg.lastWindow=false;leg.swingProgress=0;}},
    update(delta,speed,distance){
      delta=Math.max(0,Math.min(.08,delta));elapsed+=delta;
      const origin=rig.getWorldPosition(new THREE.Vector3()),teleported=lastOrigin!==null&&origin.distanceTo(lastOrigin)>2;lastOrigin=origin;
      const travelled=lastDistance===null||teleported?0:distance-lastDistance;lastDistance=distance;
      if(teleported)phase=phaseOffset;
      const sign=Math.abs(speed)>.01?Math.sign(speed):lastSign,reversing=lastSign!==0&&sign!==lastSign;lastSign=sign;recovery=reversing?.8:Math.max(0,recovery-delta);
      const target=THREE.MathUtils.smoothstep(Math.abs(speed),.02,.65);weight+=(target-weight)*(1-Math.exp(-7*delta));
      const trot=THREE.MathUtils.smoothstep(Math.abs(speed),1.7,2.8),stride=(1.2+1.2*trot)*size,duty=.64-.32*trot,reach=stride*duty/2;
      phase+=Math.abs(travelled)/stride;
      for(const [bone,pose]of rest){bone.position.copy(pose.position);bone.quaternion.copy(pose.quaternion);}
      const worldScale=body.parent.getWorldScale(new THREE.Vector3()).y;
      const bob=(-.018+Math.sin(phase*Math.PI*4)*.008*weight+Math.sin(elapsed*1.6+phaseOffset)*.002)*size/worldScale;
      for(const root of roots)root.position.addScaledVector(Y.clone().transformDirection(root.parent.matrixWorld.clone().invert()),bob);
      neck.rotateX(-.12+Math.sin(phase*Math.PI*2)*.018*weight+Math.sin(elapsed*.7+phaseOffset)*.006);
      head.rotateX(.075-Math.sin(phase*Math.PI*2+.3)*.02*weight);
      tail.rotateZ(Math.sin(elapsed*1.5+phaseOffset)*.045+Math.sin(phase*Math.PI*2)*.025*weight);
      rig.updateMatrixWorld(true);
      // Let the body settle over supporting legs during braking/reversal rather
      // than stretching a planted leg past its anatomical reach.
      let required=0;
      for(const leg of legs)if(leg.anchor&&(!leg.swing||leg.swingProgress>.8||leg.settle?.time>.8)){
        const contact=leg.swing?leg.landing:leg.anchor,hip=leg.upper.getWorldPosition(new THREE.Vector3()),horizontal=Math.hypot(hip.x-contact.x,hip.z-contact.z),length=leg.a+leg.b-.025*size;
        required=Math.max(required,hip.y-contact.y-Math.sqrt(Math.max(0,length*length-horizontal*horizontal)));
      }
      settlingHeight=Math.min(.12*size,Math.max(required,settlingHeight*Math.exp(-5*delta)));
      if(settlingHeight>0){for(const root of roots)root.position.addScaledVector(Y.clone().transformDirection(root.parent.matrixWorld.clone().invert()),-settlingHeight/worldScale);rig.updateMatrixWorld(true);}
      const facing=new THREE.Vector3(0,0,1).transformDirection(rig.matrixWorld).multiplyScalar(Math.sign(speed)||1);
      for(const leg of legs){
        const neutral=rig.localToWorld(leg.neutral.clone());neutral.y=groundAt(neutral.x,neutral.z)+leg.soleOffset;
        const forward=leg.lastNeutral?neutral.clone().sub(leg.lastNeutral).setY(0):facing.clone();if(forward.lengthSq()<1e-9)forward.copy(leg.travelDirection??facing);else forward.normalize();leg.lastNeutral=neutral.clone();leg.travelDirection=forward.clone();
        const cycle=wrap(phase+THREE.MathUtils.lerp(leg.phase,leg.trotPhase,trot));
        const window=cycle>=duty&&weight>.06;
        if(!leg.anchor||teleported){leg.anchor=neutral.clone();leg.swing=false;leg.settle=null;leg.lastWindow=false;leg.swingProgress=0;}
        const offset=leg.anchor.clone().sub(neutral).setY(0);
        // Start each flight at its planted contact. A reach limit also schedules
        // an early step on tight turns, before a planted leg can overextend.
        if(reversing&&leg.swing){leg.landing=leg.lastFoot.clone();leg.landing.y=groundAt(leg.landing.x,leg.landing.z)+leg.soleOffset;leg.settle={from:leg.lastFoot.clone(),time:0};}
        const requested=weight>.06&&!leg.swing&&((window&&!leg.lastWindow)||offset.dot(forward)<-.34*size||(offset.length()>.44*size&&offset.dot(forward)<.1));
        const supported=Math.abs(speed)>=1.7||legs.filter(other=>other.swing).length<2;
        const start=requested&&supported;leg.lastWindow=window&&(!requested||supported);
        if(start){leg.liftOff=leg.anchor.clone();leg.landing=neutral.clone().addScaledVector(forward,reach);leg.swingProgress=0;}
        let swing=leg.swing||start,target;
        if(leg.swing&&weight<=.06&&!leg.settle)leg.settle={from:leg.lastFoot.clone(),time:0};
        if(leg.settle){
          leg.settle.time=Math.min(1,leg.settle.time+delta/.24);
          target=leg.settle.from.clone().lerp(leg.landing,smooth(leg.settle.time));swing=leg.settle.time<1;
          if(!swing){leg.anchor.copy(leg.landing);leg.settle=null;}
        }else if(swing){
          if(!start)leg.swingProgress=Math.min(1,leg.swingProgress+Math.max(Math.abs(travelled)/stride/(1-duty),recovery>0?delta/.24:0));
          const t=leg.swingProgress,u=smooth(t);
          // Landing prediction follows a turn during flight; planted hooves stay put.
          leg.landing.copy(neutral).addScaledVector(forward,reach);leg.landing.y=groundAt(leg.landing.x,leg.landing.z)+leg.soleOffset;
          target=leg.liftOff.clone().lerp(leg.landing,u);target.y+=Math.sin(t*Math.PI)**2*(.105+.025*Math.min(Math.abs(speed),3))*size;
          if(t===1){leg.anchor.copy(leg.landing);swing=false;}
        }else{
          target=leg.anchor.clone();target.y=groundAt(target.x,target.z)+leg.soleOffset;
        }
        leg.swing=swing;solve(leg,target);
        // Fit the actual deformed sole, including toe rotation from the IK solve.
        for(let correction=0;correction<12;correction++){
          for(const skin of skins)skin.skeleton.update();let gap=Infinity;
          for(const sample of leg.samples){sample.skin.getVertexPosition(sample.index,point).applyMatrix4(sample.skin.matrixWorld);gap=Math.min(gap,point.y-groundAt(point.x,point.z));}
          leg.clearance=gap;if(gap>=-.0005)break;target.y-=gap;solve(leg,target);
        }
        leg.lastFoot=leg.foot.getWorldPosition(new THREE.Vector3());
      }
      rig.updateMatrixWorld(true);
    },
    get weight(){return weight;},
    inspect(){return legs.map(l=>({swing:l.swing,clearance:l.clearance,foot:l.foot.getWorldPosition(new THREE.Vector3()).toArray(),anchor:l.anchor?.toArray()}));},
  };
}
