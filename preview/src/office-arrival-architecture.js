import * as THREE from 'three';
import { ARRIVAL, OFFICE_FINISH as F } from './office-arrival-model.js';

// Static architectural parts are instanced by finish. Doors alone move. No new
// asset fetches, render loop, real-time reflection probe, or audio context.
export function buildOfficeArrival({facade=true}={}) {
  const object=new THREE.Group(),resources=new Set(),batches=new Map(),unit=new THREE.BoxGeometry(1,1,1);resources.add(unit);
  let disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;for(const r of resources)r.dispose();object.clear();};
  try{
  const material=(color,roughness=.65,metalness=0,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});m.userData.nearCameraSolid=true;resources.add(m);return m;};
  const stone=material(F.stone),floor=material(F.floor,.55),ink=material(F.ink,.48,.15),bronze=material(F.bronze,.36,.7),ceiling=material(F.ceiling),glass=material(F.glass,.22,.25,{transparent:true,opacity:.45,depthWrite:false}),lamp=material(F.light,.5,0,{emissive:F.light,emissiveIntensity:.8});
  const add=(m,w,h,d,x,y,z)=>{if(!batches.has(m))batches.set(m,[]);batches.get(m).push({size:[w,h,d],position:[x,y,z]});};
  const mesh=(m,w,h,d,x,y,z)=>{const n=new THREE.Mesh(unit,m);n.scale.set(w,h,d);n.position.set(x,y,z);n.castShadow=n.receiveShadow=m!==glass&&m!==lamp;object.add(n);return n;};
  // Cabin: flush sill, inset floor border, stone panels, brass joints, handrails.
  add(floor,3.2,.08,4,0,-.04,2);add(ceiling,3.4,.12,4,0,3.36,2);
  for(const sign of [-1,1]){
    add(ink,.13,3.3,4,sign*1.665,1.65,2);
    for(let i=0;i<4;i++)add(stone,.025,2.75,.94,sign*1.587,1.67,.5+i);
    add(bronze,.04,.035,3.72,sign*1.47,.02,2);
    add(bronze,.055,.065,3.3,sign*1.5,1.05,2);
    for(const z of [.45,3.55])add(bronze,.12,.09,.06,sign*1.55,1.05,z);
    add(ink,.035,.16,3.96,sign*1.575,.1,2);
    add(lamp,.045,.03,3.6,sign*1.48,3.27,2);
  }
  for(const z of [.2,3.8])add(bronze,2.98,.025,.04,0,.015,z);
  // Closed through-car portals. Pockets hide the moving leaves rather than
  // sliding their visible panels through unrelated lobby/office furniture.
  const portal=z=>{
    for(const sign of [-1,1]){add(ink,.79,3.3,.18,sign*1.255,1.65,z);add(bronze,.045,2.65,.22,sign*.9,1.325,z);}
    add(ink,1.76,.7,.18,0,2.95,z);add(bronze,1.8,.045,.23,0,2.625,z);add(bronze,1.74,.018,.26,0,.009,z);
    return [-1,1].map(sign=>mesh(bronze,ARRIVAL.doorWidth/2-.006,2.6,.07,sign*ARRIVAL.doorWidth/4,1.3,z));
  };
  // The existing office entrance wall ends at z=.18. Keep the car portal on
  // its cabin side so two sets of trims never occupy the same plane.
  const frontDoors=portal(ARRIVAL.frontPortalZ),rearDoors=portal(4);
  // Lobby dimensions and finishes echo the north-lane stone portal. Its front
  // glazing sits at z=8.2 and the same canopy continues over the entrance.
  // In the district, meet the back of the existing stone portal. Extending
  // these returns to its front plane creates coplanar pale stripes on the jambs.
  const returnEnd=facade?8.4:ARRIVAL.lobbyFront,returnDepth=returnEnd-4,returnCenter=(returnEnd+4)/2;
  add(floor,5.2,.08,5.8,0,-.04,6.9);add(ceiling,5.4,.12,returnDepth,0,4.41,returnCenter);
  for(const sign of [-1,1]){
    add(stone,.18,4.35,returnDepth,sign*2.69,2.175,returnCenter);add(ink,.04,.18,returnDepth,sign*2.58,.09,returnCenter);
    for(let z=4.7;z<8.2;z+=1.15)add(bronze,.03,3.7,.016,sign*2.588,2.1,z);
    add(lamp,.035,.035,3.9,sign*2.5,4.29,6.2);
    if(facade)add(ink,.78,4.35,.2,sign*2.2,2.175,8.2);
    add(bronze,.07,3.35,.19,sign*1.8,1.675,8.22);
  }
  const entryDoors=[-1,1].map(sign=>{
    const door=new THREE.Group();object.add(door);
    for(const [m,w,h,d,x,y,z]of [[glass,1.74,3.2,.035,0,1.6,8.2],[bronze,.035,3.2,.08,-sign*.87,1.6,8.23],[bronze,.035,.7,.08,-sign*.73,1.35,8.31]]){
      const part=mesh(m,w,h,d,x,y,z);door.add(part);
    }
    return door;
  });
  const setEntryOpen=value=>entryDoors.forEach((door,i)=>{door.position.x=(i?1:-1)*(.9+1.8*Math.max(0,Math.min(1,value)));});
  setEntryOpen(facade?1:0);
  if(facade){
  add(ink,5.2,.95,.2,0,3.875,8.2);add(glass,6.4,.08,3.25,0,5.32,9.87);
  for(const sign of [-1,1])add(bronze,.09,.1,3.3,sign*3.15,5.23,9.88);
  add(bronze,6.4,.1,.09,0,5.23,11.5);
  for(const x of [-1.8,-.6,.6,1.8])add(bronze,.04,.06,3.2,x,5.26,9.85);
  }
  // Lobby lift surround closes the gap around the car without occluding entry.
  for(const sign of [-1,1])add(stone,.85,4.35,.22,sign*2.175,2.175,4);
  add(stone,3.5,.98,.22,0,3.86,4);
  add(ink,.42,.85,.07,1.25,1.32,4.16);add(lamp,.09,.09,.018,1.25,1.45,4.205);
  for(const x of [-1.4,1.4])for(const z of [5.1,7.5])add(lamp,.18,.025,.18,x,4.34,z);
  // A wall-mounted directory and slim bench remain outside the 1.8 m route.
  add(ink,.08,1.35,1.35,-2.53,2.1,6.3);add(bronze,.1,.04,1.4,-2.48,1.4,6.3);
  add(ink,.5,.1,1.6,2.28,.5,6.35);
  for(const z of [5.8,6.9])add(bronze,.38,.45,.06,2.28,.225,z);

  // Small local canvases for typography and floor indicators. Static labels are
  // drawn once; floor text updates only on floor changes.
  function label(text,w,h,x,y,z,{size=38,background=F.ink,color=F.light,turn=0}={}){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;resources.add(texture);
    const m=new THREE.MeshBasicMaterial({map:texture});m.userData.nearCameraSolid=true;resources.add(m);const g=new THREE.PlaneGeometry(w,h);resources.add(g);
    const n=new THREE.Mesh(g,m);n.position.set(x,y,z);n.rotation.y=turn;object.add(n);
    const write=value=>{ctx.fillStyle=background;ctx.fillRect(0,0,512,128);ctx.fillStyle=color;ctx.font=`500 ${size}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';const lines=value.split('\n');lines.forEach((line,i)=>ctx.fillText(line,256,64+(i-(lines.length-1)/2)*52));texture.needsUpdate=true;};write(text);return write;
  }
  if(facade)label('R I V E R   O A K S   ·   O F F I C E S',3.4,.42,0,3.83,8.315,{size:22});
  label('OFFICES  /  06',2.2,.4,0,3.65,4.12,{size:30,background:F.stone,color:F.ink});
  label('PRIVATE WORKSPACES',1.3,.22,0,3.19,4.13,{size:25,background:F.stone,color:F.ink});
  const display=label('G  ↑  06',.9,.3,0,2.97,ARRIVAL.frontPortalZ+.105,{size:40});
  label('06',.3,.3,1.25,1.15,4.21,{size:50});
  label('RIVER OAKS\n06  ·  OFFICES',1.16,.48,-2.484,2.1,6.3,{size:34,turn:Math.PI/2});
  // Car controls mounted on the side facing into the cabin.
  add(ink,.04,.85,.42,1.57,1.28,1.3);
  for(const z of [1.18,1.42])for(const y of [1.12,1.4])add(bronze,.02,.055,.055,1.54,y,z);
  add(lamp,.025,.06,.06,1.535,1.4,1.18);
  const transform=new THREE.Object3D();
  for(const[m,parts]of batches){const instances=new THREE.InstancedMesh(unit,m,parts.length);instances.castShadow=instances.receiveShadow=m!==glass&&m!==lamp;resources.add(instances);parts.forEach((part,i)=>{transform.position.fromArray(part.position);transform.scale.fromArray(part.size);transform.updateMatrix();instances.setMatrixAt(i,transform.matrix);});instances.computeBoundingSphere();object.add(instances);}
  let lastFloor=null;
  return {object,frontDoors,rearDoors,entryDoors,setEntryOpen,
    update(frame){const arriving=['opening','arriving','office'].includes(frame.phase);for(let i=0;i<2;i++){const sign=i?1:-1;frontDoors[i].position.x=sign*(ARRIVAL.doorWidth/4+(arriving?frame.doors:0)*1.12);rearDoors[i].position.x=sign*(ARRIVAL.doorWidth/4+(['lobby','boarding','closing'].includes(frame.phase)?frame.doors:0)*1.12);}if(frame.floor!==lastFloor){lastFloor=frame.floor;display(frame.floor===6?'06  ·  OFFICES':`${frame.floor===1?'G':String(frame.floor).padStart(2,'0')}   ↑   06`);}},
    dispose,
    dimensions:ARRIVAL,
  };
  }catch(error){dispose();throw error;}
}
