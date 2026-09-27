import * as THREE from 'three';

const ease=value=>{const t=THREE.MathUtils.clamp(value,0,1);return t*t*(3-2*t);};

// Rock around the heel at landing and the ball of the foot at push-off. The
// toe joint counter-rotates during heel lift, so the forefoot can stay planted.
export function createFootRoll(foot,ball,sole,toeWeights) {
  if(!ball||!sole.length)return null;
  const inverse=foot.getWorldQuaternion(new THREE.Quaternion()).invert();
  const axis=new THREE.Vector3(1,0,0).applyQuaternion(inverse),forward=new THREE.Vector3(0,0,1).applyQuaternion(inverse);
  const ballAxis=new THREE.Vector3(1,0,0).applyQuaternion(ball.getWorldQuaternion(new THREE.Quaternion()).invert());
  const ballPosition=foot.worldToLocal(ball.getWorldPosition(new THREE.Vector3())),ballRest=ball.quaternion.clone();
  const up=new THREE.Vector3(0,1,0).applyQuaternion(inverse);
  const heel=sole.reduce((best,p,i)=>p.dot(forward)<sole[best].dot(forward)?i:best,0);
  const horizontalDistance=p=>{const d=p.clone().sub(ballPosition);return d.lengthSq()-d.dot(up)**2;};
  const toe=sole.reduce((best,p,i)=>horizontalDistance(p)<horizontalDistance(sole[best])?i:best,0);
  const points=sole.map(p=>p.clone()),toeRotation=new THREE.Quaternion(),rotation=new THREE.Quaternion(),offset=new THREE.Vector3();
  let angle=0,support=null,lastTarget=null,currentSwing=null,swingOffset=null,swingStart=0;
  return {
    points,
    landing(target,orientation,scale,speed) {
      const pitch=-.20*THREE.MathUtils.clamp(speed/.65,0,1);
      const rolled=orientation.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis,pitch));
      const ankle=target.clone().add(sole[heel].clone().multiply(scale).applyQuaternion(orientation));
      ankle.sub(sole[heel].clone().multiply(scale).applyQuaternion(rolled));
      return {target:ankle,orientation:rolled};
    },
    reset() {angle=0;support=null;lastTarget=null;currentSwing=null;swingOffset=null;},
    commit(target,orientation,scale,pivotId,contact) {
      lastTarget=target.clone();
      support=contact?{id:pivotId,position:points[pivotId].clone().multiply(scale).applyQuaternion(orientation).add(target)}:null;
    },
    update({target,orientation,lead,swing,speed,delta,scale}) {
      const strength=THREE.MathUtils.clamp(speed/.65,0,1);
      const desired=swing?(swing.settling?0:.30*(1-ease(swing.progress/.4))-.20*ease((swing.progress-.65)/.35))
        :.30*ease((-lead-.08)/.17)-.20*ease((lead-.08)/.17);
      angle+=(desired*strength-angle)*(1-Math.exp(-25*delta));
      const flex=Math.max(0,angle);
      toeRotation.setFromAxisAngle(axis,-flex);
      for(let i=0;i<points.length;i++)points[i].copy(sole[i]).sub(ballPosition).applyQuaternion(toeRotation).add(ballPosition).lerp(sole[i],1-toeWeights[i]);
      const rolled=orientation.clone().multiply(rotation.setFromAxisAngle(axis,angle));
      const pivot=angle<0?heel:toe;
      const ankle=target.clone().add(offset.copy(sole[pivot]).multiply(scale).applyQuaternion(orientation));
      ankle.sub(offset.copy(points[pivot]).multiply(scale).applyQuaternion(rolled));
      if(swing) {
        if(currentSwing!==swing) {
          currentSwing=swing;swingStart=swing.progress;
          swingOffset=lastTarget?.clone().sub(ankle)??new THREE.Vector3();
        }
        ankle.addScaledVector(swingOffset,1-ease((swing.progress-swingStart)/Math.max(1e-6,1-swingStart)));
      } else {
        currentSwing=null;swingOffset=null;
        // Preserve the previous actual ground contact while the shoe rotates.
        // The terrain fit picks the next supporting vertex after this update.
        if(support)ankle.copy(support.position).sub(offset.copy(points[support.id]).multiply(scale).applyQuaternion(rolled));
      }
      return {target:ankle,orientation:rolled,pivot:points[pivot],pivotId:pivot,angle,flex};
    },
    applyToes(flex) {ball.quaternion.copy(ballRest).multiply(toeRotation.setFromAxisAngle(ballAxis,-flex));ball.updateWorldMatrix(false,true);},
  };
}
