import * as THREE from 'three';
import { ARRIVAL, OFFICE_FINISH as F } from './office-arrival-model.js';

// Static architectural parts are instanced by finish. Only the phase tube's glass
// leaves and its light ring move. No new asset fetches, render loop, real-time
// reflection probe, or audio context.
export function buildOfficeArrival({facade=true}={}) {
  const object=new THREE.Group(),resources=new Set(),batches=new Map(),unit=new THREE.BoxGeometry(1,1,1);resources.add(unit);object.name='office-arrival';
  let disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;for(const r of resources)r.dispose();object.clear();};
  try{
  const material=(color,roughness=.65,metalness=0,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});m.userData.nearCameraSolid=true;resources.add(m);return m;};
  const stone=material(F.stone),floor=material(F.floor,.55),ink=material(F.ink,.48,.15),bronze=material(F.bronze,.36,.7),ceiling=material(F.ceiling),glass=material(F.glass,.22,.25,{transparent:true,opacity:.45,depthWrite:false}),lamp=material(F.light,.5,0,{emissive:F.light,emissiveIntensity:.8});
  // The phase tube's finishes: polished chrome, tangerine enamel, clear glass, the dark
  // shaft seen through it, and its warm light (additive, never a light source).
  const chrome=material(F.chrome,.16,1,{side:THREE.DoubleSide}),enamel=material(F.tangerine,.32,.1,{side:THREE.DoubleSide}),clear=material(F.tubeGlass,.05,.35,{transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide}),shaft=material(F.ink,.6,.1,{side:THREE.BackSide});
  const shine=extra=>material(F.glow,.4,0,{emissive:F.glow,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,...extra});
  const glow=shine({emissiveIntensity:2.6,opacity:.95}),haze=shine({emissiveIntensity:1.3,opacity:.32}),pool=shine({emissiveIntensity:1.1,opacity:.1});
  const add=(m,w,h,d,x,y,z)=>{if(!batches.has(m))batches.set(m,[]);batches.get(m).push({size:[w,h,d],position:[x,y,z]});};
  const mesh=(m,w,h,d,x,y,z)=>{const n=new THREE.Mesh(unit,m);n.scale.set(w,h,d);n.position.set(x,y,z);n.castShadow=n.receiveShadow=m!==glass&&m!==lamp;object.add(n);return n;};
  const part=(geometry,m,x,y,z,parent=object)=>{resources.add(geometry);const n=new THREE.Mesh(geometry,m);n.position.set(x,y,z);n.castShadow=n.receiveShadow=m===chrome||m===enamel||m===ink;parent.add(n);return n;};
  // Cabin floor, flush with the lobby, and the car portals' jambs and lintels at both ends.
  add(floor,3.2,.08,4,0,-.04,2);
  const portal=z=>{
    for(const sign of [-1,1]){add(ink,.79,3.3,.18,sign*1.255,1.65,z);add(bronze,.045,2.65,.22,sign*.9,1.325,z);}
    add(ink,1.76,.7,.18,0,2.95,z);add(bronze,1.8,.045,.23,0,2.625,z);add(bronze,1.74,.018,.26,0,.009,z);
  };
  // The existing office entrance wall ends at z=.18. Keep the car portal on its cabin
  // side so two sets of trims never occupy the same plane; a short throat joins it to
  // the tube, whose lobby face meets the rear portal directly.
  portal(ARRIVAL.frontPortalZ);portal(4);
  for(const sign of [-1,1])add(ink,.79,3.3,.22,sign*1.255,1.65,.52);
  add(ink,1.76,.7,.22,0,2.95,.52);
  // The phase tube: a glass drum of radius R about a vertical axis at z=ZC with doorways
  // facing the lobby (+Z) and the office (-Z). Azimuth phi is the point (R sin phi, y, ZC+R cos phi),
  // which is also how CylinderGeometry and the door leaves measure their arcs.
  const R=ARRIVAL.tubeRadius,ZC=ARRIVAL.tubeZ,ALPHA=Math.asin(ARRIVAL.doorWidth/2/R),Y0=.12,HG=3.0,TOP=Y0+HG,DOOR=ARRIVAL.doorHeight;
  const at=(phi,r,y)=>[r*Math.sin(phi),y,ZC+r*Math.cos(phi)];
  const band=(r,h,y,m,phi0=0,length=Math.PI*2)=>part(new THREE.CylinderGeometry(r,r,h,64,1,true,phi0,length),m,0,y,ZC);
  const flat=(r0,r1,y,m,phi0=0,length=Math.PI*2)=>{const n=part(new THREE.RingGeometry(r0,r1,64,1,phi0-Math.PI/2,length),m,0,y,ZC);n.rotation.x=-Math.PI/2;return n;};
  const sides=[[ALPHA,Math.PI-2*ALPHA],[Math.PI+ALPHA,Math.PI-2*ALPHA]];
  // Enamel plinth and cap with chrome bands; the plinth breaks at both thresholds.
  for(const [phi0,length] of sides){band(R+.22,Y0,Y0/2,enamel,phi0,length);flat(R-.06,R+.22,Y0,enamel,phi0,length);band(R+.23,.03,Y0-.015,chrome,phi0,length);}
  flat(R-.12,R+.06,.012,chrome);
  part(new THREE.CylinderGeometry(R+.2,R+.2,.18,64),enamel,0,TOP+.09,ZC);
  band(R+.23,.04,TOP+.02,chrome);band(R+.21,.04,TOP+.17,chrome);
  const halo=part(new THREE.TorusGeometry(R-.22,.025,10,72),lamp,0,TOP-.03,ZC);halo.rotation.x=Math.PI/2;
  // Fixed glass between the doorways and over each lintel; chrome bands, jambs and mullions.
  for(const [phi0,length] of sides)band(R+.03,HG,Y0+HG/2,clear,phi0,length);
  for(const door of [0,Math.PI]){band(R+.03,TOP-DOOR-Y0,(TOP+DOOR+Y0)/2,clear,door-ALPHA,2*ALPHA);band(R+.05,.05,DOOR+Y0+.02,chrome,door-ALPHA,2*ALPHA);}
  for(const y of [Y0+.03,1.08,2.16,TOP-.03])for(const [phi0,length] of sides)band(R+.05,.035,y,chrome,phi0,length);
  const post=(phi,w,d)=>{const n=part(new THREE.BoxGeometry(w,HG,d),chrome,...at(phi,R+.04,Y0+HG/2));n.rotation.y=phi;return n;};
  for(const phi of [ALPHA,-ALPHA,Math.PI-ALPHA,Math.PI+ALPHA])post(phi,.07,.09);
  for(const phi of [1.15,-1.15,Math.PI/2,-Math.PI/2,1.99,-1.99])post(phi,.045,.05);
  // The lift shaft behind the glass: dark stone arcs with lamp strips, and a ceiling over the cap.
  for(const [phi0,length] of sides)band(R+.5,3.5,1.75,shaft,phi0+.22,length-.44);
  const lid=part(new THREE.CircleGeometry(R+.55,64),ink,0,3.5,ZC);lid.rotation.x=Math.PI/2;
  for(const phi of [1.05,-1.05,2.1,-2.1])add(lamp,.03,2.9,.03,...at(phi,R+.46,1.75));
  // Door leaves: each doorway has two curved glass leaves with chrome meeting rails that slide
  // round behind the fixed glass. A leaf group turns about the tube axis from its doorway azimuth.
  const leaf=new THREE.CylinderGeometry(R,R,DOOR,18,1,true,0,ALPHA),rail=new THREE.BoxGeometry(.04,DOOR,.05);resources.add(leaf);resources.add(rail);
  const doorway=phi=>[-1,1].map(sign=>{
    const door=new THREE.Group();door.position.set(0,Y0+DOOR/2,ZC);door.rotation.y=phi;door.userData.doorway=phi;object.add(door);
    const pane=new THREE.Mesh(leaf,clear);pane.rotation.y=sign>0?0:-ALPHA;door.add(pane);
    const edge=new THREE.Mesh(rail,chrome);edge.position.set(0,0,R);edge.castShadow=true;door.add(edge);
    return door;
  });
  const frontDoors=doorway(Math.PI),rearDoors=doorway(0);
  // The clear width between a doorway's two leaves, in metres.
  const doorOpening=doors=>doors.reduce((width,door)=>width+R*Math.sin(Math.min(ALPHA,Math.abs(door.rotation.y-door.userData.doorway))),0);
  // The phase light: a ring and haze band that sweep the tube, a column of light over the
  // visitor's place, and a pool on the floor that brightens with them.
  const ringGroup=new THREE.Group();ringGroup.position.set(0,Y0,ZC);object.add(ringGroup);
  const hoop=part(new THREE.TorusGeometry(R-.08,.035,10,72),glow,0,0,0,ringGroup);hoop.rotation.x=Math.PI/2;
  part(new THREE.CylinderGeometry(R-.05,R-.05,.34,64,1,true),haze,0,0,0,ringGroup);
  const column=part(new THREE.CylinderGeometry(.46,.4,1,32,1,true).translate(0,.5,0),haze,0,Y0,ARRIVAL.carStop);
  const floorPool=part(new THREE.CircleGeometry(R-.1,64),pool,0,Y0+.01,ZC);floorPool.rotation.x=-Math.PI/2;
  ringGroup.visible=column.visible=false;
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
  // Lobby lift surround closes the gap around the tube without occluding entry.
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
  function label(text,w,h,x,y,z,{size=38,background=F.ink,color=F.light,turn=0,lookAt=null}={}){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;resources.add(texture);
    const m=new THREE.MeshBasicMaterial({map:texture});m.userData.nearCameraSolid=true;resources.add(m);const g=new THREE.PlaneGeometry(w,h);resources.add(g);
    const n=new THREE.Mesh(g,m);n.position.set(x,y,z);if(lookAt)n.lookAt(...lookAt);else n.rotation.y=turn;object.add(n);
    const write=value=>{ctx.fillStyle=background;ctx.fillRect(0,0,512,128);ctx.fillStyle=color;ctx.font=`500 ${size}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';const lines=value.split('\n');lines.forEach((line,i)=>ctx.fillText(line,256,64+(i-(lines.length-1)/2)*52));texture.needsUpdate=true;};write(text);return write;
  }
  if(facade)label('R I V E R   O A K S   ·   O F F I C E S',3.4,.42,0,3.83,8.315,{size:22});
  label('OFFICES  /  06',2.2,.4,0,3.65,4.12,{size:30,background:F.stone,color:F.ink});
  label('PRIVATE WORKSPACES',1.3,.22,0,3.19,4.13,{size:25,background:F.stone,color:F.ink});
  const display=label('G  ↑  06',.9,.3,0,2.97,ARRIVAL.frontPortalZ+.105,{size:40});
  label('06',.3,.3,1.25,1.15,4.21,{size:50});
  label('RIVER OAKS\n06  ·  OFFICES',1.16,.48,-2.484,2.1,6.3,{size:34,turn:Math.PI/2});
  // The conduit call pad on a mullion inside the tube, facing the visitor.
  const padPhi=1.99,padY=1.38,[px,py,pz]=at(padPhi,R-.02,padY);
  part(new THREE.CircleGeometry(.14,32),enamel,px,py,pz).lookAt(0,padY,ZC);
  part(new THREE.TorusGeometry(.14,.012,8,40),chrome,px,py,pz).lookAt(0,padY,ZC);
  label('C N D T',.2,.07,...at(padPhi,R-.045,padY),{size:44,background:F.tangerine,color:'#fff4e8',lookAt:[0,padY,ZC]});
  const transform=new THREE.Object3D();
  for(const[m,parts]of batches){const instances=new THREE.InstancedMesh(unit,m,parts.length);instances.castShadow=instances.receiveShadow=m!==glass&&m!==lamp;resources.add(instances);parts.forEach((part,i)=>{transform.position.fromArray(part.position);transform.scale.fromArray(part.size);transform.updateMatrix();instances.setMatrixAt(i,transform.matrix);});instances.computeBoundingSphere();object.add(instances);}
  let lastFloor=null;
  return {object,frontDoors,rearDoors,entryDoors,setEntryOpen,doorOpening,
    update(frame){
      const arriving=['opening','arriving','office'].includes(frame.phase),boarding=['lobby','boarding','closing'].includes(frame.phase);
      for(let i=0;i<2;i++){const sign=i?1:-1;frontDoors[i].rotation.y=Math.PI+sign*(arriving?frame.doors:0)*ALPHA;rearDoors[i].rotation.y=sign*(boarding?frame.doors:0)*ALPHA;}
      // The phase light sweeps up the tube and back down only while the visitor phases between floors.
      const ring=frame.phase==='ascending'?Math.max(0,Math.min(1,frame.ring??0)):0;
      ringGroup.visible=column.visible=ring>0;ringGroup.position.y=Y0+.06+ring*(HG-.14);column.scale.y=Math.max(.01,ring*(HG-.1));
      pool.opacity=.1+.3*ring;
      if(frame.floor!==lastFloor){lastFloor=frame.floor;display(frame.floor===6?'06  ·  OFFICES':`${frame.floor===1?'G':String(frame.floor).padStart(2,'0')}   ↑   06`);}
    },
    phaseLight(){return {lit:ringGroup.visible,ringHeight:ringGroup.position.y-Y0,columnHeight:column.visible?column.scale.y:0};},
    dispose,
    dimensions:ARRIVAL,
  };
  }catch(error){dispose();throw error;}
}

// Glass beside the arrival doorway (any layout but the windowless legacy room) would show this
// tube and lobby once the visitor has arrived, so from then on only the tube's front leaves stay
// drawn, closed in the doorway. Call update after the arrival's own update each frame; restore
// returns every part to the visibility it had, an already hidden part staying hidden.
export function arrivalBehindGlass(arrival,glazed) {
  const parts=glazed?arrival.object.children.filter(part=>!arrival.frontDoors?.includes(part)).map(part=>[part,part.visible]):[];
  return {
    update(frame){const arrived=frame.done&&parts.length>0;if(arrived)arrival.update({...frame,doors:0});for(const[part,visible]of parts)part.visible=visible&&!arrived;},
    restore(){for(const[part,visible]of parts)part.visible=visible;},
  };
}
