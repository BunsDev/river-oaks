import * as THREE from 'three';
import { plantingRandom } from './planting-palette.js';
import { plantPartGeometries } from './procedural-plants.js';
import { spatialInstanceBatches } from './spatial-instances.js';
// Authored short ornamental grass: reuse the existing cupped leaf geometry as
// narrow blades. Synchronous, opaque and bounded; no model loading or wind loop.
export function buildRoofGrasses(tufts) {
  if (!tufts.length) return [];
  const geometry=plantPartGeometries(['leaf-plain']).get('leaf-plain');
  const material=new THREE.MeshStandardMaterial({color:'#789458',roughness:.9,side:THREE.DoubleSide});
  material.name='roof-grass';
  const source=new THREE.InstancedMesh(geometry,material,tufts.length*12),dummy=new THREE.Object3D(),color=new THREE.Color();
  source.name='Roof ornamental grass';source.receiveShadow=true;
  let index=0;
  for(const {origin,seed} of tufts) {
    const rand=plantingRandom(seed);
    for(let blade=0;blade<12;blade++) {
      const yaw=blade*2.399963+rand()*.25;
      dummy.position.fromArray(origin);dummy.rotation.set(0,yaw,.15+rand()*.45);
      dummy.scale.set(.025,.45+rand()*.2,.03);dummy.updateMatrix();
      source.setMatrixAt(index,dummy.matrix);source.setColorAt(index++,color.setHSL(.23+rand()*.05,.3,.35+rand()*.1));
    }
  }
  const batches=spatialInstanceBatches(source,24);source.dispose();return batches;
}
