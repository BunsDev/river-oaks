import * as THREE from 'three';

export function createPrinceShoppingBag(avatar) {
  const object=new THREE.Group();object.name='Jevica’s rose shopping bag';object.visible=false;object.userData.localId='carriage-driver';
  const paper=new THREE.MeshStandardMaterial({color:'#f5cee0',roughness:.85}),gold=new THREE.MeshStandardMaterial({color:'#d6aa61',roughness:.4,metalness:.45});
  const body=new THREE.Mesh(new THREE.BoxGeometry(.30,.33,.14),paper);body.position.y=-.265;
  const rim=new THREE.Mesh(new THREE.BoxGeometry(.305,.018,.145),gold);rim.position.y=-.107;object.add(body,rim);
  for(const z of [-.05,.05]) {
    const handle=new THREE.Mesh(new THREE.TorusGeometry(.079,.008,6,20,Math.PI),gold);handle.position.set(0,-.10,z);object.add(handle);
  }
  const seal=new THREE.Mesh(new THREE.SphereGeometry(.035,12,8),gold);seal.scale.set(1,1,.18);seal.position.set(0,-.24,.075);object.add(seal);
  object.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.localId='carriage-driver';}});
  avatar.object.add(object);
  const hand=avatar.rig.model.getObjectByName('hand_r'),position=new THREE.Vector3(),rotation=new THREE.Quaternion();
  return {
    object,
    update(carrying) {
      object.visible=Boolean(carrying&&hand);if(!object.visible)return;
      avatar.object.updateWorldMatrix(true,true);hand.getWorldPosition(position);object.position.copy(avatar.object.worldToLocal(position));
      avatar.object.getWorldQuaternion(rotation);object.quaternion.copy(rotation.invert());object.updateWorldMatrix(true,true);
    },
    dispose(){object.traverse(mesh=>mesh.geometry?.dispose());paper.dispose();gold.dispose();object.removeFromParent();},
  };
}
