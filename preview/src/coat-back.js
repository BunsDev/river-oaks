import * as THREE from 'three';
import {COAT_WAIST} from './coat-tail-geometry.js';

export const COAT_BACK_NAME='Tailored coat back';
const COLUMNS=14,ROWS=10;
export const COAT_BACK_TRIANGLES=COLUMNS*ROWS*2;

// The split tails start at a waist ring that stands clear of the back, which
// read as a hard shelf in profile. This back panel rises from just outside that
// ring to the shoulder blades, so the coat hangs from the shoulders. It spans
// only the back, inside the arms' swing, in the pelvis frame the tails use.
const HEM={y:COAT_WAIST-.015,z:0,rx:.21,rz:.164},YOKE={y:.37,z:.028,rx:.188,rz:.13};
export function createCoatBackGeometry(){
  const vertices=[],uv=[],indices=[];
  for(let r=0;r<=ROWS;r++)for(let c=0;c<=COLUMNS;c++){
    const v=r/ROWS,u=c/COLUMNS,a=Math.PI*(.7+.6*u);
    // Hug the back for most of the height; flare out only to meet the tails.
    const t=1-(1-v)**2.5,lerp=key=>HEM[key]+(YOKE[key]-HEM[key])*t;
    vertices.push(Math.sin(a)*lerp('rx'),lerp('y'),lerp('z')+Math.cos(a)*lerp('rz'));uv.push(u,v);
    if(r<ROWS&&c<COLUMNS){const n=r*(COLUMNS+1)+c;indices.push(n,n+1,n+COLUMNS+1,n+1,n+COLUMNS+2,n+COLUMNS+1);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

// Pinned to the pelvis where it meets the tails, then carried by the spine so
// it follows a bending back. Reuses the body's own skeleton and bind matrix.
export function skinCoatBack(panel,body){
  const bones=body?.skeleton?.bones;
  if(!body?.isSkinnedMesh||!bones)throw new TypeError('A fitted coat back requires a skinned body');
  const index=['pelvis','spine_02','spine_03'].map(name=>bones.findIndex(bone=>bone.name===name));
  if(index.some(i=>i<0))throw new TypeError('Coat back rig is incompatible');
  body.updateWorldMatrix(true,false);panel.updateWorldMatrix(true,false);
  const position=panel.geometry.attributes.position,indices=[],weights=[];
  for(let i=0;i<position.count;i++){
    const y=position.getY(i),pelvis=1-THREE.MathUtils.smoothstep(y,.12,.2),upper=THREE.MathUtils.smoothstep(y,.2,.34);
    indices.push(...index,0);weights.push(pelvis,Math.max(0,1-pelvis-upper),upper,0);
  }
  const geometry=panel.geometry;geometry.applyMatrix4(body.matrixWorld.clone().invert().multiply(panel.matrixWorld));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const fitted=new THREE.SkinnedMesh(geometry,panel.material);fitted.name=panel.name;
  fitted.position.copy(body.position);fitted.quaternion.copy(body.quaternion);fitted.scale.copy(body.scale);fitted.bindMode=body.bindMode;fitted.bind(body.skeleton,body.bindMatrix);
  fitted.frustumCulled=false;fitted.castShadow=panel.castShadow;fitted.receiveShadow=panel.receiveShadow;
  const group=new THREE.Group();body.parent.add(group);group.add(fitted);panel.removeFromParent();
  return {mesh:fitted,group};
}
