// Export the Ribbonwing (#777) as a loader-compatible GLB from its editable source
// (preview/src/ribbonwing-design.js + ribbonwing.js), then load it back with three's
// GLTFLoader and check it is the same craft: every LOD level's triangles, every material,
// the named attachments, colliders and mechanism pivots. Writes the GLB and a manifest
// (hashes, counts, source hashes) to <outDir>. The game still builds the craft from source;
// the GLB is the interchange copy for DCC tools and other runtimes.
//
// The procedural micro-detail DataTexture is left out (GLTFExporter needs a DOM canvas to
// encode images); every other material factor is exported. The manifest records this.
// GLTFLoader sanitizes node names ("lod:near" becomes "lodnear") but keeps the original in
// userData.name, which is what an importer should match.
//
//   node scripts/ribbonwing/export-glb.mjs <outDir>
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createRibbonwing } from '../../preview/src/ribbonwing.js';
import { RIBBONWING_VERSION, ATTACHMENTS, COLLIDERS } from '../../preview/src/ribbonwing-design.js';

// GLTFExporter's binary path reads its Blob through FileReader, which Node lacks.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result;this.onloadend?.({ target: this });this.onload?.({ target: this }); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(result).toString('base64')}`;this.onloadend?.({ target: this });this.onload?.({ target: this }); }); }
};

const root = fileURLToPath(new URL('../../', import.meta.url));
const outDir = process.argv[2];
if (!outDir) { console.error('usage: node scripts/ribbonwing/export-glb.mjs <outDir>');process.exit(2); }
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const triangles = object => { let n = 0;object.traverse(mesh => { if (mesh.isMesh) { const g = mesh.geometry;n += (g.index ? g.index.count : g.attributes.position.count) / 3; } });return n; };
const nameOf = node => node.userData?.name ?? node.name;
const byName = (object, name) => { let found = null;object?.traverse(node => { if (!found && nameOf(node) === name) found = node; });return found; };
const names = (object, prefix) => { const out = [];object?.traverse(node => { if (nameOf(node).startsWith(prefix)) out.push(nameOf(node)); });return out.sort(); };
const materialNames = object => { const set = new Set();object.traverse(mesh => { if (mesh.isMesh) for (const m of [mesh.material].flat()) set.add(m.name); });return [...set].sort(); };

const plainData = value => {
  if (value === null || ['number', 'string', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) { const items = value.map(plainData);return items.some(item => item === undefined) ? undefined : items; }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return undefined;
  const out = {};for (const [key, item] of Object.entries(value)) { const kept = plainData(item);if (kept !== undefined) out[key] = kept; }
  return Object.keys(out).length ? out : undefined;
};
const craft = createRibbonwing();
// The export root holds each LOD level as a named child, all visible, so a DCC tool sees
// every level; the game's THREE.LOD is rebuilt from these names on import.
const scene = new THREE.Scene();scene.name = `Ribbonwing ${RIBBONWING_VERSION}`;
const exportRoot = new THREE.Group();exportRoot.name = 'Ribbonwing';scene.add(exportRoot);
const levels = {};
for (const [level, object] of Object.entries(craft.levels)) {
  const copy = object.clone(true);copy.name = `lod:${level}`;copy.visible = true;
  // userData holds runtime handles (the ladder's rail groups and the like); only plain
  // data goes to extras, or the GLB would carry whole serialized objects with random uuids.
  // clone() deep-copies userData through JSON, so filter from the source nodes (same order).
  const sourceNodes = [], copyNodes = [];object.traverse(node => sourceNodes.push(node));copy.traverse(node => copyNodes.push(node));
  copyNodes.forEach((node, i) => { node.userData = plainData(sourceNodes[i].userData) ?? {}; });
  copy.traverse(node => { if (node.isMesh) { node.material = [node.material].flat().map(m => { const c = m.clone();for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'bumpMap', 'aoMap']) c[key] = null;return c; });if (node.material.length === 1) node.material = node.material[0]; } });
  exportRoot.add(copy);levels[level] = triangles(object);
}
for (const [name, anchor] of craft.attachments) { const a = new THREE.Object3D();a.name = `attach:${name}`;a.position.copy(anchor.position);exportRoot.add(a); }
// Colliders are data (COLLIDERS): each becomes an empty named node with its shape in extras.
const colliderNames = [];
for (const { name, capsule, box } of COLLIDERS.body) {
  const node = new THREE.Object3D();node.name = `collider:${name}`;colliderNames.push(node.name);
  node.userData = capsule ? { shape: 'capsule', from: capsule[0], to: capsule[1], radius: capsule[2] } : { shape: 'box', center: box[0], halfExtents: box[1] };
  exportRoot.add(node);
}
// Mechanism pivots (the rig's handles) in the near level, by name.
const nearPivots = [];
for (const list of Object.values(craft.pivots)) for (const item of list) { const group = item.group ?? item;let up = group;while (up && up !== craft.levels.near) up = up.parent;if (up && group.name) nearPivots.push(group.name); }
scene.updateMatrixWorld(true);

const glb = Buffer.from(await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: false }));
await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}/ribbonwing.glb`, glb);

// Load it back and compare with the source craft.
const loaded = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
const back = byName(loaded.scene, 'Ribbonwing');
const problems = [];
const loadedLevels = {};
for (const level of Object.keys(levels)) {
  const node = byName(back, `lod:${level}`);loadedLevels[level] = node ? triangles(node) : 0;
  if (loadedLevels[level] !== levels[level]) problems.push(`lod ${level}: ${loadedLevels[level]} triangles, source ${levels[level]}`);
}
const attachments = names(back, 'attach:').map(name => name.slice(7));
for (const name of Object.keys(ATTACHMENTS)) if (!attachments.includes(name)) problems.push(`attachment ${name} missing`);
for (const [name, anchor] of craft.attachments) {
  const node = byName(back, `attach:${name}`);
  if (node && node.position.distanceTo(anchor.position) > 1e-5) problems.push(`attachment ${name} moved ${node.position.distanceTo(anchor.position)}`);
}
const sourceMaterials = materialNames(craft.levels.near), loadedMaterials = materialNames(byName(back, 'lod:near') ?? loaded.scene);
for (const name of sourceMaterials) if (!loadedMaterials.includes(name)) problems.push(`material ${name} missing`);
const sourcePivots = [...new Set(nearPivots)].sort(), loadedNear = byName(back, 'lod:near');
for (const name of sourcePivots) if (!byName(loadedNear, name)) problems.push(`pivot ${name} missing`);
const loadedColliders = names(back, 'collider:');
if (JSON.stringify(loadedColliders) !== JSON.stringify([...colliderNames].sort())) problems.push(`colliders differ: ${loadedColliders.length} of ${colliderNames.length}`);
for (const { name, capsule } of COLLIDERS.body) if (capsule && byName(back, `collider:${name}`)?.userData.radius !== capsule[2]) problems.push(`collider ${name} lost its shape`);

const sources = {};
for (const file of ['preview/src/ribbonwing-design.js', 'preview/src/ribbonwing.js', 'preview/src/ribbonwing-rig.js', 'scripts/ribbonwing/export-glb.mjs']) sources[file] = sha(await readFile(`${root}${file}`));
const manifest = {
  schemaVersion: 1, version: RIBBONWING_VERSION, three: THREE.REVISION,
  glb: { path: 'ribbonwing.glb', bytes: glb.length, sha256: sha(glb) },
  levels, loadedLevels, attachments, materials: sourceMaterials, pivots: sourcePivots, colliders: colliderNames,
  omitted: ['procedural micro-detail DataTexture (normal/roughness); rebuilt by ribbonwing.js at runtime'],
  sources, roundTrip: problems.length ? 'failed' : 'passed', problems,
};
await writeFile(`${outDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
craft.dispose();
console.log(JSON.stringify({ bytes: glb.length, sha256: manifest.glb.sha256, levels, loadedLevels, attachments: attachments.length, materials: sourceMaterials.length, pivots: sourcePivots.length, colliders: colliderNames.length, problems }));
if (problems.length) process.exit(1);
