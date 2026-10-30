import * as THREE from 'three';
import { batchCostumeAttachments } from './costume-batching.js';
import { loadAvatarTemplate } from './avatars.js';
import { createPrinceShoppingBag } from './prince-shopping-bag.js';

export async function loadPrinceSkinTexture() {
  const source=await loadAvatarTemplate('man-casual');let texture=null;
  source.scene.traverse(mesh=>{if(/^young_/.test(mesh.material?.name??''))texture=mesh.material.map;});
  return texture;
}

const TORSO = /^(spine_0[123]|pelvis)$/;
const ANGLES = 48, BAND = 0.01;

// Radial profile of the tunic around the torso at rest, in the avatar root's
// frame (y up, z forward). Accessories are fitted to it instead of guessed, so
// the belt and buckle sit on the cloth for any rig proportions.
export function measureTorso(avatar, root) {
  const { model } = avatar;
  model.updateMatrixWorld(true); root.updateMatrixWorld(true);
  const vertex = new THREE.Vector3(), points = [];
  model.traverse(item => {
    if (!item.isSkinnedMesh || !/suit|tunic/i.test(item.material?.name ?? '')) return;
    item.skeleton.update();
    const torso = new Set(item.skeleton.bones.map((bone, i) => TORSO.test(bone.name) ? i : -1).filter(i => i >= 0));
    const { position, skinIndex, skinWeight } = item.geometry.attributes;
    for (let i = 0; i < position.count; i++) {
      let weight = 0;
      for (let k = 0; k < 4; k++) if (torso.has(skinIndex.getComponent(i, k))) weight += skinWeight.getComponent(i, k);
      if (weight < 0.8) continue;
      vertex.fromBufferAttribute(position, i);
      item.applyBoneTransform(i, vertex).applyMatrix4(item.matrixWorld);
      root.worldToLocal(vertex); points.push(vertex.toArray());
    }
  });
  if (points.length < 50) return null;
  const bottom = Math.min(...points.map(p => p[1])), top = Math.max(...points.map(p => p[1]));
  const bands = Math.ceil((top - bottom) / BAND) + 1;
  const centres = Array.from({ length: bands }, () => [Infinity, -Infinity, Infinity, -Infinity]);
  for (const [x, y, z] of points) {
    const c = centres[Math.floor((y - bottom) / BAND)];
    c[0] = Math.min(c[0], x); c[1] = Math.max(c[1], x); c[2] = Math.min(c[2], z); c[3] = Math.max(c[3], z);
  }
  const axis = centres.map(c => Number.isFinite(c[0]) ? [(c[0] + c[1]) / 2, (c[2] + c[3]) / 2] : null);
  for (let i = 0; i < bands; i++) axis[i] ??= axis.slice(0, i).reverse().find(Boolean) ?? axis.find(Boolean);
  const raw = axis.map(c => [...c]);
  for (let i = 0; i < bands; i++) {
    const near = raw.slice(Math.max(0, i - 4), i + 5);
    axis[i] = [near.reduce((sum, c) => sum + c[0], 0) / near.length, near.reduce((sum, c) => sum + c[1], 0) / near.length];
  }
  const radii = Array.from({ length: bands }, () => new Float32Array(ANGLES));
  for (const [x, y, z] of points) {
    const b = Math.floor((y - bottom) / BAND), [cx, cz] = axis[b];
    const a = ((Math.round((Math.atan2(x - cx, z - cz) / (Math.PI * 2)) * ANGLES) % ANGLES) + ANGLES) % ANGLES;
    radii[b][a] = Math.max(radii[b][a], Math.hypot(x - cx, z - cz));
  }
  fillAndSmooth(radii, bands);
  // Bilinear lookup keeps sewn edges straight between angular samples.
  const surface = (angle, height, offset = 0.012) => {
    const fb = THREE.MathUtils.clamp((height - bottom) / BAND - 0.5, 0, bands - 1), b0 = Math.floor(fb), b1 = Math.min(bands - 1, b0 + 1), tb = fb - b0;
    const fa = ((angle / (Math.PI * 2)) * ANGLES % ANGLES + ANGLES) % ANGLES, a0 = Math.floor(fa) % ANGLES, a1 = (a0 + 1) % ANGLES, ta = fa - Math.floor(fa);
    const at = b => (radii[b][a0] || 0.14) * (1 - ta) + (radii[b][a1] || 0.14) * ta;
    const r = at(b0) * (1 - tb) + at(b1) * tb + offset;
    const cx = axis[b0][0] * (1 - tb) + axis[b1][0] * tb, cz = axis[b0][1] * (1 - tb) + axis[b1][1] * tb;
    return new THREE.Vector3(cx + Math.sin(angle) * r, height, cz + Math.cos(angle) * r);
  };
  const project = (point, offset = 0.012) => {
    const b = THREE.MathUtils.clamp(Math.floor((point.y - bottom) / BAND), 0, bands - 1), [cx, cz] = axis[b];
    return surface(Math.atan2(point.x - cx, point.z - cz), point.y, offset);
  };
  return { bottom, top, surface, project };
}

// Fill sparse samples from angular neighbours, then from the band below, and
// blur: lapels, pockets and seams make raw maxima jagged, and a sewn strap
// follows the smooth outer envelope.
function fillAndSmooth(radii, bands) {
  for (let b = 0; b < bands; b++) for (let pass = 0; pass < 6; pass++) for (let a = 0; a < ANGLES; a++) {
    if (radii[b][a]) continue;
    radii[b][a] = Math.max(radii[b][(a + 1) % ANGLES], radii[b][(a + ANGLES - 1) % ANGLES]) || (b ? radii[b - 1][a] : 0);
  }
  for (let pass = 0; pass < 10; pass++) {
    const next = radii.map(row => new Float32Array(row));
    for (let b = 0; b < bands; b++) for (let a = 0; a < ANGLES; a++) {
      let sum = 0, weight = 0;
      for (let db = -1; db <= 1; db++) for (let da = -1; da <= 1; da++) {
        const row = radii[b + db]; if (!row) continue;
        const w = (db ? 0.5 : 1) * (da ? 0.5 : 1); sum += row[(a + da + ANGLES) % ANGLES] * w; weight += w;
      }
      next[b][a] = Math.max(sum / weight, radii[b][a] * 0.97);
    }
    radii.splice(0, bands, ...next);
  }
}

// Radial profile of the garment around one limb bone (forearm, calf), in the
// avatar root's frame: t runs along the bone from its joint toward its child,
// angle around that axis. Bracers and sandal straps are fitted to it.
export function measureLimb(avatar, root, boneName, pattern = /suit|tunic/i) {
  const { model } = avatar;
  model.updateMatrixWorld(true); root.updateMatrixWorld(true);
  const bone = model.getObjectByName(boneName), child = bone?.children.find(item => item.isBone) ?? bone?.children[0];
  if (!bone || !child) return null;
  const origin = root.worldToLocal(bone.getWorldPosition(new THREE.Vector3())), axis = root.worldToLocal(child.getWorldPosition(new THREE.Vector3())).sub(origin);
  const length = axis.length(); axis.normalize();
  const u = new THREE.Vector3().crossVectors(axis, Math.abs(axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)).normalize();
  const w = new THREE.Vector3().crossVectors(axis, u).normalize();
  const vertex = new THREE.Vector3(), radial = new THREE.Vector3(), samples = [];
  model.traverse(item => {
    if (!item.isSkinnedMesh || !pattern.test(item.material?.name ?? '')) return;
    const index = item.skeleton.bones.findIndex(entry => entry.name === boneName);
    if (index < 0) return;
    item.skeleton.update();
    const { position, skinIndex, skinWeight } = item.geometry.attributes;
    for (let i = 0; i < position.count; i++) {
      let weight = 0;
      for (let k = 0; k < 4; k++) if (skinIndex.getComponent(i, k) === index) weight += skinWeight.getComponent(i, k);
      if (weight < 0.5) continue;
      vertex.fromBufferAttribute(position, i);
      item.applyBoneTransform(i, vertex).applyMatrix4(item.matrixWorld);
      root.worldToLocal(vertex).sub(origin);
      const t = vertex.dot(axis); radial.copy(vertex).addScaledVector(axis, -t);
      samples.push([Math.atan2(radial.dot(w), radial.dot(u)), t, radial.length()]);
    }
  });
  if (samples.length < 40) return null;
  const bottom = Math.min(...samples.map(s => s[1])), top = Math.max(...samples.map(s => s[1]));
  const bands = Math.ceil((top - bottom) / BAND) + 1, radii = Array.from({ length: bands }, () => new Float32Array(ANGLES));
  for (const [angle, t, r] of samples) {
    const b = Math.floor((t - bottom) / BAND), a = ((Math.round(angle / (Math.PI * 2) * ANGLES) % ANGLES) + ANGLES) % ANGLES;
    radii[b][a] = Math.max(radii[b][a], r);
  }
  fillAndSmooth(radii, bands);
  const radiusAt = (angle, t) => {
    const fb = THREE.MathUtils.clamp((t - bottom) / BAND - 0.5, 0, bands - 1), b0 = Math.floor(fb), b1 = Math.min(bands - 1, b0 + 1), tb = fb - b0;
    const fa = ((angle / (Math.PI * 2)) * ANGLES % ANGLES + ANGLES) % ANGLES, a0 = Math.floor(fa) % ANGLES, a1 = (a0 + 1) % ANGLES, ta = fa - Math.floor(fa);
    const at = b => (radii[b][a0] || 0.05) * (1 - ta) + (radii[b][a1] || 0.05) * ta;
    return at(b0) * (1 - tb) + at(b1) * tb;
  };
  const surface = (angle, t, offset = 0.006) => {
    const r = radiusAt(angle, t) + offset;
    return new THREE.Vector3().copy(origin).addScaledVector(axis, t).addScaledVector(u, Math.cos(angle) * r).addScaledVector(w, Math.sin(angle) * r);
  };
  const project = (point, offset = 0.006) => {
    const v = point.clone().sub(origin), t = v.dot(axis); radial.copy(v).addScaledVector(axis, -t);
    return surface(Math.atan2(radial.dot(w), radial.dot(u)), t, offset);
  };
  return { origin, axis, length, bottom, top, radiusAt, surface, project };
}

// A flat strap: a centre line of points on a surface, each with an across
// direction, re-seated on the surface at both edges so the band hugs the cloth.
function strap(centres, width, project, offset, closed = false) {
  const positions = [], uvs = [], indices = [], count = centres.length;
  for (let i = 0; i < count; i++) {
    const { point, across } = centres[i];
    for (const edge of [-width / 2, width / 2]) { positions.push(...project(point.clone().addScaledVector(across, edge), offset).toArray()); uvs.push(i / (count - 1) * 8, edge > 0 ? 1 : 0); }
    if (i < count - 1 || closed) { const a = i * 2, b = closed ? ((i + 1) % count) * 2 : a + 2; indices.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

// Label a garment mesh's connected pieces (the suit is one mesh for jacket and
// trousers; the boots are bodies, shafts and laces) with a per-vertex attribute
// on a private geometry clone, so one shader can dress each piece differently.
export function labelGarmentPieces(mesh, classify) {
  const geometry = mesh.geometry.clone(), { position } = geometry.attributes, index = geometry.index?.array ?? Array.from({ length: position.count }, (_, i) => i);
  const parent = Int32Array.from({ length: position.count }, (_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < index.length; i += 3) { const a = find(index[i]); parent[find(index[i + 1])] = a; parent[find(index[i + 2])] = a; }
  const seams = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`;
    if (seams.has(key)) parent[find(i)] = find(seams.get(key)); else seams.set(key, i);
  }
  const pieces = new Map();
  for (let i = 0; i < position.count; i++) {
    const root = find(i); let piece = pieces.get(root);
    if (!piece) { piece = { count: 0, box: new THREE.Box3() }; pieces.set(root, piece); }
    piece.count++; piece.box.expandByPoint(new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)));
  }
  const labels = new Map([...pieces].map(([root, piece]) => [root, classify(piece)]));
  const attribute = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) attribute[i] = labels.get(find(i));
  geometry.setAttribute('garment', new THREE.BufferAttribute(attribute, 1));
  return { geometry, pieces: [...pieces.values()].map(piece => ({ ...piece, label: classify(piece) })) };
}

// Mint scrollwork for the placket and hem corners: tileable sine stems with
// paired leaves, drawn into a data texture so it works without a DOM.
function scrollTexture() {
  const size = 128, data = new Uint8Array(size * size * 4);
  const mark = (u, v, radius) => {
    const x = u * size, y = v * size;
    for (let py = Math.floor(y - radius); py <= Math.ceil(y + radius); py++) for (let px = Math.floor(x - radius); px <= Math.ceil(x + radius); px++) {
      const coverage = THREE.MathUtils.clamp(radius + 0.5 - Math.hypot(px - x, py - y), 0, 1), i = (((py % size) + size) % size * size + ((px % size) + size) % size) * 4;
      data[i] = Math.max(data[i], Math.round(coverage * 255));
    }
  };
  for (let i = 0; i <= 400; i++) {
    const t = i / 400;
    mark(0.5 + 0.18 * Math.sin(t * Math.PI * 4), t, 1.6);
    for (const side of [-1, 1]) for (let leaf = 0; leaf < 4; leaf++) {
      const start = leaf / 4 + 0.08, local = (t - start) / 0.14;
      if (local < 0 || local > 1) continue;
      mark(0.5 + 0.18 * Math.sin(start * Math.PI * 4) + side * 0.22 * Math.sin(local * Math.PI), start + local * 0.09 + 0.02 * Math.sin(local * Math.PI * 2), 1.3);
    }
  }
  for (let i = 0; i < size * size; i++) { data[i * 4 + 1] = data[i * 4 + 2] = data[i * 4]; data[i * 4 + 3] = 255; }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

// Rose gold with engraved mint lines, for the bracers.
function engravingTexture() {
  const width = 128, height = 32, data = new Uint8Array(width * height * 4), rose = [201, 134, 90], mint = [159, 212, 196];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width, v = y / height;
    const band = Math.abs(v - 0.5) < 0.2 && (Math.abs(Math.sin(u * Math.PI * 8) * 0.14 + 0.5 - v) < 0.035 || Math.abs(Math.sin(u * Math.PI * 8 + Math.PI) * 0.14 + 0.5 - v) < 0.035);
    const edge = Math.abs(v - 0.1) < 0.03 || Math.abs(v - 0.9) < 0.03;
    const colour = band ? mint : edge ? [168, 108, 72] : rose;
    data.set([...colour, 255], (y * width + x) * 4);
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  return texture;
}

const lozenge = (x, y) => { const shape = new THREE.Shape(); shape.moveTo(0, y); shape.lineTo(x, 0); shape.lineTo(0, -y); shape.lineTo(-x, 0); shape.closePath(); return shape; };

// The art direction is the 2026-10-29 reference (preview/public/assets/
// characters/references/jev-angel-tunic-20261029.png, supplied by Val): a
// cream tunic with a pink placket in rose-gold trim and mint scrollwork, a
// rose-gold belt with a lozenge buckle, rose-gold bracers, pink trousers,
// rose-gold gladiator sandals over bare feet, caramel curls and blue eyes.
// Shared resident templates are never mutated: the avatar already owns cloned
// materials, garment geometry is cloned here, and every added resource is disposed.
export const PRINCE_PALETTE = Object.freeze({ cream: '#e9d4ad', pink: '#d4557a', roseGold: '#b86f45', mint: '#8cc7b4', hair: '#9a6530', hairLight: '#d0a060', skin: '#e2b08e', iris: '#4f86c6' });
const TUNIC_HEM = 0.943, NECKLINE = 1.535;

export function createPrinceCostume(avatar,{skinTexture=null}={}) {
  const { model, materials } = avatar.rig, root = avatar.object;
  const owned = new Set(), attachments = [];
  const surface = parameters => { const material = new THREE.MeshPhysicalMaterial(parameters); owned.add(material); return material; };
  // Straps and the belt are thin bands whose winding follows the surface they are
  // seated on; both faces draw so no band is culled from the outside.
  const roseGold = surface({ color: PRINCE_PALETTE.roseGold, metalness: 0.6, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.25, side: THREE.DoubleSide });
  roseGold.name = 'Prince Jev rose gold';
  const engraving = engravingTexture(); owned.add(engraving);
  const bracerMetal = surface({ color: '#e8d6c8', map: engraving, metalness: 0.6, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.25, side: THREE.DoubleSide });
  bracerMetal.name = 'Prince Jev engraved bracer';
  const scroll = scrollTexture(); owned.add(scroll);
  const bind = new THREE.Vector3(), handL = new THREE.Vector3(), handR = new THREE.Vector3();
  model.updateMatrixWorld(true);
  // Cuffs sit where the sleeves meet the hands in bind space.
  for (const [name, target] of [['hand_l', handL], ['hand_r', handR]]) model.getObjectByName(name)?.getWorldPosition(target);
  const inverse = model.matrixWorld.clone().invert(); handL.applyMatrix4(inverse); handR.applyMatrix4(inverse);
  const pieceClones = [];

  for (const [original, material] of materials) {
    const name = original.name ?? '';
    if (/suit/i.test(name)) {
      // One suit mesh is the tunic (its jacket piece) and the trousers (its
      // trouser piece): the piece label and the bind-space position choose the
      // cloth, placket, trim and scrollwork per fragment.
      const tunic = surface({ map: material.map, normalMap: material.normalMap, normalScale: new THREE.Vector2(0.55, 0.55), color: PRINCE_PALETTE.cream, roughness: 0.78, metalness: 0,
        sheen: 0.18, sheenColor: new THREE.Color('#fff2dc'), sheenRoughness: 0.7 });
      tunic.name = 'Prince Jev cream tunic';
      tunic.onBeforeCompile = shader => {
        shader.uniforms.princeScroll = { value: scroll }; shader.uniforms.princeHem = { value: TUNIC_HEM }; shader.uniforms.princeNeck = { value: NECKLINE };
        shader.uniforms.princeHandL = { value: handL }; shader.uniforms.princeHandR = { value: handR };
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
attribute float garment;varying float vGarment;varying vec3 vBind;varying vec3 vBindNormal;`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
vGarment=garment;vBind=position;vBindNormal=normal;`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D princeScroll;uniform float princeHem;uniform float princeNeck;uniform vec3 princeHandL;uniform vec3 princeHandR;
varying float vGarment;varying vec3 vBind;varying vec3 vBindNormal;`)
          .replace('#include <map_fragment>', `#include <map_fragment>
float princeLuma=clamp(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))/.86,0.,1.);
float princeWeave=mix(.84,1.0,princeLuma);
vec3 princeCream=vec3(.914,.831,.678),princePink=vec3(.831,.333,.478),princeRose=vec3(.722,.435,.271),princeMint=vec3(.549,.78,.706);
float princeTunic=step(.5,vGarment),princeFront=smoothstep(0.,.3,vBindNormal.z),princeAx=abs(vBind.x);
// The placket widens into a V toward the neckline; its trim follows the edge.
float princeHalf=.022+max(0.,vBind.y-1.4)*.42;
float princeCentre=princeTunic*princeFront*step(princeHem+.05,vBind.y)*step(vBind.y,princeNeck+.03);
float princePlacket=princeCentre*step(princeAx,princeHalf);
float princeTrim=clamp(princeCentre*step(princeHalf,princeAx)*step(princeAx,princeHalf+.012)+princeTunic*princeFront*step(princeNeck,vBind.y)*step(princeAx,princeHalf+.012)+princeTunic*step(vBind.y,princeHem+.028)
  +princeTunic*(step(distance(vBind,princeHandL),.075)+step(distance(vBind,princeHandR),.075)),0.,1.);
float princeMotif=texture2D(princeScroll,vec2(vBind.x*5.+.5,vBind.y*3.5)).r*clamp(princePlacket+princeTunic*princeFront*step(vBind.y,princeHem+.11)*step(.05,princeAx)*step(princeAx,.17),0.,1.);
vec3 princeCloth=mix(princePink,princeCream,princeTunic)*princeWeave;
princeCloth=mix(princeCloth,princePink*princeWeave,princePlacket);
princeCloth=mix(princeCloth,princeMint,princeMotif*.85);
princeCloth=mix(princeCloth,princeRose,princeTrim);
diffuseColor.rgb=princeCloth;`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor=mix(roughnessFactor,.38,princeTrim);`)
          .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor=mix(metalnessFactor,.6,princeTrim);`);
      };
      tunic.customProgramCacheKey = () => 'river-oaks-prince-cream-tunic-v1';
      model.traverse(item => {
        if (!item.isMesh || item.material !== material) return;
        const { geometry } = labelGarmentPieces(item, piece => piece.box.max.y > 1.5 ? 1 : 0);
        owned.add(geometry); item.geometry = geometry; item.material = tunic; pieceClones.push(item);
      });
    } else if (/shoes/i.test(name)) {
      // The boots become bare feet under rose-gold sandal straps: the boot body
      // takes the skin tone, the shaft continues the pink trousers, the laces
      // read as the straps' sole bands. No boot texture remains.
      const sandal = surface({ color: '#ffffff', roughness: 0.55, metalness: 0 });
      sandal.name = 'Prince Jev sandal feet';
      sandal.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
attribute float garment;varying float vGarment;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vGarment=garment;`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying float vGarment;`).replace('#include <map_fragment>', `#include <map_fragment>
float princeStrap=step(1.5,vGarment),princeShaft=step(.5,vGarment)*(1.-princeStrap);
diffuseColor.rgb=mix(mix(vec3(.886,.69,.557),vec3(.831,.333,.478),princeShaft),vec3(.722,.435,.271),princeStrap);`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor=mix(roughnessFactor,.38,princeStrap);`)
          .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor=mix(metalnessFactor,.6,princeStrap);`);
      };
      sandal.customProgramCacheKey = () => 'river-oaks-prince-sandal-v1';
      model.traverse(item => {
        if (!item.isMesh || item.material !== material) return;
        const { geometry } = labelGarmentPieces(item, piece => piece.count <= 60 ? 2 : piece.box.max.y > 0.15 ? 1 : 0);
        owned.add(geometry); item.geometry = geometry; item.material = sandal; pieceClones.push(item);
      });
    } else if (/^(young|middleage|old)_/.test(name)) {
      if(skinTexture)material.map=skinTexture;
      material.color.set(skinTexture?'#fff3ec':PRINCE_PALETTE.skin);
      material.roughness = 0.6; material.envMapIntensity = 0.5;
    } else if (/^eyelashes|^eyebrow/.test(name)) {
      // These fine alpha cards need soft edges at portrait distance. The
      // resident cutout threshold makes lashes look like solid triangles.
      material.transparent=true;material.depthWrite=false;material.alphaTest=.02;
      model.traverse(item=>{if(item.isMesh&&item.material===material)item.castShadow=false;});
    } else if (/^short/.test(name)) {
      // Caramel curls: the strand map keeps its light and dark strands, remapped
      // between a deep caramel and a golden highlight. The hairstyle mesh gains a
      // little volume about the skull on a private clone (no curl mesh exists).
      material.color.set(PRINCE_PALETTE.hair);
      material.roughness = 0.58; material.alphaTest = 0.35;
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
float strand=clamp(dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722))*3.2,0.,1.);
diffuseColor.rgb=mix(diffuse*.4,vec3(.816,.627,.376),pow(strand,.62));
#endif`);
      };
      material.customProgramCacheKey = () => 'river-oaks-prince-caramel-v1';
      model.traverse(item => {
        if (!item.isMesh || item.material !== material) return;
        const geometry = item.geometry.clone(), { position } = geometry.attributes, box = new THREE.Box3().setFromBufferAttribute(position), centre = box.getCenter(new THREE.Vector3());
        centre.y = box.min.y + (box.max.y - box.min.y) * 0.45;
        for (let i = 0; i < position.count; i++) position.setXYZ(i, centre.x + (position.getX(i) - centre.x) * 1.06, centre.y + (position.getY(i) - centre.y) * 1.06, centre.z + (position.getZ(i) - centre.z) * 1.06);
        position.needsUpdate = true; geometry.computeBoundingSphere(); owned.add(geometry); item.geometry = geometry; pieceClones.push(item);
      });
    } else if (name === 'brown') {
      // Blue eyes: the iris (saturated, mid-dark) shifts toward blue; the
      // sclera (bright, unsaturated) and the pupil (dark) keep the atlas.
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
float irisLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
float irisSaturation=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b))-min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b));
float iris=smoothstep(.05,.18,irisSaturation)*(1.-smoothstep(.55,.8,irisLuma))*smoothstep(.04,.12,irisLuma);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.31,.525,.776)*mix(.55,1.25,irisLuma),iris);`);
      };
      material.customProgramCacheKey = () => 'river-oaks-prince-blue-eyes-v1';
    }
    material.needsUpdate = true;
  }

  model.updateMatrixWorld(true); root.updateMatrixWorld(true);
  const restOf = name => root.worldToLocal(model.getObjectByName(name).getWorldPosition(new THREE.Vector3()));
  const attach = name => {
    const bone = model.getObjectByName(name), group = new THREE.Group();
    const rest = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    root.add(group); attachments.push({ bone, group, rest, origin: restOf(name) }); return attachments.at(-1);
  };
  const mesh = (slot, geometry, material, position, rotation = [0, 0, 0], scale = [1, 1, 1]) => {
    owned.add(geometry);
    const object = new THREE.Mesh(geometry, material);
    object.position.copy(new THREE.Vector3().fromArray(position).sub(slot.origin));
    object.rotation.set(...rotation, 'YXZ'); object.scale.fromArray(scale);
    object.castShadow = object.receiveShadow = true; slot.group.add(object); return object;
  };
  // Accessories are batched per bone and material, so the fit records keep the
  // bone's attachment group and the limb profile rather than individual meshes.
  const fitted = { torso: null, waist: null, bracers: [], calves: [], feet: [] };

  // Belt: a flat rose-gold band seated on the tunic at the waist, with an
  // ornamental lozenge buckle at the front.
  const torso = measureTorso(avatar.rig, root);
  if (torso) {
    const waist = attach('spine_01'), belt = waist.origin.y + 0.02, count = 96;
    fitted.torso = torso; fitted.waist = { slot: waist, height: belt };
    const centres = Array.from({ length: count }, (_, i) => ({ point: torso.surface(i / count * Math.PI * 2, belt, 0.012), across: new THREE.Vector3(0, 1, 0) }));
    mesh(waist, strap(centres, 0.046, torso.project, 0.012, true), roseGold, [0, 0, 0]).name = 'Prince Jev belt';
    const front = torso.surface(0, belt, 0.018).toArray();
    const frame = new THREE.ExtrudeGeometry(lozenge(0.05, 0.034), { depth: 0.006, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 1 });
    mesh(waist, frame, roseGold, front).name = 'Prince Jev buckle';
    const inner = surface({ color: '#8f5636', metalness: 0.6, roughness: 0.42, side: THREE.DoubleSide }); inner.name = 'Prince Jev buckle relief';
    mesh(waist, new THREE.ExtrudeGeometry(lozenge(0.034, 0.021), { depth: 0.004, bevelEnabled: false }), inner, [front[0], front[1], front[2] + 0.006]);
    mesh(waist, new THREE.ExtrudeGeometry(lozenge(0.016, 0.01), { depth: 0.004, bevelEnabled: false }), roseGold, [front[0], front[1], front[2] + 0.01]);
  }

  // Bracers: open rose-gold cuffs fitted to each sleeve from the wrist up the
  // forearm, engraved with mint lines; the opening faces the inner arm.
  for (const name of ['lowerarm_l', 'lowerarm_r']) {
    const limb = measureLimb(avatar.rig, root, name); if (!limb) continue;
    const slot = attach(name), rings = 7, segments = 40, low = limb.length * 0.56, high = limb.length * 0.98;
    const positions = [], uvs = [], indices = [];
    for (let r = 0; r <= rings; r++) {
      const t = low + (high - low) * r / rings, flare = r === 0 || r === rings ? 0.004 : 0.0045;
      for (let s = 0; s <= segments; s++) {
        const angle = Math.PI * 0.12 + s / segments * Math.PI * 1.76, point = limb.surface(angle, t, flare);
        positions.push(...point.toArray()); uvs.push(s / segments * 3, r / rings);
        if (r < rings && s < segments) { const a = r * (segments + 1) + s; indices.push(a, a + 1, a + segments + 1, a + 1, a + segments + 2, a + segments + 1); }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const bracer = mesh(slot, geometry, bracerMetal, [0, 0, 0]); bracer.name = `Prince Jev bracer ${name.endsWith('_l') ? 'left' : 'right'}`;
    fitted.bracers.push({ bone: name, limb, slot, low, high });
  }

  // Sandals: rose-gold straps criss-crossing up each shin over the trousers,
  // with an ankle band and a top cuff below the knee; a toe strap and heel
  // band over the bare foot.
  for (const [calfName, footName] of [['calf_l', 'foot_l'], ['calf_r', 'foot_r']]) {
    const limb = measureLimb(avatar.rig, root, calfName); if (!limb) continue;
    const slot = attach(calfName), ankle = limb.length * 0.9, knee = limb.length * 0.26, width = 0.016;
    const helix = (sign, turns) => Array.from({ length: 73 }, (_, i) => {
      const f = i / 72, t = ankle + (knee - ankle) * f, angle = sign * (Math.PI * 2 * turns * f) + Math.PI / 2;
      const point = limb.surface(angle, t, 0.007), next = limb.surface(sign * (Math.PI * 2 * turns * (f + 0.01)) + Math.PI / 2, t + (knee - ankle) * 0.01, 0.007);
      const tangent = next.sub(point).normalize(), outward = point.clone().sub(limb.origin.clone().addScaledVector(limb.axis, t)).normalize();
      return { point, across: new THREE.Vector3().crossVectors(outward, tangent).normalize() };
    });
    fitted.calves.push({ bone: calfName, limb, slot, ankle, knee });
    for (const sign of [1, -1]) mesh(slot, strap(helix(sign, 2.25), width, limb.project, 0.007), roseGold, [0, 0, 0]).name = `Prince Jev sandal strap ${calfName}`;
    for (const [t, cuff] of [[ankle, 0.022], [knee, 0.026]]) {
      const ring = Array.from({ length: 64 }, (_, i) => ({ point: limb.surface(i / 64 * Math.PI * 2, t, 0.007), across: limb.axis.clone() }));
      mesh(slot, strap(ring, cuff, limb.project, 0.007, true), roseGold, [0, 0, 0]).name = `Prince Jev sandal cuff ${calfName}`;
    }
    const foot = attach(footName), o = foot.origin, side = footName.endsWith('_l') ? 1 : -1;
    fitted.feet.push({ bone: footName, slot: foot });
    const toe = new THREE.TorusGeometry(0.052, 0.004, 6, 32, Math.PI * 1.15);
    mesh(foot, toe, roseGold, [o.x, 0.022, o.z + 0.12], [0, 0, -Math.PI * 0.075], [1.15, 1, 1]).name = `Prince Jev toe strap ${footName}`;
    mesh(foot, new THREE.TorusGeometry(0.058, 0.004, 6, 32), roseGold, [o.x + side * 0.002, 0.068, o.z + 0.008], [Math.PI / 2, 0, 0], [1.05, 1, 0.78]).name = `Prince Jev heel band ${footName}`;
  }

  batchCostumeAttachments(attachments, owned);
  const shoppingBag=createPrinceShoppingBag(avatar);
  const position = new THREE.Vector3(), orientation = new THREE.Quaternion(), inverseOrientation = new THREE.Quaternion();
  return {
    get materials() { return [...owned].filter(item => item.isMaterial); },
    get bag() { return shoppingBag.object; },
    // The fitted accessories and their limb measurements, for tests and fixtures.
    get fitted() { return fitted; },
    get garmentClones() { return pieceClones; },
    update({carrying=false}={}) {
      root.updateWorldMatrix(true, true);
      inverseOrientation.copy(root.getWorldQuaternion(orientation)).invert();
      for (const item of attachments) {
        item.bone.getWorldPosition(position); item.group.position.copy(root.worldToLocal(position));
        item.bone.getWorldQuaternion(orientation); item.group.quaternion.copy(inverseOrientation).multiply(orientation).multiply(item.rest);
      }
      shoppingBag.update(carrying);
    },
    // No refractive gems remain on this costume; the hook stays for the driver.
    updateOptics() {},
    dispose() { shoppingBag.dispose();attachments.forEach(({ group }) => group.removeFromParent()); owned.forEach(item => item.dispose()); },
  };
}
