import * as THREE from 'three';

// Jevica's original bubble, in meters.
export function createFlightVehicle(form) {
  if(form!=='jevica')throw new Error(`Unknown playable form: ${form}`);
  const group=new THREE.Group(),owned=new Set();
  const material=(color,extra={})=>{const value=new THREE.MeshPhysicalMaterial({color,roughness:0.5,...extra});owned.add(value);return value;};
  const mesh=(geometry,surface,position,rotation=[0,0,0])=>{owned.add(geometry);const object=new THREE.Mesh(geometry,surface);object.position.fromArray(position);object.rotation.set(...rotation);object.castShadow=true;object.receiveShadow=true;group.add(object);return object;};
<<<<<<< Updated upstream
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
    const hull=mesh(new THREE.SphereGeometry(1,48,20),metal,[0,0.12,0]);hull.scale.set(1.05,0.19,1.05);
    const lower=mesh(new THREE.SphereGeometry(1,32,16),material('#203349',{metalness:0.7}),[0,-0.015,0]);lower.scale.set(0.65,0.16,0.65);
    const light=material('#84eefa',{emissive:'#34d7fc',emissiveIntensity:1.4});
    mesh(new THREE.TorusGeometry(0.91,0.025,8,64),light,[0,0.17,0],[Math.PI/2,0,0]);
    for(let i=0;i<8;i++){const angle=i/8*Math.PI*2;const lamp=mesh(new THREE.SphereGeometry(0.045,12,8),light,[Math.cos(angle)*0.84,0.04,Math.sin(angle)*0.84]);lamp.castShadow=false;}
    const canopy=mesh(new THREE.SphereGeometry(1,40,24,0,Math.PI*2,0,Math.PI/2),material('#bfe5f3',{transparent:true,opacity:0.15,depthWrite:false,roughness:0.12,metalness:0.25,clearcoat:1}),[0,0.28,0]);canopy.scale.set(0.72,1.75,0.72);canopy.castShadow=false;
  }
=======
  const glass=material('#f7d5f7',{transparent:true,opacity:0.18,depthWrite:false,roughness:0.08,metalness:0.15,iridescence:1,iridescenceIOR:1.32,iridescenceThicknessRange:[160,600],clearcoat:1,side:THREE.FrontSide});
  const bubble=mesh(new THREE.SphereGeometry(1.3,64,40),glass,[0,1,0]);bubble.scale.set(0.88,1.08,0.88);bubble.castShadow=false;
  const shimmer=material('#fae8ff',{transparent:true,opacity:0.38,depthWrite:false,emissive:'#b578d8',emissiveIntensity:0.25});
  const ring=mesh(new THREE.TorusGeometry(1.295,0.006,6,96),shimmer,[0,1,0]);ring.scale.set(0.88,1.08,0.88);ring.castShadow=false;
>>>>>>> Stashed changes
  return {object:group,dispose(){owned.forEach(item=>item.dispose());group.removeFromParent();}};
}
