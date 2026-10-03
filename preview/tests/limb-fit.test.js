import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {measureLimbProfile,limbSurfacePoint} from '../src/limb-fit.js';
test('vine fitting follows a tapered off-axis body instead of a fixed cylinder',()=>{
 const model=new THREE.Group(),bone=new THREE.Bone();bone.name='upperarm_l';model.add(bone);
 const geometry=new THREE.CylinderGeometry(.08,.04,.4,24,12).translate(.02,.2,-.01),count=geometry.attributes.position.count;
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Array(count*4).fill(0),4));
 geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:count*4},(_,i)=>i%4===0?1:0),4));
 const body=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial({name:'young_skin'}));model.add(body);body.bind(new THREE.Skeleton([bone]));
 const piece=new THREE.Group();bone.add(piece);piece.userData.length=.4;
 const profile=measureLimbProfile(model,piece);assert.ok(profile);
 const low=limbSurfacePoint(profile,.05,0,.043),high=limbSurfacePoint(profile,.35,0,.043);
 assert.ok(high[0]>low[0]+.02,'taper follows the mesh');assert.ok(Math.abs(high[2]+.01)<.003,'offset follows actual limb centre');
 assert.deepEqual(limbSurfacePoint(null,.2,0,.043),[.043,.2,0],'missing skin preserves authored radius');
});
