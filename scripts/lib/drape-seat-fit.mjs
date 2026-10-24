import * as THREE from 'three';

// Fold the authored long surface over the lap, then enforce upper-thigh contact
// offline. Animation keeps its skin weights and only applies the baked targets.
export function prepareDrapeSeatFit(skirt, model, {layer = 0, waist = .11, body = model.getObjectByName('Jevica'), shape = null, lapClearance = .028} = {}) {
  const pelvis = model.getObjectByName('pelvis');
  model.updateWorldMatrix(true, true); model.updateMatrixWorld(true);
  const frame = new THREE.Matrix4().compose(pelvis.getWorldPosition(new THREE.Vector3()), model.getWorldQuaternion(new THREE.Quaternion()), model.getWorldScale(new THREE.Vector3()));
  const offset = pelvis.matrixWorld.clone().invert().multiply(frame), inverse = frame.clone().invert();
  const geometry = skirt.geometry;
  const authored = Array.from({length: geometry.attributes.position.count}, (_, i) => skirt.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(skirt.matrixWorld).applyMatrix4(inverse));
  const bodyRest = Array.from({length: body.geometry.attributes.position.count}, (_, i) => body.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(body.matrixWorld).applyMatrix4(inverse));
  const indices = [];
  const leg = i => {
    let sum = 0;
    for (let c = 0; c < 4; c++) if (/^(pelvis|thigh_[lr]|calf_[lr])$/.test(body.skeleton.bones[body.geometry.attributes.skinIndex.getComponent(i, c)].name)) sum += body.geometry.attributes.skinWeight.getComponent(i, c);
    return sum > .5;
  };
  for (let n = 0; n < body.geometry.index.count; n += 3) {
    const ids = [0, 1, 2].map(c => body.geometry.index.getX(n + c));
    if (ids.every(i => bodyRest[i].y < .02 && bodyRest[i].y > -.45 && leg(i))) indices.push(...ids);
  }
  return () => {
    model.updateWorldMatrix(true, true); model.updateMatrixWorld(true);
    const current = pelvis.matrixWorld.clone().multiply(offset), up = new THREE.Vector3(0, 1, 0).transformDirection(current);
    const colliderGeometry = new THREE.BufferGeometry();
    colliderGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bodyRest.flatMap((_, i) => body.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(body.matrixWorld).toArray()), 3));
    colliderGeometry.setIndex(indices);
    const collider = new THREE.Mesh(colliderGeometry, new THREE.MeshBasicMaterial({side: THREE.DoubleSide})); collider.updateMatrixWorld(true);
    const boneTransforms = skirt.skeleton.bones.map((bone, i) => bone.matrixWorld.clone().multiply(skirt.skeleton.boneInverses[i]));
    const transforms = [], posed = [], ray = new THREE.Raycaster(), down = up.clone().negate();
    try {
      for (let i = 0; i < authored.length; i++) {
        const p = authored[i], depth = Math.max(0,.11-p.y), lap = Math.min(depth,.45);
        const front = THREE.MathUtils.smoothstep(p.z,-.055,.075);
        const waistBlend = THREE.MathUtils.smoothstep(Math.max(0, waist-p.y),0,.05);
        const folded = new THREE.Vector3(p.x,.11+.045*Math.sin(lap/.45*Math.PI)-Math.max(0,depth-.45),p.z+lap*.85);
        const rear = new THREE.Vector3(p.x,Math.max(p.y,-.48),p.z);
        const desired = shape ? shape(p,waist) : p.clone().lerp(rear.lerp(folded,front),waistBlend);
        // Keep the transparent overlay above the opaque lap and outside its
        // knee fold without shifting the pinned waist or standing surface.
        const separation = layer * .008 * front * waistBlend;
        desired.y += separation; desired.z += separation * THREE.MathUtils.smoothstep(depth,.35,.5);
        desired.applyMatrix4(current);
        posed.push(desired);
        const blend = new THREE.Matrix4(); blend.elements.fill(0);
        for (let c = 0; c < 4; c++) {
          const weight = geometry.attributes.skinWeight.getComponent(i, c), matrix = boneTransforms[geometry.attributes.skinIndex.getComponent(i, c)];
          for (let e = 0; e < 16; e++) blend.elements[e] += weight * matrix.elements[e];
        }
        transforms.push(skirt.matrixWorld.clone().multiply(skirt.bindMatrixInverse).multiply(blend).multiply(skirt.bindMatrix).invert());
      }
      // Front-facing cloth stays above the lap; back drape stays under it.
      let corrected = 0;
      for (let iteration = 0; iteration < 8; iteration++) for (let n = 0; n < geometry.index.count; n += 3) {
        const ids = [0, 1, 2].map(c => geometry.index.getX(n + c));
        if (!ids.every(i => authored[i].z > .03)) continue;
        for (const bary of [[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]]) {
          const point = new THREE.Vector3(); ids.forEach((id,j) => point.addScaledVector(posed[id], bary[j]));
          ray.set(point.clone().addScaledVector(up,.6),down);ray.far=1.2;
          const hit = ray.intersectObject(collider,false)[0]; if (!hit) continue;
          const clearance = point.clone().sub(hit.point).dot(up); if (clearance >= lapClearance) continue;
          const movable = ids.map(i => authored[i].y < waist - 1e-5), denominator = bary.reduce((sum,w,j) => sum + (movable[j] ? w*w : 0), 0);
          if (!denominator) continue;
          ids.forEach((id,j) => {if (movable[j]) posed[id].addScaledVector(up,bary[j]*(lapClearance-clearance)/denominator);});corrected++;
        }
      }
      let maximumStretch=0,minimumAreaRatio=Infinity;
      const restWorld=authored.map(p=>p.clone().applyMatrix4(frame));
      const area=(vertices,ids)=>vertices[ids[1]].clone().sub(vertices[ids[0]]).cross(vertices[ids[2]].clone().sub(vertices[ids[0]])).length();
      for(let n=0;n<geometry.index.count;n+=3){
        const ids=[0,1,2].map(c=>geometry.index.getX(n+c));
        minimumAreaRatio=Math.min(minimumAreaRatio,area(posed,ids)/area(restWorld,ids));
        for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3];maximumStretch=Math.max(maximumStretch,posed[a].distanceTo(posed[b])/restWorld[a].distanceTo(restWorld[b]));}
      }
      if(!Number.isFinite(maximumStretch)||minimumAreaRatio<1e-6)throw new Error('Degenerate drape bake');
      const failures=[];
      for(let n=0;n<geometry.index.count;n+=3){
        const ids=[0,1,2].map(c=>geometry.index.getX(n+c));if(!ids.every(i=>authored[i].z>.03))continue;
        for(const bary of [[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]]){
          const point=new THREE.Vector3();ids.forEach((id,j)=>point.addScaledVector(posed[id],bary[j]));ray.set(point.clone().addScaledVector(up,.6),down);ray.far=1.2;
          const hit=ray.intersectObject(collider,false)[0];if(hit&&point.clone().sub(hit.point).dot(up)<-.001&&failures.length<4)failures.push({ids,rest:ids.map(i=>authored[i].toArray()),clearance:point.clone().sub(hit.point).dot(up)});
        }
      }
      for (let i = 0; i < posed.length; i++) {
        const p = posed[i].clone().applyMatrix4(transforms[i]); geometry.attributes.position.setXYZ(i,p.x,p.y,p.z);
      }
      geometry.computeVertexNormals();
      const maxReconstruction=Math.max(...posed.map((p,i)=>skirt.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(skirt.matrixWorld).distanceTo(p)));
      return {failures,maxReconstruction,maximumStretch,minimumAreaRatio,corrected, vertices: posed.length, scope: 'Offline front-lap fit; rendered layers, other poses and continuous motion require separate evidence.'};
    } finally { colliderGeometry.dispose(); collider.material.dispose(); }
  };
}
