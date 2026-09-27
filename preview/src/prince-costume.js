import * as THREE from 'three';
import { batchCostumeAttachments } from './costume-batching.js';
import { measureHead } from './head-fit.js';
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
// the sash, buttons and belt sit on the cloth for any rig proportions.
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
  // Fill sparse samples from angular neighbours, then from the band below.
  for (let b = 0; b < bands; b++) for (let pass = 0; pass < 6; pass++) for (let a = 0; a < ANGLES; a++) {
    if (radii[b][a]) continue;
    radii[b][a] = Math.max(radii[b][(a + 1) % ANGLES], radii[b][(a + ANGLES - 1) % ANGLES]) || (b ? radii[b - 1][a] : 0);
  }
  // Lapels and pockets make raw maxima jagged; a light blur gives the smooth
  // outer envelope a sewn sash or belt actually follows.
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

function starShape(outer, inner, points) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= points * 2; i++) {
    const r = i % 2 ? inner : outer, a = i / (points * 2) * Math.PI * 2;
    shape[i ? 'lineTo' : 'moveTo'](Math.sin(a) * r, Math.cos(a) * r);
  }
  return shape;
}

// Prince Jev's dress uniform. Shared resident templates are never mutated: the
// avatar already owns cloned materials, and every added resource is disposed.
export function createPrinceCostume(avatar,{skinTexture=null}={}) {
  const { model, materials } = avatar.rig, root = avatar.object;
  const owned = new Set(), attachments = [];
  const surface = parameters => { const material = new THREE.MeshPhysicalMaterial(parameters); owned.add(material); return material; };
  const gold = surface({ color: '#d4a84f', metalness: 1, roughness: 0.24, clearcoat: 0.4, clearcoatRoughness: 0.2 });
  gold.name = 'Prince Jev gold';
  const sapphire = surface({ color: '#1b3fae', roughness: 0.05, metalness: 0.05, clearcoat: 1, ior: 1.77, transmission: 0.2, thickness: 0.01 });
  const ruby = surface({ color: '#a3122e', roughness: 0.06, metalness: 0.05, clearcoat: 1, ior: 1.77 });
  const sashCloth = surface({ color: '#8a1430', roughness: 0.62, sheen: 0.7, sheenColor: new THREE.Color('#ff8fa6'), sheenRoughness: 0.45, side: THREE.DoubleSide });
  sashCloth.name = 'Prince Jev royal sash';
  const enamel = surface({ color: '#1d3f9e', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });

  for (const [original, material] of materials) {
    const name = original.name ?? '';
    if (/suit/i.test(name)) {
      // Rose velvet dress tunic; the shirt and collar retain ivory silk.
      const velvet = surface({ map: material.map, normalMap: material.normalMap, color: '#efa1c3', roughness: 0.82, metalness: 0,
        sheen: 0.35, sheenColor: new THREE.Color('#34467e'), sheenRoughness: 0.6 });
      velvet.name = 'Prince Jev rose tunic';
      velvet.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
float clothLuma=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));
float silk=smoothstep(.42,.62,clothLuma);
vec3 rose=diffuse*mix(.55,1.0,pow(clamp(clothLuma,0.,1.),.35));
diffuseColor.rgb=mix(rose,vec3(.93,.9,.84)*mix(.85,1.,clothLuma),silk);
#endif`);
      };
      velvet.customProgramCacheKey = () => 'river-oaks-prince-rose-v2';
      model.traverse(item => { if (item.isMesh && item.material === material) item.material = velvet; });
    } else if (/shoes/i.test(name)) {
      material.color.set('#0b0b0f'); material.roughness = 0.16; material.metalness = 0.05;
    } else if (/^(young|middleage|old)_/.test(name)) {
      if(skinTexture)material.map=skinTexture;
      material.color.set(skinTexture?'#fff3ec':'#efc9b0');
      material.roughness = 0.6; material.envMapIntensity = 0.5;
    } else if (/^eyelashes|^eyebrow/.test(name)) {
      // These fine alpha cards need soft edges at portrait distance. The
      // resident cutout threshold makes lashes look like solid triangles.
      material.transparent=true;material.depthWrite=false;material.alphaTest=.02;
      model.traverse(item=>{if(item.isMesh&&item.material===material)item.castShadow=false;});
    } else if (/^short/.test(name)) {
      material.color.set('#d8b56a');
      material.roughness = 0.42; material.alphaTest = 0.35;
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
float strand=clamp(dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722))*3.2,0.,1.);
diffuseColor.rgb=diffuse*mix(.45,1.05,pow(strand,.5));
#endif`);
      };
      material.customProgramCacheKey = () => 'river-oaks-prince-blonde-v2';
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

  // Coronet: a gold band with alternating fleur points and a front sapphire.
  const head = attach('head'), fit = measureHead(avatar.rig);
  // Fit around the actual hairstyle; Owen's taller fringe extends beyond the
  // skull and must not slice through the gold band.
  const headOrigin = head.origin, radius = Math.max(fit.skull.radius,fit.hair.radius) + 0.01, oval = 1;
  const [hx, hz] = fit.hair.centre, band = fit.hair.top - 0.064;
  const at = (angle, r, y) => [headOrigin.x + hx + Math.sin(angle) * r * oval, headOrigin.y + y, headOrigin.z + hz + Math.cos(angle) * r];
  for (const [y, tube] of [[band, 0.0032], [band + 0.02, 0.0024]]) mesh(head, new THREE.TorusGeometry(radius, tube, 8, 72), gold, at(0, 0, y), [Math.PI / 2, 0, 0], [oval, 1, 1]);
  mesh(head, new THREE.CylinderGeometry(radius, radius, 0.02, 72, 1, true), gold, at(0, 0, band + 0.01), [0, 0, 0], [oval, 1, 1]);
  for (let i = 0; i < 10; i++) {
    const angle = i / 10 * Math.PI * 2, fleur = i % 2 === 0, height = (fleur ? 0.038 : 0.022) * (1 + 0.25 * Math.max(0, Math.cos(angle)));
    mesh(head, new THREE.ConeGeometry(fleur ? 0.0075 : 0.005, height, 10), gold, at(angle, radius, band + 0.02 + height / 2), [0, angle, 0]);
    mesh(head, new THREE.SphereGeometry(fleur ? 0.0052 : 0.0034, 12, 8), fleur ? gold : ruby, at(angle, radius, band + 0.02 + height));
    mesh(head, new THREE.SphereGeometry(0.0034, 10, 8), ruby, at(angle + Math.PI / 10, radius + 0.002, band + 0.01));
  }
  mesh(head, new THREE.OctahedronGeometry(0.0085, 1), sapphire, at(0, radius + 0.004, band + 0.012), [0, 0, 0], [0.8, 1.15, 0.55]);

  // Tunic fittings: sash, belt, double-breasted buttons and a star of order.
  const torso = measureTorso(avatar.rig, root);
  if (torso) {
    const chest = attach('spine_03'), waist = attach('spine_01');
    // A shoulder-to-hip sash on a tilted loop. Edges are offset across the
    // band (not merely vertically) and re-seated on the cloth at their height.
    const high = torso.top - 0.1, low = torso.bottom + 0.17, mid = (high + low) / 2, amp = (high - low) / 2;
    const count = 144, width = 0.068, positions = [], uvs = [], indices = [];
    const loop = t => { const angle = t * Math.PI * 2; return torso.surface(angle, mid - amp * Math.sin(angle), 0.014); };
    for (let i = 0; i <= count; i++) {
      const centre = loop(i / count), tangent = loop((i + 1) / count).sub(loop((i - 1) / count)).normalize();
      const outward = new THREE.Vector3(Math.sin(i / count * Math.PI * 2), 0, Math.cos(i / count * Math.PI * 2));
      const across = new THREE.Vector3().crossVectors(outward, tangent).normalize();
      for (const edge of [-width / 2, width / 2]) { positions.push(...torso.project(centre.clone().addScaledVector(across, edge), 0.014).toArray()); uvs.push(i / count * 12, edge > 0 ? 1 : 0); }
      if (i < count) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const ribbon = new THREE.BufferGeometry();
    ribbon.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); ribbon.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); ribbon.setIndex(indices); ribbon.computeVertexNormals();
    mesh(chest, ribbon, sashCloth, [0, 0, 0]);
    // A gathered knot where the sash meets at the hip.
    const knot = loop(0.25).toArray();
    mesh(chest, new THREE.SphereGeometry(0.03, 20, 14), sashCloth, knot, [0, Math.PI / 2, 0], [1, 1.2, 0.45]);
    mesh(chest, new THREE.OctahedronGeometry(0.009, 1), sapphire, [knot[0] + 0.014, knot[1], knot[2]]);
    const belt = waist.origin.y + 0.02, beltPoints = Array.from({ length: 97 }, (_, i) => torso.surface(i / 96 * Math.PI * 2, belt, 0.008));
    mesh(waist, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(beltPoints, true), 96, 0.006, 6, true), gold, [0, 0, 0]);
    const buckle = torso.surface(0, belt, 0.012).toArray();
    mesh(waist, new THREE.BoxGeometry(0.05, 0.036, 0.008), gold, buckle);
    mesh(waist, new THREE.OctahedronGeometry(0.008, 1), sapphire, [buckle[0], buckle[1], buckle[2] + 0.006]);
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      const angle = side * 0.3, y = belt + 0.07 + i * (high - 0.12 - belt - 0.07) / 4;
      mesh(chest, new THREE.SphereGeometry(0.0085, 14, 10), gold, torso.surface(angle, y, 0.006).toArray(), [0, angle, 0], [1, 1, 0.45]);
    }
    const starAngle = 0.62, star = torso.surface(starAngle, high - 0.14, 0.012).toArray();
    const starGeometry = new THREE.ExtrudeGeometry(starShape(0.034, 0.014, 8), { depth: 0.004, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 1 });
    mesh(chest, starGeometry, gold, star, [0, starAngle, 0]);
    mesh(chest, new THREE.CylinderGeometry(0.011, 0.011, 0.004, 24), enamel, [star[0] + Math.sin(starAngle) * 0.006, star[1], star[2] + Math.cos(starAngle) * 0.006], [Math.PI / 2, starAngle, 0]);
  }

  // Epaulettes rest on the shoulder caps and follow each upper arm.
  for (const [side, name] of [[1, 'upperarm_l'], [-1, 'upperarm_r']]) {
    const slot = attach(name), o = slot.origin, top = [o.x - side * 0.018, o.y + 0.074, o.z - 0.004];
    mesh(slot, new THREE.CylinderGeometry(0.05, 0.054, 0.012, 32), gold, top, [0, 0, side * 0.22], [1, 1, 0.78]);
    mesh(slot, new THREE.CylinderGeometry(0.036, 0.036, 0.014, 28), enamel, [top[0], top[1] + 0.004, top[2]], [0, 0, side * 0.22], [1, 1, 0.78]);
    for (let i = 0; i < 16; i++) {
      const a = (i / 15 - 0.5) * Math.PI * 0.95, x = top[0] + side * (0.046 * Math.cos(a) + 0.004), z = top[2] + 0.046 * Math.sin(a) * 0.78;
      mesh(slot, new THREE.CylinderGeometry(0.0028, 0.0022, 0.046, 6), gold, [x, top[1] - 0.026 - 0.004 * Math.cos(a), z], [0, 0, side * 0.1]);
    }
  }

  batchCostumeAttachments(attachments, owned);
  const shoppingBag=createPrinceShoppingBag(avatar);
  const position = new THREE.Vector3(), orientation = new THREE.Quaternion(), inverse = new THREE.Quaternion();
  return {
    get materials() { return [...owned].filter(item => item.isMaterial); },
    get bag() { return shoppingBag.object; },
    update({carrying=false}={}) {
      root.updateWorldMatrix(true, true);
      inverse.copy(root.getWorldQuaternion(orientation)).invert();
      for (const item of attachments) {
        item.bone.getWorldPosition(position); item.group.position.copy(root.worldToLocal(position));
        item.bone.getWorldQuaternion(orientation); item.group.quaternion.copy(inverse).multiply(orientation).multiply(item.rest);
      }
      shoppingBag.update(carrying);
    },
    dispose() { shoppingBag.dispose();attachments.forEach(({ group }) => group.removeFromParent()); owned.forEach(item => item.dispose()); },
  };
}
