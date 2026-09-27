import * as THREE from 'three';
import { createSkinnedVertexSampler } from './skinned-vertex-sampler.js';

// Pose-driven clearance for the hero's opaque skirt. Skin and locomotion remain
// authoritative; only the independent cloth surfaces receive radial offsets.
export function createJevicaDrape(avatar, waist, skirts) {
  const body=avatar.rig.model.getObjectByName('Jevica');
  if(!body?.isSkinnedMesh)return {update(){}};
  const sampler=createSkinnedVertexSampler(body);
  const skin=body.geometry.attributes.skinIndex,weights=body.geometry.attributes.skinWeight;
  const coveredBones=new Set(body.skeleton.bones.flatMap((bone,i)=>/^(spine_01|pelvis|thigh_|calf_)/.test(bone.name)?[i]:[]));
  const samples=[];
  for(let i=0;i<skin.count;i++) {
    for(let j=0;j<4;j++)if(coveredBones.has(skin.getComponent(i,j))&&weights.getComponent(i,j)>.05){samples.push(i);break;}
  }
  const tau=Math.PI*2,rows=45,sectors=64,low=-1,step=1.1/(rows-1);
  // The lap compresses the skirt vertically. Resolve that waist fold at 5 mm
  // instead of interpolating across a full standing-skirt row (27.5 mm).
  const seatedLow=-.12,seatedStep=.22/(rows-1);
  const field=new Float32Array(rows*sectors),required=new Float32Array(field.length);
  const point=new THREE.Vector3(),inverse=new THREE.Matrix4(),matrix=new THREE.Matrix4();
  const wrapped=sector=>(sector%sectors+sectors)%sectors;
  const cellAt=(p,seated=false)=>{
    const row=THREE.MathUtils.clamp((p.y-(seated?seatedLow:low))/(seated?seatedStep:step),0,rows-1);
    const sector=((Math.atan2(p.x,p.z)+tau)%tau)/tau*sectors;
    const r=Math.min(rows-2,Math.floor(row)),a=Math.floor(sector);
    return {r,a,t:row-r,u:sector-a};
  };
  const sampleField=(values,{r,a,t,u})=>THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(values[r*sectors+a],values[r*sectors+wrapped(a+1)],u),
    THREE.MathUtils.lerp(values[(r+1)*sectors+a],values[(r+1)*sectors+wrapped(a+1)],u),t);
  const parts=skirts.map(mesh=>{
    mesh.updateMatrix();
    const position=mesh.geometry.attributes.position,rest=position.array.slice();
    const points=Array.from({length:position.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrix));
    const directionMatrix=new THREE.Matrix3().setFromMatrix4(mesh.matrix).invert();
    const local=new THREE.Matrix4().copy(mesh.matrix).invert();
    const folded=points.map(p=>{
      const t=THREE.MathUtils.clamp(-p.y/.90,0,1),k=THREE.MathUtils.smoothstep(t,0,.55);
      return new THREE.Vector3(p.x*(1-.46*t),p.y>0?p.y:t<.48?-.07*t/.48:-.07-(t-.48)/.52*.48,p.z*(1-.70*t)+.50*k);
    });
    const shape=(points,seated=false)=>({points,
      rest:Float32Array.from(points.flatMap(p=>p.clone().applyMatrix4(local).toArray())),
      directions:points.map(p=>new THREE.Vector3(p.x,0,p.z).normalize().applyMatrix3(directionMatrix)),
      cells:points.map(p=>cellAt(p,seated)),
    });
    mesh.frustumCulled=false;
    position.setUsage(THREE.DynamicDrawUsage);
    return {mesh,position,points,standing:{...shape(points),rest},seated:shape(folded,true)};
  });
  // Sample the actual resting inner skirt, including its folds and elliptic fit.
  const inner=parts[0],segments=inner.mesh.geometry.parameters.segments;
  const pointsPerColumn=inner.mesh.geometry.parameters.points.length;
  const columns=Array.from({length:segments+1},(_,i)=>{
    const points=inner.points.slice(i*pointsPerColumn,(i+1)*pointsPerColumn);
    return {angle:i===segments?tau:(Math.atan2(points[0].x,points[0].z)+tau)%tau,
      heights:points.map(p=>p.y),radii:points.map(p=>Math.hypot(p.x,p.z))};
  });
  const columnRadius=(column,y)=>{
    const h=column.heights,r=column.radii;
    let j=Math.max(0,Math.min(h.length-2,Math.floor((y-h[0])/(h.at(-1)-h[0])*(h.length-1))));
    while(j>0&&h[j]>y)j--;
    while(j<h.length-2&&h[j+1]<y)j++;
    return THREE.MathUtils.lerp(r[j],r[j+1],THREE.MathUtils.clamp((y-h[j])/(h[j+1]-h[j]),0,1));
  };
  const restRadius=(y,angle)=>{
    let i=Math.min(segments-1,Math.floor(angle/tau*segments));
    while(i>0&&columns[i].angle>angle)i--;
    while(i<segments-1&&columns[i+1].angle<angle)i++;
    return THREE.MathUtils.lerp(columnRadius(columns[i],y),columnRadius(columns[i+1],y),
      (angle-columns[i].angle)/(columns[i+1].angle-columns[i].angle));
  };
  // Folded cloth is offset toward the knees, so its radii must be measured
  // around the waist rather than borrowed from the standing silhouette.
  const seatedRadii=new Float32Array(field.length),folded=inner.seated.points;
  for(let r=0;r<rows;r++) {
    const y=seatedLow+r*seatedStep;if(y<-.06)continue;
    const ring=Array.from({length:segments+1},(_,column)=>{
      const start=column*pointsPerColumn;let j=0;
      while(j<pointsPerColumn-2&&folded[start+j+1].y<y)j++;
      const a=folded[start+j],b=folded[start+j+1];
      return a.clone().lerp(b,THREE.MathUtils.clamp((y-a.y)/(b.y-a.y),0,1));
    });
    for(let a=0;a<sectors;a++) {
      const angle=a/sectors*tau,dx=Math.sin(angle),dz=Math.cos(angle);let radius=0;
      for(let i=0;i<segments;i++) {
        const p=ring[i],q=ring[i+1],ex=q.x-p.x,ez=q.z-p.z,denominator=dx*ez-dz*ex;
        if(Math.abs(denominator)<1e-12)continue;
        const t=(p.x*dz-p.z*dx)/denominator,distance=(p.x*ez-p.z*ex)/denominator;
        if(t>=0&&t<=1&&distance>=0)radius=Math.max(radius,distance);
      }
      seatedRadii[r*sectors+a]=radius;
    }
  }
  // A flat centre covers both interpolation corners. The cosine tails spread
  // the fold continuously as a moving skin sample crosses grid boundaries.
  const influence=distance=>distance<=1?1:distance>=4?0:(1+Math.cos((distance-1)/3*Math.PI))/2;
  const angular=new Float32Array(9);
  let previous=null,wasRiding=false;
  return {
    update(now=performance.now(),riding=false) {
      const poseChanged=riding!==wasRiding;
      if(poseChanged)field.fill(0);
      wasRiding=riding;
      const gridLow=riding?seatedLow:low,gridStep=riding?seatedStep:step;

      const dt=previous===null?0:Math.min(.1,Math.max(0,(now-previous)/1000));previous=now;
      required.fill(0);
      // updateWorldMatrix alone bypasses SkinnedMesh's attached bind inverse.
      // Parents and bones are already current; refresh the skin before sampling.
      body.updateMatrixWorld(true);
      sampler.update();
      inverse.copy(waist.matrixWorld).invert();matrix.multiplyMatrices(inverse,body.matrixWorld);
      for(const index of samples) {
        sampler.getVertexPosition(index,point).applyMatrix4(matrix);
        if(point.y<(riding?-.03:low)||point.y>.085)continue;
        const radius=Math.hypot(point.x,point.z),angle=(Math.atan2(point.x,point.z)+tau)%tau;
        // Tuck the waist beneath the fitted bodice; the moving legs retain
        // their wider clearance. Stopping below the waist exposed bare skin
        // through the join even in a resting pose.
        const clearance=THREE.MathUtils.lerp(.018,.006,THREE.MathUtils.smoothstep(point.y,-.12,-.04));
        const resting=riding?sampleField(seatedRadii,cellAt(point,true)):restRadius(point.y,angle);
        const offset=Math.max(0,radius+clearance-resting);
        if(!offset)continue;
        const row=(point.y-gridLow)/gridStep,sector=angle/tau*sectors;
        const start=Math.ceil(sector-4),end=Math.floor(sector+4);
        for(let a=start;a<=end;a++)angular[a-start]=influence(Math.abs(a-sector));
        for(let r=Math.max(0,Math.ceil(row-4));r<=Math.min(rows-1,Math.floor(row+4));r++) {
          const vertical=offset*influence(Math.abs(r-row));
          for(let a=start;a<=end;a++) {
            const cell=r*sectors+wrapped(a);
            required[cell]=Math.max(required[cell],vertical*angular[a-start]);
          }
        }
      }
      const decay=Math.exp(-dt/.14);
      let changed=false;
      for(let r=0;r<rows;r++)for(let a=0;a<sectors;a++) {
        const cell=r*sectors+a,y=gridLow+r*gridStep;
        const anchor=1-THREE.MathUtils.smoothstep(y,.085,.14);
        const next=Math.max(required[cell]*anchor,field[cell]*decay);
        if(Math.abs(next-field[cell])>1e-6){field[cell]=next;changed=true;}
      }
      if(!changed&&!poseChanged)return;
      for(const part of parts) {
        const {mesh,position}=part;
        const {rest,points,directions,cells}=riding?part.seated:part.standing;
        for(let i=0;i<points.length;i++) {
          const offset=sampleField(field,cells[i]);
          const d=directions[i];
          position.setXYZ(i,rest[i*3]+d.x*offset,rest[i*3+1]+d.y*offset,rest[i*3+2]+d.z*offset);
        }
        position.needsUpdate=true;mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingSphere();mesh.geometry.boundingBox=null;
      }
    },
  };
}
