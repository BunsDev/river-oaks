import * as THREE from 'three';

// An asset-independent presence marker while the first rig loads. It never
// claims the selected appearance is ready and is replaced by the authored rig.
export function createAvatarPlaceholder(){
 const object=new THREE.Group();object.name='Avatar loading placeholder';object.userData.characterFallback=true;
 const material=new THREE.MeshStandardMaterial({color:'#89958b',roughness:.9});
 const body=new THREE.Mesh(new THREE.CapsuleGeometry(.22,.9,4,12),material);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.18,12,8),material);
 body.position.y=.7;head.position.y=1.6;
 for(const mesh of [body,head]){mesh.castShadow=true;mesh.receiveShadow=true;object.add(mesh);}
 let disposed=false;
 return {object,dispose(){if(disposed)return;disposed=true;object.removeFromParent();body.geometry.dispose();head.geometry.dispose();material.dispose();}};
}
