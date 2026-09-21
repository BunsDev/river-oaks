import { batchCostumeAttachments } from './costume-batching.js';
import { applyAlienSpecies, GREY_SPECIES } from './alien-species.js';
import * as THREE from 'three';
import { createJevicaCostume } from './jevica-costume.js';
import { measureHead } from './head-fit.js';

const isSkin = name => /^(young|middleage|old)_/.test(name);
const isHair = name => /^(bob|short|ponytail|long|afro|curly)/.test(name);
const isEyes = name => /^brown/.test(name);

// Costumes are owned by the player clone; residents retain shared source geometry.
export function createPlayerCostume(avatar, form) {
  if (form === 'jevica') return createJevicaCostume(avatar);
  if (form === 'alien') {
    applyAlienSpecies(avatar.rig,'player-alien',GREY_SPECIES);
    for(const [original,material] of avatar.rig.materials)if(!isSkin(original.name)&&!isHair(original.name)&&!isEyes(original.name)){material.map=null;material.color.set('#141519');material.roughness=0.64;material.needsUpdate=true;}
    const head=avatar.rig.model.getObjectByName('head'),anatomy=head.children.find(child=>child.name.endsWith(' anatomy'));
    return {update(){},dispose(){anatomy?.removeFromParent();}};
  }
  if (form !== 'witch') throw new Error(`Unknown playable form: ${form}`);
  const { model, materials } = avatar.rig;
  const fit = measureHead(avatar.rig), { skull } = fit, [hx, hz] = skull.centre;
  const attachments = [], owned = new Set();
  const material = (color, extra = {}) => { const value = new THREE.MeshPhysicalMaterial({ color, roughness: 0.65, ...extra }); owned.add(value); return value; };
  const black = material('#080c12', { roughness: 0.48 });
  const purple = material('#0d1013', { roughness: 0.72, sheen: 0.55, sheenColor: new THREE.Color('#677079'), side: THREE.DoubleSide });
  const silver = material('#bdb7d3', { metalness: 0.7, roughness: 0.26 });
  const hair = material('#8c5c35', { roughness: 0.58 });
  model.updateMatrixWorld(true);
  const attach = name => {
    const bone = model.getObjectByName(name), group = new THREE.Group();
    const rest = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    avatar.object.add(group); attachments.push({ bone, group, rest }); return group;
  };
  const mesh = (group, geometry, surface, position, scale = [1, 1, 1], rotation = [0, 0, 0]) => {
    owned.add(geometry); const item = new THREE.Mesh(geometry, surface); item.position.fromArray(position); item.scale.fromArray(scale); item.rotation.set(...rotation); item.castShadow = item.receiveShadow = true; group.add(item); return item;
  };
  const hideHair = () => model.traverse(item => { if (item.isMesh && isHair(item.material?.name ?? '')) item.visible = false; });
  // Base rig materials per form: only the player's clone is recoloured.
  if (form !== 'visitor') for (const [original, surface] of materials) {
    const name = original.name;
    if (isEyes(name)) continue;
    if (form === 'witch') { if (isSkin(name)) {surface.map=null;surface.color.set('#547c42');surface.roughness=0.66;} else if (isHair(name)) surface.color.set('#111416'); else { surface.map = null; surface.color.set('#15191c'); surface.roughness = 0.6; } }
    surface.needsUpdate = true;
  }
  {
    avatar.object.scale.set(0.88, 1.08, 0.93);
    const head = attach('head');
    const brimY = skull.top - 0.015, crownR = Math.max(0.10,skull.radius + 0.008);
    const brimGeometry=new THREE.CylinderGeometry(crownR+0.11,crownR+0.12,0.022,80),brimVertices=brimGeometry.attributes.position;
    for(let i=0;i<brimVertices.count;i++){const angle=Math.atan2(brimVertices.getZ(i),brimVertices.getX(i));brimVertices.setY(i,brimVertices.getY(i)+Math.sin(angle*2)*0.01+Math.sin(angle*40)*0.0015);}
    brimGeometry.computeVertexNormals();const brim=mesh(head,brimGeometry,purple,[hx,brimY,hz]);brim.name='Fitted witch hat brim';
    const coneGeometry=new THREE.ConeGeometry(crownR,0.46,80,24),coneVertices=coneGeometry.attributes.position;
    for(let i=0;i<coneVertices.count;i++){const y=coneVertices.getY(i),t=(y+0.23)/0.46,angle=Math.atan2(coneVertices.getZ(i),coneVertices.getX(i)),rib=1+Math.cos(angle*40)*0.035;coneVertices.setXYZ(i,coneVertices.getX(i)*rib-0.055*t*t,y,coneVertices.getZ(i)*rib);}
    coneGeometry.computeVertexNormals();mesh(head,coneGeometry,purple,[hx,brimY+0.23,hz]);
    for(const t of [0.05,0.25,0.47,0.71])mesh(head,new THREE.TorusGeometry(crownR*(1-t)+0.004,0.0035,6,64),black,[hx-0.055*t*t,brimY+t*0.46,hz],[1,1,1],[Math.PI/2,0,0]);
    hideHair();
    for(let lock=0;lock<12;lock++) {
      const x=(lock-5.5)*0.018,curve=new THREE.CatmullRomCurve3([new THREE.Vector3(hx+x,brimY-0.025,hz-0.06),new THREE.Vector3(hx+x*1.2,brimY-0.2,hz-0.115),new THREE.Vector3(hx+x*1.3+0.09,brimY-0.42,hz-0.19),new THREE.Vector3(hx+x+0.16,brimY-0.51,hz-0.16)]);
      mesh(head,new THREE.TubeGeometry(curve,20,0.015,7,false),black,[0,0,0]);
    }
    const waist = attach('spine_01');
    const robe = new THREE.LatheGeometry(Array.from({ length: 25 }, (_, i) => { const t = i / 24; return new THREE.Vector2(0.34 - 0.18 * t, -0.91 + t * 1.04); }), 64);
    const points = robe.attributes.position;
    for (let i = 0; i < points.count; i++) { const x = points.getX(i), z = points.getZ(i), fold = 1 + 0.05 * Math.sin(Math.atan2(z, x) * 16); points.setXYZ(i, x * fold, points.getY(i), z * fold); }
    robe.computeVertexNormals(); mesh(waist, robe, purple, [0, 0, 0]);
    const shoulders = attach('spine_03');
    const cape = new THREE.LatheGeometry([new THREE.Vector2(0.43, -0.77), new THREE.Vector2(0.36, -0.3), new THREE.Vector2(0.28, 0.18), new THREE.Vector2(0.095, 0.29)], 48, Math.PI / 2, Math.PI);
    const velvet = material('#121619', { roughness: 0.78, side: THREE.DoubleSide, sheen: 0.7, sheenColor: new THREE.Color('#627076') });
    const capeVertices=cape.attributes.position;
    for(let i=0;i<capeVertices.count;i++) {
      const y=capeVertices.getY(i),angle=Math.atan2(capeVertices.getX(i),capeVertices.getZ(i)),t=THREE.MathUtils.clamp((0.29-y)/1.06,0,1);
      const fold=1+Math.sin(angle*14)*0.07*t;
      capeVertices.setXYZ(i,capeVertices.getX(i)*fold,y+0.06*t*t*Math.cos(angle*3),capeVertices.getZ(i)*fold-0.12*t*t);
    }
    cape.computeVertexNormals();mesh(shoulders, cape, velvet, [0, 0, -0.025]);
    mesh(shoulders, new THREE.OctahedronGeometry(0.028), silver, [0, 0.16, 0.135], [0.65, 1, 0.5]);
    const hand = attach('hand_l');
    mesh(hand, new THREE.CylinderGeometry(0.013, 0.021, 1.25, 12), hair, [0, -0.18, 0]);
    for (let i = 0; i < 24; i++) { const angle = i * 2.39996; const bristle = mesh(hand, new THREE.CylinderGeometry(0.004, 0.007, 0.36, 5), hair, [Math.cos(angle) * 0.055, -0.83, Math.sin(angle) * 0.055]); bristle.rotation.z = Math.sin(angle) * 0.13; }
    hand.userData.heldBroom = true;
  }
  batchCostumeAttachments(attachments, owned);
  const position = new THREE.Vector3(), orientation = new THREE.Quaternion(), inverse = new THREE.Quaternion();
  return {
    update(flying = false) {
      attachments.forEach(({ group }) => { if (group.userData.heldBroom) group.visible = !flying; });
      avatar.object.updateWorldMatrix(true, true); inverse.copy(avatar.object.getWorldQuaternion(orientation)).invert();
      for (const item of attachments) {
        item.bone.getWorldPosition(position); item.group.position.copy(avatar.object.worldToLocal(position));
        item.bone.getWorldQuaternion(orientation); item.group.quaternion.copy(inverse).multiply(orientation).multiply(item.rest);
      }
    },
    dispose() { attachments.forEach(({ group }) => group.removeFromParent()); owned.forEach(item => item.dispose()); },
  };
}
