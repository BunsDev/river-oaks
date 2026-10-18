// Reimport of #362's committed asset package (assets/office-penthouse/), read straight from the GLB
// containers: names, LODs, collision proxies, anchors, applied transforms, outward normals, embedded
// images and the manifest's hashes and counts. The browser reimport (GLTFLoader, textures decoded)
// runs in scripts/export-office-penthouse.mjs and is recorded in export.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { OFFICE_LAYOUT_PENTHOUSE, officeLayout } from '../../preview/src/office-layouts.js';
import { PENTHOUSE_ASSETS, SCREEN_DYNAMIC, penthouseAssetParts, penthousePlacements } from '../../preview/src/office-penthouse-furnishings.js';
import { penthousePlanDigest, validateAssetManifest, readPacket } from '../office-ipic-reference-index.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const PACKAGE = `${ROOT}assets/office-penthouse`;
const manifest = JSON.parse(readFileSync(`${ROOT}docs/design/office-ipic/asset-manifest.json`, 'utf8'));
const entry = id => manifest.assets.find(a => a.id === id);
const layout = officeLayout(OFFICE_LAYOUT_PENTHOUSE);

// A GLB's JSON and binary chunks, and typed views of its accessors.
function readGlb(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${path} is a GLB`);
  assert.equal(bytes.readUInt32LE(4), 2, 'glTF 2.0');
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8, bin = bytes.subarray(binStart, binStart + bytes.readUInt32LE(20 + jsonLength));
  const accessor = index => {
    const a = json.accessors[index], view = json.bufferViews[a.bufferView], size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
    const offset = bin.byteOffset + (view.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = view.byteStride ? view.byteStride / Type.BYTES_PER_ELEMENT : size;
    const raw = new Type(bin.buffer, offset, (a.count - 1) * stride + size), out = new Type(a.count * size);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) out[i * size + k] = raw[i * stride + k];
    return { ...a, data: out, size };
  };
  const image = index => { const im = json.images[index], view = json.bufferViews[im.bufferView]; return { mimeType: im.mimeType, bytes: bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength) }; };
  return { bytes, json, accessor, image };
}
const named = (glb, name) => glb.json.nodes.find(node => node.name === name);
// A JPEG's pixel size, from its start-of-frame marker.
function jpegSize(bytes) {
  for (let i = 2; i < bytes.length;) {
    const marker = bytes.readUInt16BE(i), length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffc3) return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
    i += 2 + length;
  }
  return null;
}
const descendants = (glb, node) => (node.children ?? []).flatMap(i => [glb.json.nodes[i], ...descendants(glb, glb.json.nodes[i])]);
const triangles = (glb, nodes) => nodes.filter(n => n.mesh !== undefined).reduce((sum, n) => sum + glb.json.meshes[n.mesh].primitives.reduce((s, p) => s + (p.indices !== undefined ? glb.json.accessors[p.indices].count : glb.json.accessors[p.attributes.POSITION].count) / 3, 0), 0);
// Share of triangles whose winding agrees with their vertex normals (outward for closed solids).
function windingAgreement(glb, primitive) {
  const position = glb.accessor(primitive.attributes.POSITION).data, normal = glb.accessor(primitive.attributes.NORMAL).data;
  const index = primitive.indices !== undefined ? glb.accessor(primitive.indices).data : null, count = (index ? index.length : position.length / 3) / 3;
  let agree = 0, counted = 0;
  for (let t = 0; t < count; t++) {
    const [a, b, c] = [0, 1, 2].map(k => index ? index[t * 3 + k] : t * 3 + k), p = i => [position[i * 3], position[i * 3 + 1], position[i * 3 + 2]];
    const [pa, pb, pc] = [p(a), p(b), p(c)], u = pb.map((v, i) => v - pa[i]), v = pc.map((w, i) => w - pa[i]);
    const face = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (Math.hypot(...face) < 1e-12) continue; // zero-area (a lathe's axis): no winding to agree with
    const n = [0, 1, 2].map(k => normal[a * 3 + k] + normal[b * 3 + k] + normal[c * 3 + k]);
    counted++; if (face[0] * n[0] + face[1] * n[1] + face[2] * n[2] > 0) agree++;
  }
  return counted ? agree / counted : 1;
}

test('the manifest records the committed package exactly, built against the current plan', () => {
  const { referenceIndex, assetManifest } = readPacket(`${ROOT}docs/design/office-ipic`);
  const { problems } = validateAssetManifest(assetManifest, { root: ROOT, referenceIndex });
  assert.deepEqual(problems, []);
  const own = manifest.assets.filter(a => a.package === 'office-penthouse');
  assert.ok(own.length >= PENTHOUSE_ASSETS.length + 5, 'every asset, the scene, the .blend, three textures and the materials');
  for (const a of own) {
    assert.equal(createHash('sha256').update(readFileSync(`${ROOT}${a.file}`)).digest('hex'), a.sha256, a.file);
    assert.equal(a.planDigest, penthousePlanDigest(layout), `${a.id} plan`);
    for (const field of ['provenance', 'license', 'owner', 'layout', 'layoutVersion', 'version']) assert.ok(a[field], `${a.id} ${field}`);
  }
});

test('every asset GLB reimports with LOD0, LOD1, its COL proxy and anchors, metre-scale and with applied transforms', () => {
  for (const asset of PENTHOUSE_ASSETS) {
    const glb = readGlb(`${PACKAGE}/models/${asset.id}.glb`), record = entry(`repo-penthouse-${asset.id}`);
    const root = named(glb, asset.id);
    assert.ok(root, `${asset.id} root node`);
    for (const name of ['LOD0', 'LOD1', `COL_${asset.id}`, ...asset.anchors]) assert.ok(named(glb, name), `${asset.id} ${name}`);
    const lod0 = descendants(glb, named(glb, 'LOD0')), lod1 = descendants(glb, named(glb, 'LOD1'));
    // Geometry is baked in the asset frame: mesh nodes carry no transform of their own.
    for (const node of [...lod0, ...lod1]) assert.ok(!node.translation && !node.rotation && !node.scale && !node.matrix, `${asset.id} ${node.name} has applied transforms`);
    const [t0, t1] = [triangles(glb, lod0), triangles(glb, lod1)];
    assert.equal(t0, record.triangles, `${asset.id} LOD0 triangles match the manifest`);
    assert.deepEqual(record.lods.map(l => l.triangles), [t0, t1]);
    assert.equal(t0, penthouseAssetParts(asset.id, 0).reduce((n, p) => n + p.geometry.attributes.position.count / 3, 0), `${asset.id} matches its JS master`);
    // Metre scale: the LOD0 bounds hold the asset's own footprint and height (a rug is 1 cm thick; a
    // canopy rises above its planter), never centimetres or millimetres read as metres.
    const [min, max] = record.bounds, size = max.map((v, i) => v - min[i]), [w, l, h] = asset.size;
    assert.ok(size.every(v => v >= 0.005) && Math.max(...size) <= Math.max(w, l, h) + 6, `${asset.id} bounds ${size.map(v => v.toFixed(3))} m`);
    for (const node of lod0.filter(n => n.mesh !== undefined)) for (const primitive of glb.json.meshes[node.mesh].primitives) {
      const material = glb.json.materials[primitive.material];
      if (material.doubleSided) continue; // leaves, blades and shades are open surfaces
      assert.ok(windingAgreement(glb, primitive) > 0.97, `${asset.id} ${node.name} normals agree with winding`);
    }
  }
});

test('embedded textures are 512 px JPEGs in base-colour slots only, as are the texture files', () => {
  for (const name of ['travertine', 'rose-stone', 'wood']) {
    const bytes = readFileSync(`${PACKAGE}/textures/${name}.jpg`);
    assert.equal(bytes.readUInt16BE(0), 0xffd8, `${name}.jpg is a JPEG`);
    assert.deepEqual(jpegSize(bytes), [512, 512], `${name}.jpg size`);
  }
  for (const asset of PENTHOUSE_ASSETS) {
    const glb = readGlb(`${PACKAGE}/models/${asset.id}.glb`);
    for (const [i] of (glb.json.images ?? []).entries()) {
      const { mimeType, bytes } = glb.image(i);
      assert.equal(mimeType, 'image/jpeg');
      assert.equal(bytes.readUInt16BE(0), 0xffd8, `${asset.id} image ${i} is a JPEG`);
      assert.deepEqual(jpegSize(bytes), [512, 512], `${asset.id} image ${i} size`);
    }
    // A texture is only ever a base-colour map (sRGB); no other slot carries one.
    for (const material of glb.json.materials) for (const slot of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) assert.equal(material[slot], undefined, `${asset.id} ${material.name} ${slot}`);
  }
});

test('the placed office reimports every placement, the plan\'s collision proxies, the screens, seats and lamps', () => {
  const glb = readGlb(`${PACKAGE}/office-penthouse.glb`), names = new Set(glb.json.nodes.map(node => node.name).filter(Boolean));
  const lights = glb.json.extensions?.KHR_lights_punctual?.lights ?? [];
  // The lamps where the GLB put them (their nodes sit directly in the untransformed shell).
  const lamps = glb.json.nodes.filter(node => node.extensions?.KHR_lights_punctual).map(node => {
    const [x, y, z] = node.translation ?? node.matrix.slice(12, 15); // the exporter writes lamps as a matrix
    return { position: { x, y, z } };
  });
  const placements = penthousePlacements(layout, { lights: lamps });
  assert.ok(placements.some(p => p.asset === 'pendant'), 'drums hang at the lamps');
  for (const item of placements) assert.ok(names.has(item.id), item.id);
  for (const level of layout.levels) for (const o of level.obstacles.filter(item => item.kind === 'desk' || item.kind === 'furniture')) assert.ok(names.has(`COL_${o.id}`), `COL_${o.id}`);
  for (const chair of layout.levels[0].chairs) assert.ok(names.has(`COL_${chair.id}`), `COL_${chair.id}`);
  assert.equal([...names].filter(name => name.startsWith('SCREEN:')).length, 11);
  assert.ok(names.has('SEAT_1:lounge-sofa') && names.has('SEAT:lounge-chair-a'));
  const screen = glb.json.materials.find(material => material.name === SCREEN_DYNAMIC);
  assert.ok(screen, 'displays keep the reserved screen material');
  assert.ok(!screen.pbrMetallicRoughness?.baseColorTexture && !screen.emissiveTexture, 'idle screens carry no image');
  assert.equal(lights.length, 5, 'the five office lamps');
  assert.ok(names.has('shell') && names.has('furnishings:main-floor') && names.has('furnishings:terrace') && names.has('furnishings:mezzanine'));
});
