import * as THREE from 'three';
import { createArmContacts, placePalm } from './arm-contact.js';

const cache=new Map();
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);};
export function workPropKind(theme, pose) {
  if(theme==='dining'&&pose==='carry')return 'tray';
  if(theme==='fashion'||theme==='leather')return 'fabric';
  if(theme==='jewelry')return 'jewelry';
  if(theme==='optician')return 'eyewear';
  if(theme==='perfumery'||theme==='salon'||theme==='gelato')return 'samples';
  return 'tablet';
}

function template(kind) {
  if(cache.has(kind))return cache.get(kind);
  const group=new THREE.Group();
  const matte=new THREE.MeshPhysicalMaterial({color:'#293536',roughness:0.6});
  const metal=new THREE.MeshStandardMaterial({color:'#bebac0',metalness:0.8,roughness:0.3});
  const fabric=new THREE.MeshPhysicalMaterial({color:'#c1a894',roughness:0.9,sheen:0.6,sheenColor:new THREE.Color('#e4cbbb')});
  const ceramic=new THREE.MeshStandardMaterial({color:'#ede7d7',roughness:0.35});
  const add=(geometry,material,position)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.fromArray(position);mesh.receiveShadow=true;group.add(mesh);return mesh;};
  // Palms support the underside; the load stays level even while the torso looks
  // toward a conversation partner. Geometry/materials are shared by all workers.
  const tray=add(new THREE.BoxGeometry(0.36,0.018,0.25),kind==='tray'?metal:matte,[0,0.009,0]);
  tray.name='Supported work surface';
  if(kind==='tray') {
    for(const x of [-0.09,0.09]) {
      add(new THREE.CylinderGeometry(0.048,0.048,0.007,32),ceramic,[x,0.024,0]);
      add(new THREE.CylinderGeometry(0.031,0.025,0.065,24),ceramic,[x,0.06,0]);
      add(new THREE.CylinderGeometry(0.027,0.027,0.001,24),new THREE.MeshStandardMaterial({color:'#372319',roughness:0.24}),[x,0.093,0]);
      const handle=add(new THREE.TorusGeometry(0.02,0.005,8,20),ceramic,[x+0.032,0.064,0]);handle.rotation.y=Math.PI/2;
    }
  } else if(kind==='fabric') {
    for(let layer=0;layer<3;layer++) {
      const geometry=new THREE.BoxGeometry(0.28,0.022,0.19,16,2,12),p=geometry.attributes.position;
      for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)+Math.sin(p.getX(i)*80)*0.0015+Math.sin(p.getZ(i)*60)*0.001);
      geometry.computeVertexNormals();add(geometry,fabric,[0,0.03+layer*0.023,0]);
    }
  } else if(kind==='jewelry') {
    add(new THREE.BoxGeometry(0.28,0.018,0.17),fabric,[0,0.027,0]);
    for(const x of [-0.08,0,0.08]){const ring=add(new THREE.TorusGeometry(0.017,0.003,10,28),metal,[x,0.053,0]);ring.rotation.x=-0.4;}
  } else if(kind==='eyewear') {
    for(const x of [-0.038,0.038])add(new THREE.TorusGeometry(0.028,0.0025,8,24),metal,[x,0.032,0]).rotation.x=Math.PI/2;
    add(new THREE.BoxGeometry(0.025,0.004,0.005),metal,[0,0.032,0]);
    for(const x of [-0.068,0.068])add(new THREE.BoxGeometry(0.004,0.006,0.10),metal,[x,0.034,0.04]);
  } else if(kind==='samples') {
    for(const [i,x] of [-0.09,0,0.09].entries()) {
      add(new THREE.CylinderGeometry(0.021,0.021,0.08,20),i%2?fabric:ceramic,[x,0.063,0]);
      add(new THREE.CylinderGeometry(0.018,0.018,0.013,20),metal,[x,0.11,0]);
    }
  } else {
    const screen=new THREE.MeshStandardMaterial({color:'#334e52',roughness:0.32,emissive:'#1d393e',emissiveIntensity:0.18});
    add(new THREE.BoxGeometry(0.315,0.002,0.20),screen,[0,0.019,0]);
    // Small task rows communicate a working display without adding UI text.
    for(let i=0;i<4;i++)add(new THREE.BoxGeometry(i%2?0.18:0.23,0.001,0.009),ceramic,[-0.015,0.021,-0.065+i*0.04]);
  }
  cache.set(kind,group);return group;
}

// Select a clear piece of the existing counter's near edge, never move fixtures.
export function counterContact(room,spot,holder) {
  const tops={counter:1.025,desk:0.78,reception:1.08,concession:1.06};
  let best=null;
  for(const fixture of room.fixtures) {
    if(!(fixture.kind in tops)||!Number.isFinite(fixture.d))continue;
    const halfWidth=(fixture.w??1)/2-0.22,halfDepth=(fixture.l??0.65)/2-0.13;
    const a=Math.max(fixture.a-halfWidth,Math.min(fixture.a+halfWidth,spot.a));
    const d=fixture.d+Math.sign(spot.d-fixture.d)*Math.max(0,halfDepth);
    const [east,north]=room.toWorld(a,d),p=holder.worldToLocal(new THREE.Vector3(east,room.floor+tops[fixture.kind],-north));
    if(p.z<0.24||p.z>0.55||Math.abs(p.x)>0.28)continue;
    if(!best||p.lengthSq()<best.lengthSq())best=p;
  }
  return best;
}

export function createWorkerTask(avatar,holder,room,spot) {
  const kind=workPropKind(room.theme,spot.pose),arms=createArmContacts(avatar.model,holder);
  if(arms.length!==2)return null;
  const object=template(kind).clone();object.name=`Worker ${kind}`;holder.add(object);
  object.traverse(item=>{item.userData.localId=holder.userData.localId;});
  const reach=Math.min(...arms.map(arm=>arm.upperLength+arm.lowerLength));
  const shoulders=arms.map(arm=>holder.worldToLocal(arm.thigh.getWorldPosition(new THREE.Vector3())));
  const raised=shoulders[0].clone().add(shoulders[1]).multiplyScalar(0.5);
  raised.y-=reach*0.5;raised.z+=reach*0.55;
  const rotation=holder.getWorldQuaternion(new THREE.Quaternion());
  const candidate=spot.pose==='attend'?counterContact(room,spot,holder):null;
  // A fixed counter can lie outside a shorter worker's reach. In that case keep
  // the object supported at a height fitted to this rig instead of stretching.
  const reachable=point=>arms.every(arm=>{
    const target=point.clone().add(new THREE.Vector3(arm.side==='l'?0.13:-0.13,0,0));
    const orientation=rotation.clone().multiply(arm.frameToHand);
    const wrist=holder.localToWorld(target).sub(arm.palmOffset.clone().applyQuaternion(orientation));
    const distance=wrist.distanceTo(arm.thigh.getWorldPosition(new THREE.Vector3()));
    return distance<arm.upperLength+arm.lowerLength-0.04&&distance>Math.abs(arm.upperLength-arm.lowerLength)+0.04;
  });
  const dock=candidate&&reachable(candidate)?candidate:null;
  const contacts=[];
  return {kind,object,contacts,docked:Boolean(dock),
    update(time,attention) {
      const phase=((time%12)+12)%12, lift=smooth((phase-2)/2)*(1-smooth((phase-8)/2));
      object.position.copy(dock??raised);
      if(dock)object.position.lerp(raised,lift);
      // A small inspection tilt, but a loaded serving tray always stays level.
      object.rotation.z=kind==='tray'?0:Math.sin(time*0.8)*0.025*lift*(1-attention);
      holder.updateWorldMatrix(true,true);object.getWorldQuaternion(rotation);
      contacts.length=0;
      for(const arm of arms) {
        const side=arm.side==='l'?1:-1;
        const point=object.localToWorld(new THREE.Vector3(side*0.13,0,0));
        const pole=holder.localToWorld(new THREE.Vector3(side*0.48,1.03,-0.05));
        const actual=placePalm(arm,point,rotation,pole);
        contacts.push({side:arm.side,target:point.toArray(),actual:actual.toArray(),error:arm.error});
      }
    },
    dispose(){object.removeFromParent();},
  };
}
