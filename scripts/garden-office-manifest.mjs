// Measures the Garden Office pilot forms (#416) from the real Studio renderer and
// prints their catalog records; `--write` refreshes docs/design/garden-office/asset-manifest.json.
// preview/tests/studio-garden-office.test.js fails when the records and the code disagree.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createSpaceScene } from '../preview/src/studio/space-scene.js';
import { disposeStudioScene } from '../preview/src/studio/scene.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = 'docs/design/garden-office/asset-manifest.json';
export const FORMS = [
  { id: 'studio-desk-workstation', kind: 'desk', nominal: { width: 1.8, depth: .8, height: .76 }, finish: 'oak',
    resize: 'Any v1 width, depth and height. Top 25 mm, legs 40 mm square and rails keep metric sections; a back modesty panel appears when the legs exceed 0.45 m.',
    materialSlots: { top: 'object finish', frame: 'charcoal' }, approach: 'Seated side is the local +z edge; the office places each chair 1 m south of its desk.' },
  { id: 'studio-chair-side', kind: 'chair', nominal: { width: .6, depth: .65, height: .85 }, finish: 'charcoal',
    resize: 'Any v1 size. Seat height is min(0.47 m, 55% of height); legs keep a 17 mm turned section; the back leans 8° and stays inside the footprint; no back below 8 cm.',
    materialSlots: { upholstery: 'object finish', timber: 'oak, or walnut when the finish is walnut' }, approach: 'Sitter enters from the local +z edge; the back is the local -z edge.' },
  { id: 'studio-pendant-linear', kind: 'pendant', nominal: { width: 2.4, depth: .22, height: .3 }, finish: 'brass',
    resize: 'Used when the long side is at least twice the short side: an 80 mm body along the long side on two cables; otherwise the round variant.',
    materialSlots: { body: 'object finish', cables: 'charcoal', diffuser: 'shared emissive lamp' }, approach: 'Overhead; does not block walking.' },
  { id: 'studio-pendant-round', kind: 'pendant', nominal: { width: .45, depth: .45, height: .35 }, finish: 'brass',
    resize: 'Used below a 2:1 footprint: an open shade sized by the short side, at most 0.35 m tall, on one cord.',
    materialSlots: { shade: 'object finish', cord: 'charcoal', diffuser: 'shared emissive lamp' }, approach: 'Overhead; does not block walking.' },
  { id: 'studio-plant-potted', kind: 'plant', nominal: { width: .55, depth: .55, height: 1.25 }, finish: 'terracotta',
    resize: 'Any v1 size. Round within the shorter side; the pot is 32% of the height (at most 0.42 m); 30–50 leaves per cluster keep the canopy full on tall plants; works from a 0.3 m table vase up.',
    materialSlots: { pot: 'object finish', soil: 'walnut', stems: 'walnut', foliage: 'shared double-sided leaf green' }, approach: 'Blocks walking like other furniture when standing on the floor.' },
];

// `|| 0` turns -0 into 0, which is what JSON stores.
const round = value => Math.round(value * 1000) / 1000 || 0;
export async function measureForms() {
  const file = 'preview/src/studio/space-furniture.js';
  const sha256 = createHash('sha256').update(await readFile(new URL(`../${file}`, import.meta.url))).digest('hex');
  return FORMS.map(form => {
    const item = { id: form.id, kind: form.kind, label: form.id, east: 0, north: 0, yaw: 0, elevation: 0, finish: form.finish, ...form.nominal };
    const scene = createSpaceScene({ schema_version: 1, document_type: 'studio-space', name: 'Catalog', lighting: 'daylight', bounds_m: [-6,-6,6,6], spawn: [0,-5], objects: [item] });
    scene.group.updateMatrixWorld(true);
    const box = new THREE.Box3(), point = new THREE.Vector3();
    let meshNodes = 0, triangles = 0;
    scene.items.get(form.id).traverse(child => {
      if (!child.isMesh) return;
      meshNodes++;
      const geometry = child.geometry, positions = geometry.attributes.position;
      triangles += (geometry.index ? geometry.index.count : positions.count) / 3;
      for (let index = 0; index < positions.count; index++) box.expandByPoint(point.fromBufferAttribute(positions, index).applyMatrix4(child.matrixWorld));
    });
    disposeStudioScene(scene.group);
    const { nominal, finish, ...record } = form;
    return { ...record, version: 1, source: 'procedural', file, sha256, nominal, finishUsedForMeasure: finish,
      bounds: [box.min.toArray().map(round), box.max.toArray().map(round)],
      axes: 'object frame at yaw 0: x east / y up / z south; pivot at the floor centre of the footprint',
      collision: 'v1 footprint rectangle (width × depth); blocks walking when elevation < 1.8 m and the top is above 0.25 m',
      cost: { meshNodes, triangles, textures: 'none of its own; stone finishes reuse the shared PBR set' },
      stage: 'procedural-pilot', availability: 'repository',
      permission: 'Original geometry authored in this repository for #416; no third-party source.' };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const assets = await measureForms();
  const manifest = { packet: 'garden-office', schemaVersion: 1, issue: 416, threeAxes: 'x east / y up / z south', assets };
  if (process.argv.includes('--write')) {
    await writeFile(`${root}${manifestPath}`, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Wrote ${manifestPath} (${assets.length} records).`);
  } else console.log(JSON.stringify(manifest, null, 2));
}
