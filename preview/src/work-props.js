import * as THREE from 'three';
import { createArmContacts, placePalm } from './arm-contact.js';
import { fitSupportedHand } from './hand-support.js';
import { fitTabletTouch, tabletTouchPoint } from './tablet-touch.js';
import { fitPinchGrip, placePinch, pinchElbowPole } from './pinch-grip.js';
import { workerLoadCycle } from './worker-load-cycle.js';
import { createBlotterRest } from './blotter-rest.js';

const cache=new Map();
const palmZ=-0.15; // Fingers support the rear overhang, clear of a docked worktop.
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);};

function placeReleasedPalm(arm,point,frame,pole,release,alignPinch=0) {
  const elbow=()=>alignPinch?pole.clone().lerp(pinchElbowPole(arm,point,frame,pole),alignPinch*(1-release)):pole;
  if(!release)return placePalm(arm,point,frame,elbow());
  let actual;
  // An unloaded wrist relaxes relative to its forearm, not a fixed world-space
  // idle frame. Blend out the support bend as the palm clears the overhang,
  // re-solving the wrist offset to retain the withdrawal target.
  const limit=THREE.MathUtils.lerp(Math.PI/2,.20,smooth(release/.3));
  for(let iteration=0;iteration<8;iteration++) {
    actual=placePalm(arm,point,frame,elbow());
    const bend=arm.foot.quaternion.angleTo(arm.wristRest);
    if(bend<=limit+.001)break;
    const local=arm.wristRest.clone().slerp(arm.foot.quaternion,limit/bend);
    frame.copy(arm.calf.getWorldQuaternion(new THREE.Quaternion())).multiply(local).multiply(arm.frameToHand.clone().invert());
  }
  return actual;
}
export function workPropKind(theme, pose) {
  if(theme==='dining'&&pose==='carry')return 'tray';
  if(theme==='fashion'||theme==='leather')return 'fabric';
  if(theme==='jewelry')return 'jewelry';
  if(theme==='optician')return 'eyewear';
  if(theme==='perfumery')return 'blotter';
  if(theme==='salon'||theme==='gelato')return 'samples';
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
  } else if(kind==='samples'||kind==='blotter') {
    // Leave the paper hand's approach clear while preserving three samples.
    const positions=kind==='blotter'?[[.09,-.075],[0,0],[.09,0]]:[[-.09,0],[0,0],[.09,0]];
    for(const [i,[x,z]] of positions.entries()) {
      add(new THREE.CylinderGeometry(0.021,0.021,0.08,20),i%2?fabric:ceramic,[x,0.063,z]).name=`Sample bottle ${i+1}`;
      add(new THREE.CylinderGeometry(0.018,0.018,0.013,20),metal,[x,0.11,z]).name=`Sample cap ${i+1}`;
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
  const tops={counter:1.025,desk:0.76,reception:1.08,concession:1.04};
  let best=null;
  for(const fixture of room.fixtures) {
    if(!(fixture.kind in tops)||!Number.isFinite(fixture.d)||fixture.style==='host')continue;
    const depth=fixture.kind==='counter'?0.68:(fixture.l??0.65)+(fixture.kind==='desk'?0:0.06);
    const halfWidth=(fixture.w??1)/2-0.22,halfDepth=depth/2-0.015;
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
  const handPoses=new Map();
  for(const arm of arms) {
    const digits=[];
    avatar.model.traverse(bone=>{if(bone.isBone&&new RegExp(`^(thumb|index|middle|ring|pinky)_0[123]_${arm.side}$`).test(bone.name))digits.push({bone,relaxed:bone.quaternion.clone()});});
    handPoses.set(arm,digits);
  }
  // Move the sole supporting palm under the load when the other hand is busy.
  const supportX=arm=>kind==='blotter'&&arm.side==='l'?0.04:arm.side==='l'?0.13:-0.13;
  for(const arm of arms){
    const side=arm.side==='l'?1:-1,yaw=-side*THREE.MathUtils.degToRad(35);
    // Let the fingers angle inward with the forearms instead of bending both
    // wrists sideways to force parallel hands under the load.
    arm.grip=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);
    fitSupportedHand(avatar,arm,{halfWidth:0.18,halfDepth:0.125,palmX:supportX(arm),palmZ,yaw});
  }
  if(kind==='tablet')fitTabletTouch(avatar,arms.find(arm=>arm.side==='r'));
  if(kind==='blotter')fitPinchGrip(avatar,arms.find(arm=>arm.side==='r'));
  for(const digits of handPoses.values())for(const pose of digits)pose.grasp=pose.bone.quaternion.clone();
  const object=template(kind).clone();object.name=`Worker ${kind}`;holder.add(object);
  let strip=null;
  if(kind==='blotter') {
    if(!cache.has('strip')) {
      // Grasp the short end, leaving the paper clear of the flexed index knuckle.
      const geometry=new THREE.BoxGeometry(0.008,0.0006,0.12);geometry.translate(0,0,0.057);
      cache.set('strip',new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#fff8e5',roughness:0.92})));
    }
    strip=cache.get('strip').clone();strip.name='Scent strip';strip.userData.localId=holder.userData.localId;strip.castShadow=true;holder.add(strip);
  }
  object.traverse(item=>{item.userData.localId=holder.userData.localId;});
  let dock=spot.pose==='attend'?counterContact(room,spot,holder):null;
  if(dock) {
    const frame=holder.getWorldQuaternion(new THREE.Quaternion());
    const reachable=arms.filter(arm=>kind!=='blotter'||arm.side==='l').every(arm=>{
      const handFrame=frame.clone().multiply(arm.grip).multiply(arm.frameToHand);
      const contacts=kind==='tablet'&&arm.side==='r'?[0,3,4.2].map(tabletTouchPoint):[new THREE.Vector3(supportX(arm),0,palmZ)];
      return contacts.every(contact=>{
        const point=holder.localToWorld(dock.clone().add(contact));
        point.sub(arm.palmOffset.clone().applyQuaternion(handFrame));
        const distance=point.distanceTo(arm.thigh.getWorldPosition(new THREE.Vector3()));
        return distance<arm.upperLength+arm.lowerLength-0.04&&distance>Math.abs(arm.upperLength-arm.lowerLength)+0.04;
      });
    });
    if(!reachable||(kind==='tablet'&&dock.z<0.43))dock=null;
  }
  // Hold the load at chest height so the hands clear reception/host counters.
  const reach=Math.min(...arms.map(arm=>arm.upperLength+arm.lowerLength));
  const raised=new THREE.Vector3(0,kind==='tablet'?Math.max(Math.min(1.20,avatar.hipHeight+0.4),avatar.hipHeight+0.30):avatar.hipHeight+0.4,kind==='tablet'?0.48*Math.min(1,reach/0.44):0.32);
  let stripRest=null;
  if(strip&&dock) {
    // Fit the stand once to a relaxed grip at the existing inspection point.
    // Its pose is fixed to the tray; looking at a visitor never moves the stand.
    const arm=arms.find(arm=>arm.side==='r'),home=new THREE.Vector3(-.12,dock.y+.17,.40);
    const frame=holder.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI*.70,0,-.15)));
    placePinch(arm,holder.localToWorld(home.clone()),frame,holder.localToWorld(new THREE.Vector3(-.30,dock.y-.18,-.05)));
    stripRest={position:home.sub(dock),quaternion:holder.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(frame).normalize()};
    stripRest.stand=createBlotterRest(stripRest.position,stripRest.quaternion);
    stripRest.stand.model.traverse(item=>{item.userData.localId=holder.userData.localId;});
    object.add(stripRest.stand.model);
  }
  const rotation=new THREE.Quaternion();
  const contacts=[];
  return {kind,object,strip,contacts,docked:Boolean(dock),
    update(time,attention) {
      const {lift,release}=workerLoadCycle(time,Boolean(dock));
      const paperFree=smooth((lift-.45)/.55);
      object.position.copy(dock??raised);
      if(dock)object.position.lerp(raised,lift);
      // A small inspection tilt, but a loaded serving tray always stays level.
      object.rotation.z=kind==='tray'||kind==='blotter'?0:Math.sin(time*0.8)*0.025*lift*(1-attention);
      if(strip) {
        strip.position.set(-0.12,(dock?Math.max(object.position.y+0.025,dock.y+0.17):object.position.y+.18)+(dock?.18:.16)*lift,0.40-0.09*lift);
        if(stripRest) {
          const extraction=new THREE.Vector3(0,0,-.04*smooth(lift/.45)).applyQuaternion(stripRest.quaternion);
          strip.position.lerp(object.position.clone().add(stripRest.position).add(extraction),1-paperFree);
        }
        strip.rotation.set(-Math.PI*(0.70+0.12*lift),0,-0.15);
      }
      holder.updateWorldMatrix(true,true);object.getWorldQuaternion(rotation);
      contacts.length=0;
      for(const arm of arms) {
        const side=arm.side==='l'?1:-1;
        // Support the near edge where it overhangs the counter; palms never need
        // to pass through the solid worktop to pick up the load.
        const touching=kind==='tablet'&&arm.side==='r';
        const pinching=kind==='blotter'&&arm.side==='r';
        const withdrawn=release,retreat=smooth(withdrawn/.65),relax=smooth((withdrawn-.45)/.55);
        for(const pose of handPoses.get(arm))pose.bone.quaternion.slerpQuaternions(pose.grasp,pose.relaxed,relax);
        const point=pinching?strip.getWorldPosition(new THREE.Vector3()):object.localToWorld(touching?tabletTouchPoint(time):new THREE.Vector3(supportX(arm),0,palmZ));
        const loadTarget=point.clone();
        if(withdrawn) {
          holder.worldToLocal(point);
          if(pinching) {
            // Clear the paper's short end along its own plane before turning
            // toward the body. A world-backward pull cuts through tilted paper.
            point.addScaledVector(new THREE.Vector3(0,0,1).applyQuaternion(stripRest.quaternion),-.03*retreat);
            point.z-=.22*relax;
            point.y+=.05*Math.sin(Math.PI*relax);
          } else point.z-=.10*retreat;
          point.y-=.07*relax;
          point.x=THREE.MathUtils.lerp(point.x,side*.25,relax);
          holder.localToWorld(point);
        }
        const pole=holder.localToWorld(new THREE.Vector3(side*0.30,object.position.y+(touching||pinching?-0.18:-0.08),touching||pinching?-0.05:-0.12));
        const frame=(pinching?strip.getWorldQuaternion(new THREE.Quaternion()):rotation.clone()).multiply(arm.grip);
        let actual;
        if(pinching) {
          actual=placePinch(arm,point,frame,pole);
          if(dock) {
            const supportedFrame=rotation.clone().multiply(stripRest.quaternion);
            frame.slerp(supportedFrame,1-paperFree);
            // Once supported, paper no longer follows the withdrawing wrist.
            strip.quaternion.copy(holder.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(frame));
            // Keep the pinch orientation until the fingertips have cleared the
            // short end; rotating a still-near hand cuts across the paper.
            actual=placeReleasedPalm(arm,point,frame,pole,relax,1-paperFree);
          } else strip.quaternion.copy(holder.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(frame));
        } else actual=placeReleasedPalm(arm,point,frame,pole,withdrawn);
        contacts.push({side:arm.side,kind:pinching?'pinch':touching?'touch':'support',engaged:withdrawn<1e-6,release:withdrawn,loadTarget:loadTarget.toArray(),target:point.toArray(),actual:actual.toArray(),error:arm.error});
      }
    },
    dispose(){stripRest?.stand.dispose();object.removeFromParent();strip?.removeFromParent();},
  };
}
