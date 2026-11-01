import { batchCostumeAttachments } from './costume-batching.js';
import * as THREE from 'three';
import { createJevicaDrape } from './jevica-drape.js';
import { fitJevicaBodice } from './bodice-fitting.js';
import { applyHairOmbre, applyJevicaMakeup, createJevicaSuit, shapeJevicaPumps } from './jevica-suit.js';

// One hero costume: Val's 2026-10-29 reference look (jevica-suit.js). Shared
// resident geometry and textures are never mutated.
export function createJevicaCostume(avatar) {
  const { model, materials } = avatar.rig;
  const owned = new Set(), attachments = [];
  const surface = parameters => {
    const material = new THREE.MeshPhysicalMaterial(parameters);
    owned.add(material);
    return material;
  };
  const gold = surface({color:'#d9a07a', metalness:0.9, roughness:0.26});
  const crystal = surface({color:'#fff5ee', roughness:0.08, metalness:0.08, clearcoat:1, ior:1.8, transmission:0.35, thickness:0.012});
  crystal.name='Jevica jewel crystals';
  for (const [original, material] of materials) {
    if (/^young_/.test(original.name)) {
      material.color.set('#ffffff'); material.roughness = 0.58; material.envMapIntensity = 0.65;
    }
    if (original.name === 'long01') applyHairOmbre(model, material, owned);
    if (original.name === 'jevica_brows') {
      material.alphaTest = 0.4; material.transparent = false; material.depthWrite = true;
      material.roughness = 0.8;
      // Warm, softly defined brows retain the source strand coverage and alpha.
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
          #include <map_fragment>
          float browStrand = clamp(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
          diffuseColor.rgb = mix(vec3(0.09, 0.039, 0.015), vec3(0.21, 0.12, 0.05), browStrand);
        `);
      };
      material.customProgramCacheKey = () => 'jevica-soft-brows-v1';
    }
    if (original.name === 'shoes01') {
      // Glossy pink pumps; jevica-suit.js adds the heels.
      // The shoe texture is a dark leather; a flat glossy pink reads as the reference's satin pumps.
      material.map = null; material.color.set('#ee86b4'); material.roughness = 0.22; material.metalness = 0.1; material.envMapIntensity = 1;
      shapeJevicaPumps(model, material, owned);
    }
    if (original.name === 'jevica_silk') {
      model.traverse(item => {
        if (!item.isMesh || item.material !== material) return;
        // Follow the fitted neckline in bind space; skinning then carries the
        // blouse with the torso instead of leaving a floating rigid collar.
        item.geometry=item.geometry.clone();owned.add(item.geometry);
        fitJevicaBodice(model,item);
      });
    }
    material.needsUpdate = true;
  }
  model.updateMatrixWorld(true);
  const attach = name => {
    const bone = model.getObjectByName(name), group = new THREE.Group();
    const rest = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    avatar.object.add(group); attachments.push({bone, group, rest}); return group;
  };
  const mesh = (group, geometry, material, position, scale = [1,1,1]) => {
    owned.add(geometry);
    const object = new THREE.Mesh(geometry, material);
    object.position.fromArray(position); object.scale.fromArray(scale);
    object.castShadow = object.receiveShadow = true; group.add(object); return object;
  };
  const suit = createJevicaSuit(avatar, {surface, owned, attach, mesh});
  const makeup = applyJevicaMakeup(model, owned);
  const head = attachments.find(item => item.bone.name === 'head').group;
  // A crystal drop under each earring flower keeps the close-up refraction rule below.
  for (const earring of suit.pieces.earrings) {
    const drop = mesh(earring.group, new THREE.OctahedronGeometry(0.006), crystal, [0, -.037, 0], [0.65, 1.6, 0.7]);
    drop.name = 'Jevica earring drop';
  }
  // The star wand stays for spell emission (getWandTip) but is only shown while casting.
  const hand = attach('hand_r');
  const starlight=surface({color:'#fff3fa',emissive:'#ffabd7',emissiveIntensity:3,roughness:.2});
  mesh(hand,new THREE.CylinderGeometry(0.003,0.0025,0.69,12),gold,[0,0.24,0.03]);
  mesh(hand,new THREE.IcosahedronGeometry(0.014,2),starlight,[0,0.60,0.03]);
  for(let i=0;i<12;i++) {
    const angle=i/12*Math.PI*2,length=i%3===0?.085:.042;
    const spike=mesh(hand,new THREE.ConeGeometry(.003,length,4),starlight,[Math.sin(angle)*length/2,.60+Math.cos(angle)*length/2,.03]);spike.rotation.z=-angle;
  }
  const glowSize=64,glowPixels=new Uint8Array(glowSize*glowSize*4);
  for(let y=0;y<glowSize;y++)for(let x=0;x<glowSize;x++) {
    const r=Math.hypot((x+.5)/glowSize*2-1,(y+.5)/glowSize*2-1);
    glowPixels.set([255,155,210,Math.round(150*Math.pow(Math.max(0,1-r),3))],(y*glowSize+x)*4);
  }
  const glowMap=new THREE.DataTexture(glowPixels,glowSize,glowSize);glowMap.needsUpdate=true;owned.add(glowMap);
  const glowMaterial=new THREE.SpriteMaterial({map:glowMap,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});owned.add(glowMaterial);
  const glow=new THREE.Sprite(glowMaterial);glow.position.set(0,.60,.03);glow.scale.setScalar(.38);
  // Light has no solid surface for the district ambient-occlusion depth pass.
  glow.userData.aoExclude=true;hand.add(glow);hand.visible=false;
  const drape=suit.pieces.waist?createJevicaDrape(avatar,suit.pieces.waist,suit.skirts):{update(){}};
  batchCostumeAttachments(attachments, owned);
  const position = new THREE.Vector3(), orientation = new THREE.Quaternion(), inverse = new THREE.Quaternion();
  const opticalPosition=new THREE.Vector3(),opticalScale=new THREE.Vector3();
  const reducedMotion=globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
  return {
    get suit() {return suit.pieces;},
    get makeup() {return makeup;},
    getWandTip(target) {return glow.getWorldPosition(target);},
    updateOptics(camera,viewportHeight) {
      if(!camera||!Number.isFinite(viewportHeight)||viewportHeight<=0)return;
      camera.updateWorldMatrix(true,false);
      head.getWorldPosition(opticalPosition).applyMatrix4(camera.matrixWorldInverse);
      head.getWorldScale(opticalScale);
      // The largest individual jewel is a 32 mm earring. Keep its reflection,
      // facets and clearcoat at every distance, and smoothly restore refraction
      // when it spans 8–16 CSS pixels, consistently across display densities.
      // A nonzero transmission otherwise
      // asks Three to draw the entire opaque district again for these tiny gems.
      const diameter=.032*Math.max(opticalScale.x,opticalScale.y,opticalScale.z);
      const pixels=diameter*viewportHeight*.5*camera.projectionMatrix.elements[5]/Math.max(.01,-opticalPosition.z);
      crystal.transmission=.35*THREE.MathUtils.smoothstep(pixels,8,16);
    },
    update(_flying, now, riding=false, {casting=false}={}) {
      hand.visible=Boolean(casting)&&!riding;
      avatar.object.updateWorldMatrix(true, true);
      inverse.copy(avatar.object.getWorldQuaternion(orientation)).invert();
      for (const item of attachments) {
        item.bone.getWorldPosition(position); item.group.position.copy(avatar.object.worldToLocal(position));
        item.bone.getWorldQuaternion(orientation); item.group.quaternion.copy(inverse).multiply(orientation).multiply(item.rest);
      }
      avatar.object.updateWorldMatrix(true,true);
      suit.swing(now,reducedMotion);
      drape.update(now,riding);
    },
    dispose() { suit.dispose(); attachments.forEach(({group}) => group.removeFromParent()); owned.forEach(item => item.dispose()); },
  };
}
