import * as THREE from 'three';

// Original props in meters, shared by the ground and flight presentation.
export function createFlightVehicle(form) {
  const group=new THREE.Group(),owned=new Set();
  const material=(color,extra={})=>{const value=new THREE.MeshPhysicalMaterial({color,roughness:0.5,...extra});owned.add(value);return value;};
  const mesh=(geometry,surface,position,rotation=[0,0,0])=>{owned.add(geometry);const object=new THREE.Mesh(geometry,surface);object.position.fromArray(position);object.rotation.set(...rotation);object.castShadow=true;object.receiveShadow=true;group.add(object);return object;};
  const wood=material('#4f3324'),fiber=material('#967747',{roughness:0.95}),metal=material('#8da0b8',{metalness:0.85,roughness:0.3});
  if(form==='witch') {
    mesh(new THREE.CylinderGeometry(0.022,0.032,1.9,16),wood,[0,0.92,0.12],[Math.PI/2,0,0]);
    for(let i=0;i<32;i++) {
      const angle=i*2.39996,radius=0.03+(i%7)*0.015;
      const points=[new THREE.Vector3(0,0.92,-0.6),new THREE.Vector3(Math.cos(angle)*radius,0.92+Math.sin(angle)*radius,-0.95),new THREE.Vector3(Math.cos(angle)*radius*1.9,0.9+Math.sin(angle)*radius*1.5,-1.25-(i%3)*0.035)];
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),6,0.007,4,false),fiber,[0,0,0]);
    }
    mesh(new THREE.TorusGeometry(0.07,0.012,6,18),metal,[0,0.92,-0.8]);
  } else if(form==='jevica') {
    const glass=material('#f7d5f7',{transparent:true,opacity:0.18,depthWrite:false,roughness:0.08,metalness:0.15,iridescence:1,iridescenceIOR:1.32,iridescenceThicknessRange:[160,600],clearcoat:1,side:THREE.FrontSide});
    const bubble=mesh(new THREE.SphereGeometry(1.3,64,40),glass,[0,1,0]);bubble.scale.set(0.88,1.08,0.88);bubble.castShadow=false;
    const shimmer=material('#fae8ff',{transparent:true,opacity:0.38,depthWrite:false,emissive:'#b578d8',emissiveIntensity:0.25});
    const ring=mesh(new THREE.TorusGeometry(1.295,0.006,6,96),shimmer,[0,1,0]);ring.scale.set(0.88,1.08,0.88);ring.castShadow=false;
  } else {
    // The Wizard's balloon: green silk with gold seams, a wicker basket and sandbags.
    const silk=material('#2f8f5b',{roughness:0.55,sheen:0.8,sheenColor:new THREE.Color('#bfe8c9')}),gold=material('#d9b53a',{metalness:0.6,roughness:0.35});
    const envelope=mesh(new THREE.SphereGeometry(1.55,48,32),silk,[0,4.1,0]);envelope.scale.set(1,1.12,1);
    mesh(new THREE.ConeGeometry(0.62,1.1,32,1,true),silk,[0,2.35,0],[Math.PI,0,0]);
    for(let i=0;i<8;i++){const angle=i/8*Math.PI*2;const seam=mesh(new THREE.TorusGeometry(1.556,0.01,6,80,Math.PI),gold,[0,4.1,0],[0,angle,0]);seam.scale.set(1,1.12,1);seam.castShadow=false;}
    mesh(new THREE.TorusGeometry(1.0,0.012,6,64),gold,[0,4.9,0],[Math.PI/2,0,0]);
    mesh(new THREE.CylinderGeometry(0.62,0.55,0.62,20,1,true),fiber,[0,0.31,0]);
    mesh(new THREE.CircleGeometry(0.55,20),fiber,[0,0.005,0],[-Math.PI/2,0,0]);
    mesh(new THREE.TorusGeometry(0.62,0.02,8,32),wood,[0,0.62,0],[Math.PI/2,0,0]);
    for(let i=0;i<6;i++){const angle=i/6*Math.PI*2;const rope=mesh(new THREE.CylinderGeometry(0.008,0.008,1.24,6),fiber,[Math.cos(angle)*0.6,1.2,Math.sin(angle)*0.6]);rope.rotation.set(-Math.sin(angle)*0.05,0,Math.cos(angle)*0.05);if(i%2===0)mesh(new THREE.SphereGeometry(0.1,10,8),fiber,[Math.cos(angle)*0.66,0.42,Math.sin(angle)*0.66]);}
  }
  return {object:group,dispose(){owned.forEach(item=>item.dispose());group.removeFromParent();}};
}
