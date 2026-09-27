import * as THREE from 'three';

// Jevica's original bubble, in meters.
export function createFlightVehicle(form) {
  if(form!=='jevica')throw new Error(`Unknown playable form: ${form}`);
  const group=new THREE.Group(),owned=new Set();
  const material=(color,extra={})=>{const value=new THREE.MeshPhysicalMaterial({color,roughness:0.5,...extra});owned.add(value);return value;};
  const mesh=(geometry,surface,position,rotation=[0,0,0])=>{owned.add(geometry);const object=new THREE.Mesh(geometry,surface);object.position.fromArray(position);object.rotation.set(...rotation);object.castShadow=true;object.receiveShadow=true;group.add(object);return object;};
  const glass=material('#f7d5f7',{transparent:true,opacity:0.18,depthWrite:false,roughness:0.08,metalness:0.15,iridescence:1,iridescenceIOR:1.32,iridescenceThicknessRange:[160,600],clearcoat:1,side:THREE.FrontSide});
  const bubble=mesh(new THREE.SphereGeometry(1.3,64,40),glass,[0,1,0]);bubble.scale.set(0.88,1.08,0.88);bubble.castShadow=false;
  const shimmer=material('#fae8ff',{transparent:true,opacity:0.38,depthWrite:false,emissive:'#b578d8',emissiveIntensity:0.25});
  const ring=mesh(new THREE.TorusGeometry(1.295,0.006,6,96),shimmer,[0,1,0]);ring.scale.set(0.88,1.08,0.88);ring.castShadow=false;
  return {object:group,dispose(){owned.forEach(item=>item.dispose());group.removeFromParent();}};
}
