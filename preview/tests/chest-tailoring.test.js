import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {instantiateAvatar} from '../src/avatars.js';
import {createReferenceStyle} from '../src/reference-archetypes.js';
import {sharedAppearance} from '../src/shared-appearances.js';
import {loadCharacterRig} from './helpers/character-rig.js';

// Tailoring and embroidery on the masculine chest must lie on it: never inside
// the suit and never floating in front of it, from the collar to the waist.
for(const id of ['man-workwear','kai-noir','kai-explorer','man-tailored','rowan-human','man-casual'])test(`${id}: chest tailoring and embroidery sit on the chest`,async()=>{
  const appearance=sharedAppearance(id),source=await loadCharacterRig(appearance.rig);
  const avatar=instantiateAvatar(source,{targetHeight:source.height,id});
  const model=avatar.model,original=new Set(model.getObjectsByProperty('isMesh',true)),look=createReferenceStyle(avatar,appearance);
  try{
    model.updateMatrixWorld(true);
    const spine=model.getObjectByName('spine_03'),groups=spine.children.filter(child=>child.isGroup);
    const inverse=groups[0].matrixWorld.clone().invert(),body=model.getObjectsByProperty('isSkinnedMesh',true).find(mesh=>/suit/.test(mesh.name));
    // The chest's front-most surface, by raycasting the skinned suit from the front.
    const ray=new THREE.Raycaster(),hits=new Map(),frame=groups[0].matrixWorld,direction=new THREE.Vector3(0,0,-1).transformDirection(frame);
    const surface=(x,y)=>{
      const key=`${Math.round(x*500)},${Math.round(y*500)}`;
      if(!hits.has(key)){ray.set(new THREE.Vector3(x,y,1).applyMatrix4(frame),direction);const hit=ray.intersectObject(body,false)[0];hits.set(key,hit?hit.point.applyMatrix4(inverse).z:-Infinity);}
      return hits.get(key);
    };
    let checked=0;
    for(const group of groups)for(const mesh of group.children.filter(child=>child.isMesh&&!original.has(child))){
      // Only pieces worn on the chest front: skip the head-height and back-facing parts.
      const box=new THREE.Box3().setFromObject(mesh).applyMatrix4(inverse);
      if(box.max.z<.05||box.min.y>.26||box.max.y<-.08)continue;
      const position=mesh.geometry.attributes.position,local=new THREE.Vector3();
      // Up to about 300 samples per mesh keeps the raycast reference quick.
      for(let i=0,stride=Math.ceil(position.count/300);i<position.count;i+=stride){
        local.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
        if(local.y>.26||local.y<-.08||Math.abs(local.x)>.16||local.z<.05)continue;
        // Cells without a measured front (only back vertices nearby) are not judged.
        const chest=surface(local.x,local.y);if(!(chest>.05))continue;
        checked++;
        assert.ok(local.z>chest-.004,`${mesh.name||mesh.geometry.type} vertex ${i} is ${(chest-local.z).toFixed(3)} m inside the chest at (${local.x.toFixed(3)}, ${local.y.toFixed(3)})`);
        assert.ok(local.z<chest+.035,`${mesh.name||mesh.geometry.type} vertex ${i} floats ${(local.z-chest).toFixed(3)} m in front of the chest at (${local.x.toFixed(3)}, ${local.y.toFixed(3)})`);
      }
    }
    assert.ok(checked>50,`checked ${checked} chest vertices`);
  }finally{look.dispose();avatar.dispose();}
});
